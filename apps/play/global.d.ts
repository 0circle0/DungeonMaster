// A global stylesheet is imported for its side effect only and has no exports,
// so Next's own types declare `*.module.css` but never plain `*.css`.
// TypeScript 6 errors on a side-effect import it cannot resolve (TS2882) where
// 5.x ignored it, so the module needs declaring. Kept out of `next-env.d.ts`,
// which Next regenerates.
declare module '*.css';
