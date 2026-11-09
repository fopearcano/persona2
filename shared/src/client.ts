/**
 * Punto d'ingresso per il frontend: solo costanti, tipi e utilità leggere.
 * Esclude gli schemi zod (usati dal backend) per non appesantire il bundle del browser.
 */
export * from './constants.js';
export * from './types.js';
export * from './export-format.js';
export * from './tokens.js';
// Solo i tipi derivati dagli schemi (cancellati in compilazione: zod non entra nel bundle).
export type * from './schemas.js';
