# PERSONA — istruzioni per Claude Code

PERSONA è un laboratorio **local-first** per creare, mantenere, interrogare e simulare identità artificiali persistenti. Un personaggio esiste indipendentemente da qualsiasi narrazione: l'app fornisce identità, continuità, memoria e portabilità; l'LLM è solo un motore di inferenza intercambiabile.

Lingua: documentazione e testi per l'utente in **italiano** (UI predefinita italiana, inglese disponibile). Identificatori di codice in inglese.

## Architettura

```
shared/   tipi, costanti, schemi zod, formati di export, stima token
          (il web importa `@persona/shared/client`, che esclude gli schemi zod; il server `@persona/shared`)
server/   Node 22 + Fastify 5 + SQLite (better-sqlite3) + Drizzle ORM
  src/db/          schema.ts (Drizzle), client.ts (apertura, migrazioni, swap per restore)
  drizzle/         migrazioni SQL (0001_fts.sql = FTS5 + trigger, scritta a mano; 0003_projects.sql ritoccata per ON DELETE CASCADE)
  src/llm/         adattatore provider-indipendente: openai-compatible.ts (LM Studio/OpenAI/…: chat in
                   streaming + /embeddings), mock.ts (test/demo, embedding deterministici), think-filter.ts, registry.ts
  src/services/    logica di dominio; src/routes/index.ts = API REST + SSE
                   embeddings.ts (recupero semantico + indicizzazione), turns.ts (gestione turni),
                   pdf.ts, scenario-portability.ts (bundle persona.scenario), portability.ts (personaggi, backup),
                   projects.ts + project-membership.ts (progetti/storie, bundle persona.project)
  src/embedded.ts  startPersonaServer(): avvio in-process su porta libera (usato da index.ts; base per Electron)
  test/            vitest + app.inject, sempre con provider mock (nessun LM Studio richiesto)
desktop/  app Electron (pacchetto separato, fuori dai workspaces): src/main.ts, build.mjs (esbuild), smoke.mjs,
          configurazione electron-builder in desktop/electron-builder.config.cjs, icona in desktop/build/icon.png
web/      React 19 + Vite 7 + Tailwind 4 + TanStack Query + Zustand + i18next
  src/pages/       Projects, Characters, CharacterEditor, Dialogue, Scenarios(+Editor), Simulations, Memory, Settings
  src/lib/project.ts  useActiveProject (progetto attivo = filtro), useRemoveFromProject
  src/lib/appearance.ts  stile: caratteri (Courier Prime incluso via @fontsource), dimensione testo, accento con contrasto AA automatico
  src/components/chat/  ChatWorkspace (streaming SSE), MessageItem, Inspector
  src/i18n/locales/     it.json (riferimento), en, fr, es, de, pt (stesse chiavi; test di parità; fr/es/de/pt caricati su richiesta)
docs/     architecture.md, export-format.md
```

Flusso di generazione (server/src/services/generation.ts):
identità → recupero memorie (retrieval.ts) → assemblaggio contesto (context-engine.ts + prompts.ts) → adattatore LLM → streaming SSE → salvataggio messaggio (+ contextMeta) → elaborazione memoria in background (memory-processing.ts).

## Regole di isolamento (non violarle)

