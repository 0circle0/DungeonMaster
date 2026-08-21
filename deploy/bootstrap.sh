#!/usr/bin/env bash
# One-time setup for the three dnddungeon.com origins on the host that serves them.
#
# Run on that host, as the deploy user, once:
#   scp deploy/bootstrap.sh <user>@<host>:~/dm-bootstrap.sh
#   ssh <user>@<host> 'bash ~/dm-bootstrap.sh --target-ip <the host LAN address>'
#
# Optionally install the CI deploy key at the same time:
#   bash ~/dm-bootstrap.sh --target-ip <addr> --deploy-key "ssh-ed25519 AAAA...== ci-deploy"
#
# Safe to re-run.
#
# Nothing about the host is baked in. This repository is public, so the address, the user and the
# topology are supplied at run time and live in CI secrets. The only constants below are the three
# site names, their ports, and the layout under /opt.
#
# The three apps are `output: 'export'` Next builds — directories of HTML with no server behind them
# — so this installs no Node and no build toolchain. CI builds the files elsewhere and rsyncs them
# here, and Caddy serves them. Each site gets
#
#   /opt/dungeonmaster/<name>/releases/<timestamp>-<sha>/   one directory per deploy
#
# These origins terminate no TLS and sit behind a reverse proxy that does. They listen on plain HTTP
# on unprivileged ports and match any Host; see the note in step 7.
set -euo pipefail

APP_BASE=/opt/dungeonmaster
CONF_D=/etc/caddy/conf.d
TARGET_IP=""
DEPLOY_KEY=""

# site -> apex, studio -> the authoring editor, play -> the play surface. The port numbers only need
# to be unprivileged and free on the host. They appear in three places that must agree: here, the
# deploy workflow's port list, and the reverse proxy's vhosts.
SITES="site:8081 studio:8082 play:8083"

while [ $# -gt 0 ]; do
  case "$1" in
    --target-ip)  TARGET_IP="${2:-}"; shift 2 ;;
    --deploy-key) DEPLOY_KEY="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1"; exit 1 ;;
  esac
done

[ "$(id -u)" -ne 0 ] || { echo "Run as the deploy user, not root (the script sudos where it needs to)."; exit 1; }
[ -n "$TARGET_IP" ] || { echo "!! --target-ip is required. It is the address CI connects to and health-checks."; exit 1; }

echo "==> 1. Sanity: is this the host you meant?"
# Guards against running this on a laptop by mistake. The address is checked rather than the
# hostname because the address is what CI connects to and what the health check below curls.
if ! ip -4 addr show 2>/dev/null | grep -qw "$TARGET_IP"; then
  echo "!! This host does not hold ${TARGET_IP}. Its addresses are:"
  ip -4 -brief addr show 2>/dev/null || true
  exit 1
fi
echo "   OK: ${TARGET_IP} is local."

echo "==> 2. Pre-flight: are the three ports free (or already ours)?"
for entry in $SITES; do
  PORT="${entry#*:}"
  if sudo ss -tlnp 2>/dev/null | grep -qE ":${PORT}\s"; then
    # Re-running this script is fine; Caddy holding the ports is the expected state.
    if systemctl is-active --quiet caddy; then
      echo "   Caddy already owns :${PORT} (re-run)."
    else
      echo "!! Something other than Caddy already listens on :${PORT}:"
      sudo ss -tlnp | grep ":${PORT}"
      echo "   Pick different ports here, in the deploy workflow and in the reverse proxy."
      exit 1
    fi
  else
    echo "   :${PORT} is free."
  fi
done

echo "==> 3. Caddy"
if ! command -v caddy >/dev/null; then
  echo "   installing from the official apt repo"
  sudo apt-get update
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl gnupg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y caddy
fi
caddy version

echo "==> 4. Directories"
# Caddy runs as the `caddy` user (created by the package) and only needs to read these, so the
# deploy user owns them and the deploy never needs sudo. 755 rather than 750, because `caddy` is not
# in the deploy user's group.
sudo mkdir -p "$APP_BASE"
sudo chown "$USER":"$USER" "$APP_BASE"
chmod 755 "$APP_BASE"
for entry in $SITES; do
  NAME="${entry%%:*}"
  mkdir -p "$APP_BASE/$NAME/releases"
  chmod 755 "$APP_BASE/$NAME" "$APP_BASE/$NAME/releases"
done
echo "    $APP_BASE/{site,studio,play}/releases"

echo "==> 5. Placeholder releases"
# Caddy's file_server resolves `current` per request, and a dangling symlink is an unhelpful error.
# This makes all three serviceable the moment bootstrap finishes.
for entry in $SITES; do
  NAME="${entry%%:*}"
  BASE="$APP_BASE/$NAME"
  if [ ! -e "$BASE/current" ]; then
    PLACEHOLDER="$BASE/releases/00000000T000000Z-bootstrap"
    mkdir -p "$PLACEHOLDER"
    cat > "$PLACEHOLDER/index.html" <<HTML
