/**
 * `npm run comments [-- <out>]`
 *
 * Every comment in the project, in one file, in folder order.
 *
 * The comments here carry most of the reasoning — why a thing is shaped the way
 * it is, what was tried first, which trap it exists to avoid — and that is spread
 * over four hundred files. Read end to end they are the closest thing this
 * project has to a design document, but nobody is going to open four hundred
 * files to read them.
 *
 * ## Why the TypeScript parser and not a regex
 *
 * A regex for `//` finds every URL in the codebase, and a regex for `/* ` finds
 * every one inside a string. Both mistakes are silent — the output looks fine
 * and is wrong. TypeScript is already a dependency and its parser knows exactly
 * what a comment is, including inside JSX, template literals and regex
 * literals, so the TS/TSX/JS half of the project is exact rather than
 * approximate.
 *
 * The other languages have no such parser here, so they get small scanners.
 * They are simpler problems: none of them has a regex literal, which is the
 * thing that makes lexing JavaScript by hand hard.
 *
 * ## What counts as a comment
 *
 * Python docstrings do, because in `dmkit` that is where the explanation lives —
 * a rule that only collected `#` would report the least interesting half. They
 * are recognised by position: a string opening a file, or opening the block
 * after a `def`/`class`. A string used as a value never opens a block, so it is
 * not mistaken for one.
 *
 * JSON is skipped. It has no comments, and it is 3,185 of the project's files.
 */

import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';

interface Comment {
  /** 1-based, and inclusive of both ends. */
  readonly line: number;
  readonly endLine: number;
  readonly text: string;
}

/** Files whose comments are worth having, by extension. */
const C_LIKE = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);
const HASH_LIKE = new Set(['.yml', '.yaml', '.sh']);

/** Everything git tracks, which is the definition of "the project" that stays true. */
function trackedFiles(root: string): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter((path) => path !== '');
}

/** Line starts, so a character offset can name a line. */
function lineIndex(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}

function lineAt(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid]! <= offset) low = mid;
    else high = mid - 1;
  }
  return low + 1;
}

/**
 * TypeScript, TSX and JavaScript, through the real parser.
 *
 * Comments are trivia: they hang off the token that follows them, so every
 * token in the tree is asked what precedes it. The end-of-file token is a child
 * of the source file like any other, which is what catches a comment with
 * nothing after it.
 */
function scanTypeScript(path: string, text: string): Comment[] {
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX
    : path.endsWith('.js') || path.endsWith('.mjs') || path.endsWith('.cjs') ? ts.ScriptKind.JS
      : ts.ScriptKind.TS;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const starts = lineIndex(text);

  const found = new Map<number, Comment>();
  const take = (range: ts.CommentRange): void => {
    if (found.has(range.pos)) return;
    found.set(range.pos, {
      line: lineAt(starts, range.pos),
      endLine: lineAt(starts, range.end - 1),
      text: strip(text.slice(range.pos, range.end)),
    });
  };

  const visit = (node: ts.Node): void => {
    const children = node.getChildren(source);
    if (children.length === 0) {
      for (const range of ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []) take(range);
    }
    for (const child of children) visit(child);
  };
  visit(source);

  return [...found.values()].sort((a, b) => a.line - b.line);
}

/**
 * `#` to end of line, for YAML and shell.
 *
 * Quote-aware, because a `#` inside a string is not a comment — and in a deploy
 * file that string is often a URL fragment or a colour.
 */
function scanHash(text: string): Comment[] {
  const out: Comment[] = [];
  const lines = text.split('\n');

  lines.forEach((line, index) => {
    let quote: string | null = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (quote) {
        if (ch === '\\') i++;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '#') {
        out.push({ line: index + 1, endLine: index + 1, text: strip(line.slice(i)) });
        return;
      }
    }
  });

  return merge(out);
}

/** `/* … *\/` only, quote-aware. CSS has no line comments and no regex literals. */
function scanCss(text: string): Comment[] {
  const out: Comment[] = [];
  const starts = lineIndex(text);
  let quote: string | null = null;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      out.push({ line: lineAt(starts, i), endLine: lineAt(starts, stop - 1), text: strip(text.slice(i, stop)) });
      i = stop - 1;
    }
  }

  return out;
}

/**
 * Python: `#` comments, and the docstrings that hold the actual explanation.
 *
 * A docstring is a string that *opens* something — the file, or the block after
 * a `def` or `class`. That is a position, not a shape, so a triple-quoted string
 * assigned to a variable is correctly left alone.
 */
