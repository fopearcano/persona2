/**
 * Modulo McKee di PERSONA 2 (integrazione di CharBuild): costruzione del personaggio in
 * sedici stazioni secondo CHARACTER di Robert McKee, impianto della storia, analisi,
 * verifiche, export Markdown e profilo per il contesto delle conversazioni.
 *
 * Importato dal backend tramite `@persona/shared` e dal frontend tramite `@persona/shared/mckee`.
 */
import IT from './locales/it.js';
import { registerMckeeLocale } from './i18n.js';

registerMckeeLocale('it', IT);

export * as K from './catalog.js';
export type { Opt, Genre } from './catalog.js';
export * from './model.js';
export * from './sections.js';
export * from './i18n.js';
export * from './fields.js';
export * from './analysis.js';
export * from './export.js';
export * from './profile.js';
