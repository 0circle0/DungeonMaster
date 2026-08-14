/**
 * `tsx packages/cli/src/bin/free-port.ts 4400`
 *
 * Clear a stale dev server off a port before starting a new one.
 *
 * A dev server that outlives the terminal it was started from is invisible
 * until the next `npm run editor`, which then fails with `EADDRINUSE` and a
 * stack trace that says nothing about what to do. This finds the process on the
 * port, checks it belongs to this repository, and stops it.
 *
 * The ownership check is the important part: it will never touch a process
 * whose working directory is outside this checkout, so a database or another
 * project's server happening to sit on the same port is reported rather than
 * killed.
 */

import { execFileSync } from 'node:child_process';
import { readlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(new URL('../../../..', import.meta.url).pathname);

/** Process ids listening on a port, by whichever tool this machine has. */
function listenersOn(port: number): number[] {
  const attempts: [string, string[]][] = [
    ['ss', ['-lptnH', `sport = :${port}`]],
    ['lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN']],
  ];

  for (const [command, args] of attempts) {
    try {
      const out = execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const pids = [...out.matchAll(/pid=(\d+)|^(\d+)$/gm)]
        .map((match) => Number(match[1] ?? match[2]))
        .filter((pid) => Number.isFinite(pid) && pid > 0);

      if (pids.length > 0) return [...new Set(pids)];
      // The command ran and found nothing — that is an answer, not a failure.
      return [];
    } catch {
      // Not installed, or refused: try the next one.
    }
  }
  return [];
}

/** Where a process was started from, or null if that cannot be read. */
function workingDirectoryOf(pid: number): string | null {
  try {
    return readlinkSync(`/proc/${pid}/cwd`);
  } catch {
    return null;
  }
}

function commandOf(pid: number): string {
  try {
    return execFileSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8' }).trim();
  } catch {
    return '(unknown)';
  }
}

function stop(pid: number): boolean {
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return false;
  }

  // Give it a moment to close its listener, then insist.
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      return true;
    }
    execFileSync('sleep', ['0.1']);
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Already gone between the check and the signal.
  }
  return true;
}

function main(): number {
  const port = Number(process.argv[2] ?? 0);
  if (!Number.isFinite(port) || port <= 0) {
    process.stderr.write('usage: free-port <port>\n');
    return 1;
  }

  const pids = listenersOn(port);
  if (pids.length === 0) return 0;

  for (const pid of pids) {
    const cwd = workingDirectoryOf(pid);

    // Someone else's process. Say so plainly and leave it alone — a port
    // collision is worth a sentence, not a kill.
    if (cwd === null || !cwd.startsWith(repoRoot)) {
      process.stderr.write(
        `  Port ${port} is held by pid ${pid}, which is not part of this project:\n`
        + `    ${commandOf(pid)}\n`
        + '  Leaving it alone. Stop it yourself, or start the editor on another port.\n',
      );
      return 1;
    }

    process.stdout.write(`  freeing port ${port} — stopping stale dev server (pid ${pid})\n`);
    stop(pid);
  }

  return 0;
}

process.exit(main());