- **Identità canonica** = riga `characters` + traits/languages/expertise + memorie `core` attive. Si modifica solo con azioni esplicite dell'autore (`PUT /api/characters/:id`); ogni modifica salva un'istantanea in `identity_revisions` e incrementa `identityVersion`. Cambiare modello NON è una modifica d'identità.
- L'elaborazione automatica **non crea mai memorie core attive**: le proposte core nascono `status='proposed'` e richiedono `POST /api/memories/:id/approve`.
- Tutto ciò che viene estratto da conversazioni di scenario/simulazione diventa `category='contextual'` con `scenarioId` (mai core/semantic). La promozione all'identità personale è solo esplicita (`POST /api/memories/:id/promote`, crea una NUOVA memoria, l'originale resta).
- Perimetri di recupero (retrieval.ts `scopeClause`): Laboratorio = core + episodic + semantic (mai contextual). Scenario = core + semantic personali + contextual dello **stesso** scenario. Gli estratti di conversazioni precedenti seguono lo stesso perimetro.
- **Progetti** (storie): personaggi ↔ progetti molti-a-molti (`project_characters`), scenari → un progetto (`scenarios.project_id`, cascade); sessioni, simulazioni e memorie contestuali seguono lo scenario. L'appartenenza a un progetto NON è identità (nessuna revisione). Aggiungere un partecipante o spostare uno scenario porta i personaggi nel progetto; rimuovere un membro che partecipa a scenari del progetto → 409. Eliminare un progetto non elimina mai identità condivise (`deleteCharacters=1` solo per quelle esclusive). Il progetto attivo (`preferences.activeProjectId`) è solo un filtro dell'interfaccia (`?projectId=`, `none` = senza progetto).
- Simulazioni multi-personaggio: il contesto si assembla **per ogni turno** per il solo personaggio che parla; le sue battute sono `assistant`, quelle altrui `user` con prefisso `[Nome]:`. L'estrazione di memorie avviene per ciascun partecipante.
- I riassunti (`conversation_summaries`) sono cumulativi e **non sostituiscono né cancellano** i messaggi. Rigenerare marca la vecchia risposta `superseded`; modificare un messaggio salva la versione precedente in `message_revisions`. Generazioni interrotte restano salvate come `incomplete`.
- L'analisi esterna (`mode='analysis'`, `role='analysis'`) non è parlato del personaggio ed è esclusa dalla cronologia in-personaggio.
- Tutto il materiale recuperato va nei blocchi `<data>` (prompts.ts `dataBlock`/`escapeData`) ed è trattato come dato non attendibile.
- Le chiavi API restano sul backend: `toModelConfigDto` espone solo `hasApiKey`.
- Import/export (`persona.character`/`scenario`/`project`): l'importazione crea sempre nuove entità (mai sovrascritture), è atomica (`ctx.dbm.sqlite.transaction`, annidabile) e passa da `assertPersonaFile` (lib/import-check.ts: `details.reason` = wrong_format | not_persona | newer_version | invalid). Le esportazioni non troncano mai (`listAllMemories`, niente limiti di pagina). Campi nuovi nei formati: facoltativi e compatibili, senza cambiare `version`.

## Requisiti multilingua