function scanPython(text: string): Comment[] {
  const out: Comment[] = [];
  const lines = text.split('\n');

  /** Does a docstring belong here? True at the top of the file and after a block opener. */
  let opensBlock = true;
  let inString: string | null = null;
  let docStart = -1;
  let docLines: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;

    if (inString) {
      const close = line.indexOf(inString);
      if (close === -1) { docLines.push(line); continue; }
      docLines.push(line.slice(0, close));
      out.push({ line: docStart, endLine: index + 1, text: dedent(docLines.join('\n')) });
      inString = null;
      docLines = [];
      opensBlock = false;
      continue;
    }

    const code = line.trim();
    if (code === '') continue;

    if (code.startsWith('#')) {
      out.push({ line: index + 1, endLine: index + 1, text: strip(code) });
      continue;
    }

    const triple = /^[rbuf]*("""|''')/i.exec(code);
    if (opensBlock && triple) {
      const quote = triple[1]!;
      const body = code.slice(triple[0].length);
      const close = body.indexOf(quote);
      if (close !== -1) {
        out.push({ line: index + 1, endLine: index + 1, text: dedent(body.slice(0, close)) });
        opensBlock = false;
      } else {
        inString = quote;
        docStart = index + 1;
        docLines = [body];
      }
      continue;
    }

    // A line ending in `:` opens a block, and the next statement in it may be a
    // docstring. Anything else means the block has started without one.
    opensBlock = /:\s*(#.*)?$/.test(line);
  }

  return merge(out.sort((a, b) => a.line - b.line));
}

/** Comment markers off, so what is left is the prose somebody wrote. */
function strip(raw: string): string {
  let text = raw.trim();

  if (text.startsWith('/*')) {
    text = text.slice(2).replace(/\*\/$/, '');
    // A `*` gutter is decoration; a `*` that starts a bullet is content, and it
    // is followed by a space that the gutter form has already consumed.
    const lines = text.split('\n').map((line) => line.replace(/^\s*\*(?!\/)\s?/, ''));
    return dedent(lines.join('\n')).trim();
  }
  if (text.startsWith('//')) return text.replace(/^\/\/\s?/, '');
  if (text.startsWith('#')) return text.replace(/^#+\s?/, '');
  return text;
}

/** Drop the indentation the whole block shares, keeping the shape inside it. */
function dedent(text: string): string {
  const lines = text.split('\n');
  const indents = lines.filter((line) => line.trim() !== '').map((line) => /^[ \t]*/.exec(line)![0].length);
  const common = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(common)).join('\n').replace(/\s+$/, '');
}

/**
 * Consecutive single-line comments are one comment.
 *
 * Somebody writing four `//` lines wrote a paragraph, and splitting it into four
 * entries turns the reasoning into fragments.
 */
function merge(comments: readonly Comment[]): Comment[] {
  const out: Comment[] = [];
  for (const comment of comments) {
    const last = out[out.length - 1];
    if (last && comment.line === last.endLine + 1 && !comment.text.includes('\n')) {
      out[out.length - 1] = {
        line: last.line,
        endLine: comment.endLine,
        text: `${last.text}\n${comment.text}`,
      };
      continue;
    }
    out.push(comment);
  }
  return out;
}

function commentsIn(path: string, text: string): Comment[] {
  const ext = extname(path);
  if (C_LIKE.has(ext)) return scanTypeScript(path, text);
  if (ext === '.py') return scanPython(text);
  if (ext === '.css') return scanCss(text);
  if (HASH_LIKE.has(ext)) return scanHash(text);
  return [];
}

// --- the file it writes ------------------------------------------------------

const root = resolve(process.cwd());
const out = resolve(root, process.argv[2] ?? 'docs/comments.md');

const files = trackedFiles(root)
  .filter((path) => commentsIn(path, '') !== null && (C_LIKE.has(extname(path)) || extname(path) === '.py'
    || extname(path) === '.css' || HASH_LIKE.has(extname(path))))
  .sort();

interface Entry { readonly path: string; readonly comments: readonly Comment[]; }

const entries: Entry[] = [];
let total = 0;
let lines = 0;

for (const path of files) {
  let text: string;
  try {
    text = readFileSync(resolve(root, path), 'utf8');
  } catch {
    continue;
  }
  const comments = commentsIn(path, text);
  if (comments.length === 0) continue;
  entries.push({ path, comments });
  total += comments.length;
  for (const comment of comments) lines += comment.text.split('\n').length;
}

/** Folder, so the output is grouped the way the repository is. */
const folderOf = (path: string): string => dirname(path);

const parts: string[] = [];
parts.push('# Every comment in DungeonMaster\n');
parts.push(
  `Generated by \`npm run comments\`. ${total.toLocaleString()} comments, `
  + `${lines.toLocaleString()} lines of them, across ${entries.length} of `
  + `${files.length} source files, in folder order.\n`,
);
parts.push('Do not edit: this file is written from the source and any change here is lost.\n');

let folder: string | null = null;
for (const entry of entries) {
  const here = folderOf(entry.path);
  if (here !== folder) {
    folder = here;
    const count = entries
      .filter((candidate) => folderOf(candidate.path) === here)
      .reduce((sum, candidate) => sum + candidate.comments.length, 0);
    parts.push(`\n---\n\n## \`${here}\`\n\n_${count} comments_\n`);
  }

  parts.push(`\n### ${entry.path}\n`);
  for (const comment of entry.comments) {
    const at = comment.line === comment.endLine ? `L${comment.line}` : `L${comment.line}–${comment.endLine}`;
    parts.push(`\n**${at}**\n`);
    // A blockquote so the comment reads as prose and cannot be mistaken for the
    // surrounding document's own headings — comments contain `#` and `-` freely.
    parts.push(comment.text.split('\n').map((line) => (line ? `> ${line}` : '>')).join('\n'));
    parts.push('');
  }
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${parts.join('\n')}\n`, 'utf8');

const kb = Math.round(Buffer.byteLength(parts.join('\n')) / 1024);
process.stdout.write(
  `${total.toLocaleString()} comments (${lines.toLocaleString()} lines) from ${entries.length} files\n`
  + `wrote ${out.replace(`${root}/`, '')} — ${kb} KB\n`,
);