<!doctype html>
<meta charset="utf-8">
<title>dnddungeon ${NAME} — awaiting first deploy</title>
<body style="font:16px system-ui;max-width:34rem;margin:4rem auto;padding:0 1rem">
<h1>Awaiting first deploy</h1>
<p>Caddy is serving the <code>${NAME}</code> origin correctly. The site itself has not been
deployed yet — push to <code>main</code>, or run the deploy workflow manually.</p>
</body>
HTML
    cp "$PLACEHOLDER/index.html" "$PLACEHOLDER/404.html"
    printf 'bootstrap\n' > "$PLACEHOLDER/build-id"
    # Deliberately not a real hash: the deploy compares this against a sha256 of the app's inputs to
    # decide whether it can skip a build, so a value that cannot be a sha256 guarantees the first
    # deploy after bootstrap builds and ships all three.
    printf 'bootstrap\n' > "$PLACEHOLDER/build-inputs"
    ln -sfn "$PLACEHOLDER" "$BASE/current"
    echo "    $NAME: placeholder installed"
  else
    echo "    $NAME: current -> $(readlink -f "$BASE/current") (left alone)"
  fi
done

echo "==> 6. Split /etc/caddy/Caddyfile into conf.d"
# A single Caddyfile is a trap where more than one project shares a host: another site's setup
# script may overwrite /etc/caddy/Caddyfile wholesale. After this step the file is a stub that
# imports a directory, and each project owns one file in it:
#
#   /etc/caddy/Caddyfile               import /etc/caddy/conf.d/*.caddy
#   /etc/caddy/conf.d/dungeonmaster.caddy   owned by this repo
#   /etc/caddy/conf.d/<other>.caddy         owned by whoever else is on this host
#
# The conversion moves any existing config rather than rewriting it. If another project's setup
# script still writes /etc/caddy/Caddyfile directly, update it to write its own conf.d file and re-
# assert this stub; until then, its next run will drop these sites.
sudo mkdir -p "$CONF_D"

if [ -f /etc/caddy/Caddyfile ]; then
  BACKUP="/etc/caddy/Caddyfile.bak.$(date -u +%Y%m%dT%H%M%SZ)"
  sudo cp /etc/caddy/Caddyfile "$BACKUP"
  echo "    backed up existing config to $BACKUP"

  # Is it still a real config rather than the stub? `import` at the start of a line is the marker;
  # grepping for the bare word would also match a comment mentioning it.
  if ! sudo grep -qE '^\s*import\s' /etc/caddy/Caddyfile; then
    # Only meaningful if the file declares a site. A fresh Caddy install ships a commented-out
    # sample, and preserving that as a neighbour's config would be noise.
    if sudo grep -qE '^\s*[^#[:space:]].*\{\s*$' /etc/caddy/Caddyfile; then
      if [ -f "$CONF_D/existing-site.caddy" ]; then
        echo "    conf.d/existing-site.caddy already present; leaving the old file as backup only"
      else
        sudo cp /etc/caddy/Caddyfile "$CONF_D/existing-site.caddy"
        echo "    moved the pre-existing site config to $CONF_D/existing-site.caddy"
        echo "       (rename it after the fact to whatever that project is called)"
      fi
    else
      echo "    the existing Caddyfile declares no sites; nothing to preserve"
    fi
  else
    echo "    already a stub (conf.d split done previously)"
  fi
fi

