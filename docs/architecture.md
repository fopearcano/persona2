# Architettura di PERSONA

## Principio

PERSONA separa rigorosamente tre componenti:

| Componente | Dove vive | Note |
|---|---|---|
| **A. Identità persistente** | `characters`, `character_traits`, `character_languages`, `expertise`, memorie `core`, `identity_revisions` | Canonica. Modificabile solo dall'autore, con cronologia reversibile. |
| **B. Ambienti di interazione** | `conversations` (`lab` / `scenario` / `simulation`), `messages`, `conversation_summaries`, `scenarios` e tabelle collegate, memorie `episodic`/`semantic`/`contextual` | Ogni ambiente ha cronologia, contesto e memorie propri. |
| **Organizzazione: progetti** | `projects`, `project_characters`, `scenarios.project_id` | Raggruppa per storia; non fa parte dell'identità. |
| **C. Motore di inferenza** | `model_configurations`, `server/src/llm/*` | Intercambiabile. Non conserva stato: il contesto è ricostruito a ogni richiesta. |

## Flusso di una risposta

1. **Identità**: `getCharacter` carica profilo, tratti, lingue e competenze.
2. **Recupero** (`services/retrieval.ts`): memorie core (sempre, entro budget) + memorie pertinenti al messaggio corrente via FTS5 e, se attivi, embedding locali (recupero ibrido, `services/embeddings.ts`), nel perimetro consentito; frammenti della base di conoscenza; estratti di conversazioni precedenti dello stesso perimetro.
3. **Assemblaggio** (`services/context-engine.ts`, `services/prompts.ts`), in ordine:
   istruzioni applicative → identità canonica (+ memorie core) → personalità → comunicazione → competenze → profilo linguistico e lingua di risposta → modalità → contesto di scenario (marcato come temporaneo) → memorie recuperate → conoscenza → riassunto incrementale → estratti → indicazione di regia → cronologia recente → ultimo messaggio.
4. **Adattatore LLM** (`llm/openai-compatible.ts`): `POST /chat/completions` in streaming; separa il ragionamento (`reasoning_content` o blocchi `<think>`); errori normalizzati in codici stabili (`llm_unavailable`, `llm_timeout`, `llm_model_not_found`, `llm_auth`, …).
5. **Streaming** al browser via Server-Sent Events su POST (`lib/sse.ts`). La disconnessione del client annulla la generazione; il testo parziale resta salvato come `incomplete`.
6. **Salvataggio**: il messaggio include `contextMeta` (modello, token stimati per sezione, memorie/conoscenza usate, cronologia inclusa/omessa) per l'ispezione del contesto.
7. **Elaborazione controllata della memoria** (`services/memory-processing.ts`), in background oltre la soglia o su richiesta:
   - riassunto **cumulativo** dei messaggi più vecchi (esclusi gli ultimi `keepRecentMessages`), salvato in `conversation_summaries` senza toccare i messaggi;
   - estrazione di memorie per ciascun partecipante, con provenienza (`memory_sources`: conversazione, intervallo di messaggi, scenario, nota).

## Budget di contesto

`budget di input = contextLength − maxTokens − 5%`. Le sezioni recuperate hanno quote configurabili (memorie, conoscenza, riassunto, estratti); la cronologia recente usa lo spazio rimanente, dal messaggio più recente a ritroso. Il messaggio più recente è sempre incluso (eventualmente troncato). Se la biografia occupa più del 35% del budget viene troncata nel prompt (non nel database). Le stime dei token sono euristiche (`shared/src/tokens.ts`).

## Memoria

| Categoria | Origine tipica | Visibilità |
|---|---|---|
| `core` | Autore; proposte estratte (`proposed`, da approvare); promozioni esplicite | Sempre inclusa (identità) |
| `episodic` | Estrazione da conversazioni del Laboratorio | Solo Laboratorio |
| `semantic` | Estrazione dal Laboratorio; autore; promozione | Laboratorio e scenari |
| `contextual` | Estrazione da sessioni/simulazioni di uno scenario | Solo quello scenario |