- Nessuna stringa visibile hardcoded nei componenti React: usare `t('…')` e aggiungere la chiave in **tutti** i file di `web/src/i18n/locales/` (it, en, fr, es, de, pt): il test `web/src/i18n/i18n.test.ts` verifica parità di chiavi e placeholder rispetto a `it.json`. Le chiavi di errore sono `errors.<ErrorCode>`.
- Non usare `window.prompt` (non supportato nell'app Electron): campi in linea o modali.
- Date/numeri/nomi di lingua con `Intl` tramite `web/src/lib/format.ts`.
- Tre dimensioni indipendenti: lingua UI (preferenza `uiLanguage`), lingua di conversazione (`conversations.language`, `'auto'` o codice BCP-47, sovrascrivibile per messaggio), profilo linguistico del personaggio (`character_languages`). Le memorie restano nella lingua originale.
- Recupero: FTS5 lessicale sempre; semantico (embedding multilingue locali) solo se attivato in `preferences.embeddings`, con fallback automatico al lessicale. Non dichiarare capacità semantiche quando gli embedding sono disattivati.

## Comandi

```bash
npm install            # dalla root (workspaces)
npm run dev            # backend :4317 (tsx watch) + Vite :5173 con proxy /api
npm run build          # build del frontend (web/dist)
npm start              # produzione: backend serve API + web/dist su http://127.0.0.1:4317
npm run typecheck      # tsc su shared, server, web
npm test               # vitest server + web
npm run check          # typecheck + test + build
npm run db:generate    # (server) genera migrazione Drizzle dopo modifiche a schema.ts
npm run db:migrate     # applica le migrazioni (avvengono anche automaticamente all'avvio)
node scripts/e2e-smoke.cjs <cartella-screenshot>   # facoltativo, richiede playwright + server su :4399
npm run desktop:install  # app desktop: installa Electron in desktop/node_modules (una volta)
npm run desktop          # build frontend + avvio Electron
xvfb-run npm run desktop:smoke   # verifica headless dell'app desktop
cd desktop && npm run dist:linux # installer locali (dist:win / dist:mac sui rispettivi sistemi) → desktop/release/
```

Release: versione in `desktop/package.json` + note in `docs/releases/vX.Y.Z.md`, poi tag `vX.Y.Z` (o workflow *Release* manuale con il tag). `.github/workflows/release.yml`: verifica → installer Windows (NSIS) e Linux (AppImage + deb) sui runner GitHub, ciascuno con smoke test dell'app impacchettata (passi comuni in `build-installer.yml`, workflow riutilizzabile) → GitHub Release con SHA256SUMS → installer macOS **Intel** (dmg x64, firma ad hoc) su runner **self-hosted** `[self-hosted, macOS, X64]`, aggiunto alla release con SHA256SUMS aggiornato (job separato: un Mac offline non blocca Windows/Linux; smoke test macOS non bloccante perché richiede una sessione grafica). Installer non firmati. Non salvare token o credenziali dei runner nel repository. Electron viene scaricato da `desktop/fetch-electron.mjs` (tentativi ripetuti + verifica SHA-256) e i download sono in cache tra le esecuzioni.

Variabili: `PERSONA_DATA_DIR` (default `./data`), `PERSONA_PORT` (4317), `PERSONA_HOST` (127.0.0.1), `PERSONA_LMSTUDIO_URL`, `OPENAI_API_KEY`, `PERSONA_ALLOWED_HOSTS`. Vedi `.env.example`.

## Convenzioni

- TypeScript strict ovunque; ESM; validazione input con gli schemi zod di `shared/src/schemas.ts` (helper `validate`, errori `AppError` con `ErrorCode`).
- I servizi ricevono `ctx: AppContext` e leggono `ctx.dbm.db` a ogni uso (il DB può essere sostituito a caldo dal restore). Timestamp ISO-8601, id UUID.
- `assembleContext` è asincrono (embedding della query). Le scritture di memorie/frammenti chiamano `scheduleIndexing(ctx)`; i lavori in background passano da `trackBackground` (i test li attendono con `settleBackground`).
- Il provider mock riconosce `params.purpose` (`character`, `analysis`, `summarize`, `extract`, `title`, `turn`, `consistency`, `test`) per risposte deterministiche; i suoi embedding usano un piccolo dizionario multilingue di concetti (solo per i test).
- Migrazioni: modificare `schema.ts` → `npm run db:generate`; SQL personalizzato (FTS, trigger) con `npx drizzle-kit generate --custom`. Non modificare migrazioni già rilasciate.
- Ogni nuova funzionalità backend ha un test in `server/test/` usando `createTestEnv()` (provider mock predefinito). Non dichiarare funzionalità complete senza test eseguiti.
- UI sobria: token colore in `web/src/index.css` (`bg-panel`, `text-muted`, `border-border`, `text-accent`, …), niente animazioni superflue. Non usare colori d'accento fissi: sempre i token (`--accent*` sono sostituibili dall'utente). Dimensioni in `rem` (la dimensione del testo scala la radice); i testi lunghi usano `font-text`/`.prose-msg`/`textarea` (carattere dei testi), il resto eredita il carattere dell'interfaccia. Nessun font da CDN: solo pacchetti inclusi nel bundle.

## Stato attuale (v0.4.0)

Implementato e testato: fasi 1–6 — fondazioni, personaggi, memoria, scenari, simulazioni (turni manuali, rotazione, regia automatica), recupero semantico ibrido con embedding locali, PDF nella base di conoscenza, export/import di personaggi e scenari, backup/restore, app desktop Electron (Linux, headless), interfaccia in 6 lingue, indicatore di disponibilità del motore. Progetti (storie): divisione di personaggi/scenari/simulazioni per progetto, progetto attivo, salvataggio/apertura su file (`persona.project`), migrazione automatica dei dati esistenti in un progetto predefinito. Import/export dei personaggi con cronologia dell'identità, opzioni di importazione e messaggi chiari per file del tipo sbagliato. Impostazioni di stile: caratteri (anche macchina da scrivere), dimensione del testo, colore d'accento. 84 test server + 24 test web; smoke E2E Playwright (24 passaggi) e smoke desktop con provider mock.

Installer desktop: le release pubblicano Windows (x64), Linux (AppImage, deb) e macOS Intel (dmg, dal runner self-hosted), generati e verificati dal workflow di release.

Non verificato: LM Studio reale (chat ed embedding testati contro un server finto compatibile). Non implementati: firma del codice, aggiornamento automatico, OCR. Traduzioni fr/es/de/pt non revisionate da madrelingua. Dettagli: `README.md` § Limiti noti e `docs/architecture.md`.
