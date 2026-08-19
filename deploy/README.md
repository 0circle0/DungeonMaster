# Deploying

Three sites come out of this repository, and all three are static:

| Site     | App          | Origin port | Public hostname          |
|----------|--------------|-------------|--------------------------|
| `site`   | `apps/site`  | 8081        | `dnddungeon.com`         |
| `studio` | `apps/editor`| 8082        | `studio.dnddungeon.com`  |
| `play`   | `apps/play`  | 8083        | `play.dnddungeon.com`    |

Each is `output: 'export'`, so a deploy is a directory of HTML and nothing else — no Node on the
serving host, no process to restart, no database. That is enforced rather than assumed:
`npm run check:client` fails on a route handler, a `cookies()` read or a `node:` import in any of
the three, and `output: 'export'` fails the build on the same. Read
`packages/tools/src/bin/check-client-only.ts` for why that guard exists.

## The shape of it

```
push to main
  └─ GitHub-hosted runner
       ├─ hash each app's inputs, ask the serving host what it already has
       ├─ build only the sites whose inputs changed
       ├─ rsync out/ to <host>:/opt/dungeonmaster/<site>/releases/<stamp>/
       ├─ swap the `current` symlink atomically
       └─ verify each origin serves the hash it just shipped
```

The runner reaches the serving host through a jump host — the serving host has no port forwarded
to it from the internet. A TLS-terminating reverse proxy on the jump host publishes the three
origins under their public hostnames.

**Nothing about that infrastructure is in this repository.** It is public, so the user, the
addresses and the host keys are all repository secrets, and `deploy/bootstrap.sh` takes the
serving host's address as an argument rather than hard-coding it.

## Setting it up

### 1. Repository secrets

Settings → Secrets and variables → Actions. Repository secrets, not environment secrets, not
variables. Names are case-sensitive.

| Secret | What it is |
|---|---|
| `DEPLOY_SSH_KEY_B64` | base64 of the private key CI authenticates with |
| `DEPLOY_SSH_USER` | the account it logs in as, on both hops |
| `DEPLOY_JUMP_HOST` | the internet-facing host |
| `DEPLOY_JUMP_HOST_KEY` | that host's `known_hosts` line |
| `DEPLOY_TARGET_HOST` | the serving host, reachable only from the jump host |
| `DEPLOY_TARGET_HOST_KEY` | its `known_hosts` line |

Print a host key **on the host itself**, with the name ssh will address it by:

```sh
echo "<name-or-address> $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"
```

Pinning them from secrets is deliberate. `ssh-keyscan` from the runner immediately before
connecting verifies the host against a key fetched seconds earlier over the same network path,
which proves nothing.

### 2. The serving host

```sh
scp deploy/bootstrap.sh <user>@<host>:~/dm-bootstrap.sh
ssh <user>@<host> 'bash ~/dm-bootstrap.sh --target-ip <addr> --deploy-key "ssh-ed25519 AAAA…"'
```

Safe to re-run. It installs Caddy if missing, creates the release layout, installs a placeholder
release for each site so nothing 404s before the first deploy, and writes
`/etc/caddy/conf.d/dungeonmaster.caddy`.

**It converts `/etc/caddy/Caddyfile` into a stub that imports `conf.d/`.** If another project on
that host has a setup script that writes `/etc/caddy/Caddyfile` wholesale, update it to write its
own `conf.d/<name>.caddy` and re-assert the stub — otherwise its next run drops these three
sites. Step 11 of the bootstrap tells you which neighbours it found.

The deploy key must be in the serving host's `authorized_keys`, not only the jump host's. CI
authenticates on both hops with the same key, and being on the jump host is not enough — this is
the most common reason a first deploy fails.

### 3. The reverse proxy

Point the three public hostnames at the origins:

```
dnddungeon.com         → http://<serving host>:8081
studio.dnddungeon.com  → http://<serving host>:8082
play.dnddungeon.com    → http://<serving host>:8083
```

The origins listen on plain HTTP and match any `Host` — that is intentional, and
`deploy/bootstrap.sh` step 7 explains at length why a bare `:PORT` is the only site address that
works behind a proxy. Certificates are the front end's job.

### 4. DNS

`A` records for `@`, `studio` and `play` pointing at the public IP. If that IP is dynamic, make
sure whatever keeps it current covers **this domain** — a dynamic DNS agent set up for a
different domain will not follow this one, and the symptom is three sites that work for weeks and
then stop together while everything else keeps running.

## Only what changed gets rebuilt

Each site has a list of input paths in the workflow — its real dependency closure, taken from its
`package.json` and its `next.config.ts` `transpilePackages`. The workflow hashes each list with
`git ls-tree`, asks the serving host what hash it is currently serving, and builds only the
mismatches. A change to `apps/site` alone rebuilds one site; a change to `packages/module`
rebuilds all three, because all three import it.

This is deliberately **not** a `git diff` against the previous commit. A diff answers "what
changed in this push", which is the wrong question on a re-run, a force-push, a revert, or the
first deploy after bootstrap. The hash answers "what would this build be made of".

The failure mode to fear is an input path **missing** from a list: that site would keep serving a
stale build after a real change. When in doubt, add the path — a spurious rebuild costs two
minutes. If a path is renamed, the workflow fails loudly rather than silently dropping it from
the hash.

Run the workflow manually with **force** ticked to rebuild all three regardless.

## Rolling back

Releases are kept, five deep, and `current` is just a symlink:

```sh
ls -1dt /opt/dungeonmaster/<site>/releases/*/     # newest first
ln -sfn /opt/dungeonmaster/<site>/releases/<one>  /opt/dungeonmaster/<site>/.current.tmp
mv -Tf  /opt/dungeonmaster/<site>/.current.tmp    /opt/dungeonmaster/<site>/current
```

Two steps rather than `ln -sfn` straight onto `current`, because that is not atomic — it unlinks
and then creates, and a request landing in the gap gets a 404. The next deploy will overwrite the
rollback, so fix forward as well.

## When it goes wrong

Every release carries two stamps at its root:

- `build-id` — the commit it was built from, for a human.
- `build-inputs` — the input hash, which is what the deploy compares and verifies.

```sh
curl -s http://<host>:8081/build-id      # what the apex is serving
curl -s https://dnddungeon.com/build-id  # what the public path is serving
curl -s http://<host>:8081/healthz       # Caddy alive, independent of any release
```

If those two disagree, the problem is the reverse proxy, DNS or a cache — not this repo. The
workflow's last step checks exactly that and only warns, because the release on the serving host
was already proven good by the step before it.

`/healthz` deliberately does **not** gate the deploy: it stays green across a release that never
landed, because the previous release is still there. `build-inputs` is the only endpoint that
distinguishes "deployed" from "the old build is still fine".