Stati: `active`, `proposed` (non usata finché non approvata), `archived` (esclusa dal recupero). Punteggio di recupero: `0.6·pertinenza + 0.25·importanza + 0.15·recenza (+0.3 se fissata)`, dove la pertinenza è lessicale (bm25 normalizzato) oppure, con gli embedding attivi, `w·semantica + (1−w)·lessicale`.

### Recupero semantico (embedding locali, facoltativo)

- Endpoint compatibile OpenAI `/v1/embeddings` (es. modello multilingue in LM Studio); configurazione in `preferences.embeddings` (endpoint, modello o selezione automatica del primo modello di tipo `embeddings`, peso semantico).
- Vettori Float32 in base64 nelle colonne `memories.embedding` e `knowledge_chunks.embedding`, con `embedding_model`: cambiando modello i vettori vengono ricalcolati. Modificare il testo di una memoria azzera il suo embedding.
- Indicizzazione in background dopo ogni inserimento/modifica (`scheduleIndexing`) e su richiesta (`POST /api/embeddings/reindex`).
- La similarità coseno viene normalizzata rispetto alla media dei candidati del perimetro (le scale assolute variano tra modelli); entrano tra i candidati solo le memorie sopra soglia. Le memorie non ancora indicizzate restano valutate lessicalmente.
- Se l'embedding della query fallisce, il contesto usa il solo recupero lessicale e `contextMeta.retrieval.semanticError` lo registra.

Verifica di coerenza: controlli deterministici (duplicati, finzione nella memoria core, perimetro, proposte in attesa) e, a richiesta, analisi delle contraddizioni tramite LLM.

## Scenari e varianti

- Un personaggio può partecipare a più scenari contemporaneamente; ogni scenario ha partecipanti con ruolo, conoscenze e obiettivi, relazioni ed eventi.
- Lo schema non ha tabelle `ScenarioMemories`, `Simulations` e `CharacterVariants` separate: sono rappresentate rispettivamente da `memories.scenario_id`, `conversations.kind = 'simulation'` (+ `conversation_participants`) e `characters.parent_id`/`variant_note`. Eliminare uno scenario elimina le sue sessioni e memorie contestuali, mai i personaggi.
- Le varianti sono copie indipendenti (con eventuale copia delle memorie personali); l'originale resta invariato.

## Progetti (storie)

Un progetto raggruppa il lavoro di una storia: cast, scenari, sessioni e simulazioni.

