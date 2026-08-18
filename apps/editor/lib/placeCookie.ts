/**
 * The cookie name, on its own and with no `'use client'` on it.
 *
 * It has to be readable from both sides: the client writes it, and the server
 * component reads it to choose which module to render. A constant exported from
 * a client module is not a constant on the server — Next replaces the import
 * with a client reference — so the name would arrive as `undefined` and the
 * lookup would quietly find nothing. Which is exactly what it did.
 */
export const MODULE_COOKIE = 'dm.studio.module';