sudo tee /etc/caddy/Caddyfile >/dev/null <<'CADDYSTUB'
# This host serves several unrelated static sites, each owned by a different repository, so this
# file contains no site blocks — only the import. Each project's setup script writes its own file
# under conf.d and truncates nothing but its own.
#
# Written by DungeonMaster/deploy/bootstrap.sh, which performed the original split.
#
# A missing conf.d or an empty glob is a Caddy start failure rather than a silent no-op, which is
# intended: an empty config would take every site on this host down while reporting success.
import /etc/caddy/conf.d/*.caddy
CADDYSTUB
echo "    /etc/caddy/Caddyfile is now the import stub"

echo "==> 7. conf.d/dungeonmaster.caddy"
# This file is owned by this repo and the block below overwrites it. Edits made by hand here are
# destroyed the next time this script runs; change it in the repo instead.
#
# Port only — ":8081", not "<ip>:8081" and not "http://<ip>:8081":
#
#   "IP:PORT" enables automatic HTTPS. Caddy v2 turns it on for any site address with a host and a
# port other than 80, including a bare IP, and the origin then serves TLS so every plain-HTTP client
# gets a 400.
#
#   "http://IP:PORT" fixes the scheme but matches on Host. A reverse proxy preserves the original
# Host header, so the front end forwards "play.dnddungeon.com", which matches no site here and
# returns an empty 200.
#
# A bare ":PORT" has no hostname, so there is nothing to request a certificate for and automatic
# HTTPS stays off, and it matches any Host, which is what an origin behind a proxy should do.
#
# These listen on 0.0.0.0. Add `bind <addr>` inside each block for interface-level restriction, at
# the cost of Caddy failing to start at boot before the interface is up.
{
  # Generated rather than written out three times: the blocks differ only in port and root.
  DM_BLOCKS=""
  for entry in $SITES; do
    NAME="${entry%%:*}"; PORT="${entry#*:}"
    DM_BLOCKS="${DM_BLOCKS}
:${PORT} {
	root * ${APP_BASE}/${NAME}/current

	# Plain 200 for "is Caddy alive", independent of whether a release is present. The deploy gates on
	# /build-inputs returning the hash it just shipped instead, because this endpoint stays green
	# across a release that never landed.
	handle /healthz {
		respond \"ok\" 200
	}

	handle {
		encode zstd gzip

		# Next fingerprints everything under /_next/static, so those are safe to cache forever.
		# index.html, build-id and build-inputs must never be cached: a cached index.html points at the
		# previous build's hashed filenames, which the deploy has pruned, and a cached build-inputs would
		# make the deploy skip builds forever.
		@immutable path /_next/static/*
		header @immutable Cache-Control \"public, max-age=31536000, immutable\"
		header /index.html Cache-Control \"no-cache\"
		header /build-id Cache-Control \"no-cache\"
		header /build-inputs Cache-Control \"no-cache\"

		# `output: 'export'` emits /format.html for the route /format, and directories with an index.html
		# for nested ones. Without the .html arm every route but / is a 404. The deploy workflow asserts
		# this against a known deep route.
		try_files {path} {path}.html {path}/index.html
		file_server
	}

	# A real 404 status with the app's own 404 page. Using try_files' last arm instead would serve the
	# 404 page with a 200, which tells a crawler the page exists.
	handle_errors {
		rewrite * /404.html
		file_server
	}
}
"
  done
  # `printf '%s'` without the trailing newline, and `sed 1{/^$/d}` to drop the leading blank line
  # the accumulation starts with. Each block already ends in "}\n", so only the blank first and last
  # lines are wrong. Cosmetic, but without it `caddy validate` warns "Caddyfile input is not
  # formatted" on every run.
  printf '%s' "$DM_BLOCKS" | sed '1{/^$/d}' | sudo tee "$CONF_D/dungeonmaster.caddy" >/dev/null
}
echo "    wrote $CONF_D/dungeonmaster.caddy"

sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

echo "==> 8. Start Caddy"
sudo systemctl enable caddy
sudo systemctl restart caddy
sudo systemctl status caddy 2>&1 | head -12 || true

echo "==> 9. Deploy key"
# CI authenticates as this user with one key. If the connection is a jump through another host, the
# same public key must be in this host's authorized_keys too — being on the jump host is not enough.
mkdir -p "$HOME/.ssh"; chmod 700 "$HOME/.ssh"
touch "$HOME/.ssh/authorized_keys"; chmod 600 "$HOME/.ssh/authorized_keys"
if [ -n "$DEPLOY_KEY" ]; then
  if grep -qF "$DEPLOY_KEY" "$HOME/.ssh/authorized_keys"; then
    echo "    key already authorized"
  else
    printf '%s\n' "$DEPLOY_KEY" >> "$HOME/.ssh/authorized_keys"
    echo "    key added to ~/.ssh/authorized_keys"
  fi
else
  echo "    No --deploy-key given. Fine IF CI already reaches this host for another project."
  # `|| true`, not `|| echo 0`: grep -c already prints "0" before exiting 1 on no match, so the
  # fallback would append a second zero and report "00".
  echo "    Count of keys currently authorized: $(grep -c '^ssh-' "$HOME/.ssh/authorized_keys" || true)"
fi

echo "==> 10. Health check"
for entry in $SITES; do
  NAME="${entry%%:*}"; PORT="${entry#*:}"
  for i in $(seq 1 20); do
    if curl -fsS --max-time 5 "http://${TARGET_IP}:${PORT}/healthz" >/dev/null 2>&1; then
      echo "    $NAME healthy on :${PORT} (after ${i}s)"; break
    fi
    [ "$i" -lt 20 ] || {
      echo "    $NAME NOT healthy on ${TARGET_IP}:${PORT}"
      journalctl -u caddy -n 40 --no-pager || true
      exit 1; }
    sleep 1
  done
done

echo "==> 11. Neighbouring sites still work"
# The split in step 6 moved any pre-existing config to a new path. Saying nothing here would mean a
# broken neighbour is discovered by its users rather than by this script.
OTHERS="$(sudo find "$CONF_D" -name '*.caddy' ! -name 'dungeonmaster.caddy' -printf '%f ' 2>/dev/null || true)"
if [ -n "${OTHERS// /}" ]; then
  echo "    also loaded from conf.d: $OTHERS"
  echo "    Caddy validated the whole config above, but CHECK THOSE SITES BY HAND now --"
  echo "    validation proves they parse, not that they still serve."
  echo "    The pre-split file is in the /etc/caddy/Caddyfile.bak.* backup from step 6."
else
  echo "    none -- this repo is the only thing in conf.d"
fi

echo
echo "==> Done. Origins:"
for entry in $SITES; do
  echo "      ${entry%%:*}	http://${TARGET_IP}:${entry#*:}"
done
echo
echo "    These are plain HTTP and match any Host. Point a TLS-terminating reverse proxy at"
echo "    them: dnddungeon.com -> :8081, studio.dnddungeon.com -> :8082, play.dnddungeon.com -> :8083"