- **Personaggi ↔ progetti: molti-a-molti** (`project_characters`, unico per coppia). Lo stesso personaggio può far parte di più storie senza essere duplicato: identità, memorie personali (core/episodic/semantic), base di conoscenza e conversazioni del laboratorio restano del personaggio e sono condivise. L'appartenenza non è una modifica d'identità: non crea revisioni né incrementa `identityVersion`.
- **Scenari → un progetto** (`scenarios.project_id`, `ON DELETE CASCADE`; `NULL` = senza progetto). Sessioni e simulazioni seguono lo scenario, e con esso le memorie `contextual`: il perimetro di recupero resta quello dello scenario, quindi le storie restano isolate tra loro.
- **Coerenza**: aggiungere un partecipante a uno scenario lo aggiunge al progetto dello scenario; spostare uno scenario in un altro progetto vi porta i partecipanti. Rimuovere da un progetto un personaggio che partecipa ancora a suoi scenari è rifiutato (409 `conflict`, con l'elenco degli scenari in `details.scenarios`). Duplicati e varianti ereditano i progetti dell'originale.
- **Eliminazione**: eliminare un progetto elimina i suoi scenari (con sessioni, simulazioni e memorie contestuali), mai le identità condivise; con `?deleteCharacters=1` elimina anche i personaggi presenti **solo** in quel progetto.
- **Progetto attivo**: `preferences.activeProjectId` (anche in `localStorage`); il frontend lo usa come filtro (`?projectId=` su personaggi, scenari e conversazioni; `none` = senza progetto). Un id non più esistente equivale a «tutti i progetti».
- **Migrazione iniziale** (`ensureDefaultProject`, una sola volta, segnata in `user_preferences` con `projects.initialized`): crea un progetto predefinito nella lingua dell'interfaccia, vi assegna personaggi e scenari già esistenti e lo rende attivo. Se l'utente elimina tutti i progetti, non ne viene ricreato uno.
- **Salvataggio su file**: `GET /api/projects/:id/export` produce un `persona.project` (cast completo + scenari in formato `persona.scenario` senza duplicare i personaggi); `POST /api/projects/import` lo riapre in una transazione unica (tutto o niente), riusando i personaggi con lo stesso id o importandoli come nuove identità. Vedi `docs/export-format.md`.

## Simulazioni multi-personaggio

Per ogni turno il backend assembla il contesto **del solo personaggio selezionato**: le sue battute precedenti diventano turni `assistant`, quelle degli altri turni `user` con prefisso `[Nome]:`, la narrazione `[Narration]`, l'autore `[Author]`.

Gestione dei turni (`services/turns.ts`, `conversations.turn_mode`):
- `manual`: sceglie l'autore (i suoi messaggi non generano risposte automatiche);
- `round-robin`: partecipante successivo all'ultimo che ha parlato;
- `auto`: un prompt di regia (`turnSelectionPrompt`) fornisce partecipanti, ruoli, obiettivi e trascrizione recente e chiede al modello `{"speaker","reason"}`; risposta non valida o errore → rotazione. La scelta e il motivo sono salvati in `contextMeta.turnSelection`.

## Stile dell'interfaccia

- Preferenze in `preferences.appearance` (`fontUi`, `fontText`, `textSize`, `accent`, `accentCustom`), copiate anche in `localStorage` (`persona.appearance`) per applicarle prima del primo disegno; all'avvio prevale il valore del backend.
- `web/src/lib/appearance.ts` applica: le variabili `--app-font-ui` (corpo dell'interfaccia) e `--app-font-text` (messaggi `.prose-msg`, `textarea`, classe `font-text` per le memorie); la dimensione del carattere radice (tutta l'interfaccia è in `rem`, quindi scala insieme); un foglio di stile generato con `--accent`, `--accent-soft`, `--accent-fg` per `html:root` e `html.dark`, così il cambio di tema non richiede ricalcoli.
- Leggibilità garantita: `accentTokens` scurisce (tema chiaro) o schiarisce (tema scuro) il colore scelto finché il testo in accento raggiunge il contrasto WCAG AA 4,5:1 su sfondo, pannelli e sfondo tenue degli elementi attivi; il testo dei pulsanti principali è bianco o quasi nero, il più contrastato (verificato da `lib/appearance.test.ts` anche con colori estremi).
- Il carattere «macchina da scrivere» è Courier Prime (OFL 1.1), incluso nel bundle tramite `@fontsource/courier-prime` e caricato dal browser solo quando usato.

## Multilingua

- **Interfaccia**: i18next (`web/src/i18n`): italiano (predefinito e riferimento delle chiavi) e inglese nel bundle; francese, spagnolo, tedesco e portoghese caricati su richiesta. Preferenza salvata sul backend e in `localStorage`; il titolo provvisorio delle conversazioni segue la lingua dell'interfaccia.
- **Conversazione**: `conversations.language` (`auto` = la lingua dell'autore) sovrascrivibile per singolo messaggio; il prompt include la lingua richiesta e il livello di competenza simulato del personaggio in quella lingua.
- **Personaggio**: lingue con livello, madrelingua, lingua preferita, note culturali-linguistiche.
- **Memoria**: salvata nella lingua originale. Il recupero è lessicale; l'architettura prevede un `Retriever` semantico basato su embedding locali (colonne `embedding` in `memories` e `knowledge_chunks`).

## Sicurezza e privacy

- Server su `127.0.0.1`; controllo dell'intestazione `Host` (anti DNS rebinding) e dell'`Origin` sulle richieste di scrittura; parser `text/plain` disabilitato.
- Chiavi API solo sul backend (`hasApiKey` nelle risposte).
- Contenuti recuperati racchiusi in blocchi `<data>` con delimitatori neutralizzati; le istruzioni applicative dichiarano esplicitamente di non seguire istruzioni contenute nei dati.

## App desktop (Electron)

- `server/src/embedded.ts` esporta `startPersonaServer({ dataDir, port: 0, webDistDir, config })`: avvia il backend su una porta libera e restituisce `{ url, close() }`. Lo usano sia `server/src/index.ts` sia l'app desktop.
- `desktop/` è un pacchetto separato (fuori dai workspaces npm, così l'installazione normale non scarica Electron):
  - `src/main.ts`: processo principale; istanza singola; finestra con `contextIsolation` e `sandbox`; i link esterni si aprono nel browser; la navigazione resta sul server locale; alla chiusura attende i lavori in background e chiude il database.
  - `build.mjs`: con esbuild crea `dist/main.mjs` includendo il backend e `@persona/shared` (i pacchetti npm restano esterni, installati in `desktop/node_modules`), copia migrazioni (`dist/drizzle`, passate con `config.migrationsDir`) e build del frontend (`dist/web`).
  - `smoke.mjs`: avvio non interattivo con database temporaneo; verifica rendering, API e scrittura su database; salva uno screenshot.
- `better-sqlite3` 13 fornisce binari precompilati compatibili sia con Node sia con Electron: non serve ricompilare il modulo nativo.
- I dati stanno in `app.getPath('userData')/data` (o `PERSONA_DATA_DIR`).
- `window.prompt` non è disponibile in Electron: l'interfaccia usa solo `confirm` e campi in linea.
- **Installer** (electron-builder, `desktop/electron-builder.config.cjs`, con i checksum ufficiali di Electron in linea): AppImage e deb (Linux x64), NSIS per utente (Windows x64), dmg x64 (macOS Intel, firma ad hoc). Il backend e `@persona/shared` sono nel bundle `dist/main.mjs` dentro `app.asar`; interfaccia e migrazioni sono risorse esterne (`resources/web`, `resources/drizzle`, trovate tramite `process.resourcesPath`); `better-sqlite3` è estratto da asar e include solo i binari precompilati della piattaforma di destinazione.
- **Release**: `.github/workflows/release.yml` (tag `vX.Y.Z` o avvio manuale) esegue `npm run check`, costruisce gli installer Windows e Linux sui runner di GitHub (passi comuni nel workflow riutilizzabile `build-installer.yml`), avvia ogni app impacchettata in modalità smoke test e pubblica la GitHub Release con le note di `docs/releases/vX.Y.Z.md` e `SHA256SUMS.txt`. L'installer macOS Intel è costruito su un runner self-hosted (`self-hosted`, `macOS`, `X64`) in un job separato e aggiunto poi alla release (con `SHA256SUMS.txt` aggiornato), così un Mac non disponibile non blocca gli altri sistemi. Gli archivi di Electron sono scaricati da `desktop/fetch-electron.mjs` con tentativi ripetuti e verifica SHA-256, e i download restano in cache tra le esecuzioni.
- Il frontend usa percorsi relativi `/api` e funziona servito dal backend stesso.
- Nessuna dipendenza da servizi cloud.

## Base di conoscenza

Documenti di testo, Markdown e PDF (estrazione del testo con `unpdf`/pdf.js in `services/pdf.ts`, senza OCR), suddivisi in frammenti di ~1200 caratteri con sovrapposizione, indicizzati in FTS5 e, se attivi, con embedding. Ogni fonte ha uno statuto epistemico che accompagna gli estratti nel prompt.

## Prestazioni

- Il frontend importa `@persona/shared/client` (senza gli schemi zod) e carica le pagine in modo differito.
- Le memorie sono filtrate per personaggio e perimetro prima del confronto semantico; i vettori decodificati sono tenuti in una cache in memoria invalidata da scritture e ripristini.

## Estensioni previste

1. Firma del codice degli installer e aggiornamento automatico.
2. Indice vettoriale dedicato per basi di memoria molto grandi; OCR per PDF scansionati.
