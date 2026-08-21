#!/usr/bin/env bash
# One-time setup for the three dnddungeon.com origins. Safe to re-run.
#
#   bash ~/dm-bootstrap.sh --target-ip <addr> [--deploy-key "ssh-ed25519 AAAA...== ci-deploy"]
#
# Releases live at /opt/dungeonmaster/<name>/releases/<timestamp>-<sha>/.
set -euo pipefail

APP_BASE=/opt/dungeonmaster
CONF_D=/etc/caddy/conf.d
TARGET_IP=""
DEPLOY_KEY=""

# Ports must agree with the deploy workflow's port list and the reverse proxy's vhosts.
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
# The address CI connects to, checked against this host's own.
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
    # Caddy holding the ports is the expected state on a re-run.
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
# Owned by the deploy user, readable by `caddy`: 755, not 750.
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
# `current` is resolved per request, so it must point somewhere from the start.
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
    # Not a real sha256, so the first deploy after bootstrap always builds.
    printf 'bootstrap\n' > "$PLACEHOLDER/build-inputs"
    ln -sfn "$PLACEHOLDER" "$BASE/current"
    echo "    $NAME: placeholder installed"
  else
    echo "    $NAME: current -> $(readlink -f "$BASE/current") (left alone)"
  fi
done

echo "==> 6. Split /etc/caddy/Caddyfile into conf.d"
# /etc/caddy/Caddyfile becomes a stub that imports /etc/caddy/conf.d/*.caddy, one file per project.
# Any existing config is moved rather than rewritten.
sudo mkdir -p "$CONF_D"

if [ -f /etc/caddy/Caddyfile ]; then
  BACKUP="/etc/caddy/Caddyfile.bak.$(date -u +%Y%m%dT%H%M%SZ)"
  sudo cp /etc/caddy/Caddyfile "$BACKUP"
  echo "    backed up existing config to $BACKUP"

  # `import` at the start of a line marks the stub.
  if ! sudo grep -qE '^\s*import\s' /etc/caddy/Caddyfile; then
    # Only preserved if the file declares a site.
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
# No site blocks, only the import. Each project writes its own file under conf.d.
# Written by DungeonMaster/deploy/bootstrap.sh.
import /etc/caddy/conf.d/*.caddy
CADDYSTUB
echo "    /etc/caddy/Caddyfile is now the import stub"

echo "==> 7. conf.d/dungeonmaster.caddy"
# Overwritten on every run; edit this in the repo, not on the host.
# Site addresses are port-only (":8081"): no automatic HTTPS, and any Host matches.
{
  # The blocks differ only in port and root.
  DM_BLOCKS=""
  for entry in $SITES; do
    NAME="${entry%%:*}"; PORT="${entry#*:}"
    DM_BLOCKS="${DM_BLOCKS}
:${PORT} {
	root * ${APP_BASE}/${NAME}/current

	# "Is Caddy alive", independent of whether a release is present.
	handle /healthz {
		respond \"ok\" 200
	}

	handle {
		encode zstd gzip

		# /_next/static is fingerprinted and cached forever; index.html and the stamps never are.
		@immutable path /_next/static/*
		header @immutable Cache-Control \"public, max-age=31536000, immutable\"
		header /index.html Cache-Control \"no-cache\"
		header /build-id Cache-Control \"no-cache\"
		header /build-inputs Cache-Control \"no-cache\"

		# `output: 'export'` emits /format.html for /format, so the .html arm is required.
		try_files {path} {path}.html {path}/index.html
		file_server
	}

	# The app's own 404 page, served with a real 404 status.
	handle_errors {
		rewrite * /404.html
		file_server
	}
}
"
  done
  # Drop the leading blank line and the trailing newline, so `caddy validate` reads it as formatted.
  printf '%s' "$DM_BLOCKS" | sed '1{/^$/d}' | sudo tee "$CONF_D/dungeonmaster.caddy" >/dev/null
}
echo "    wrote $CONF_D/dungeonmaster.caddy"

sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

echo "==> 8. Start Caddy"
sudo systemctl enable caddy
sudo systemctl restart caddy
sudo systemctl status caddy 2>&1 | head -12 || true

echo "==> 9. Deploy key"
# The same public key must be here even when CI connects through a jump host.
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
  # `|| true`, not `|| echo 0`: grep -c already prints "0" on no match.
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
# Step 6 moved any pre-existing config to a new path.
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
