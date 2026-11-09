# PERSONA

**Laboratorio local-first di identità artificiali persistenti.**

PERSONA permette di creare, mantenere, interrogare e simulare personaggi che esistono indipendentemente da qualsiasi storia. Un'astrofisica creata oggi può discutere di cosmologia con l'autore per settimane, poi salire a bordo di una nave interstellare in uno scenario narrativo, e infine partecipare a un universo del tutto diverso, mantenendo la stessa identità di fondo.

- **L'applicazione** conserva identità, continuità, memoria e portabilità.
- **L'LLM** (LM Studio in locale, oppure OpenAI o altri provider compatibili) fornisce solo l'intelligenza conversazionale: è intercambiabile e non contiene il personaggio.

I lavori sono organizzati in **progetti**: ogni progetto è una storia (un romanzo, una saga, una campagna) con il proprio cast di personaggi, i propri scenari e le proprie simulazioni. Lo stesso personaggio può partecipare a più storie senza essere duplicato.

Nessun account, nessun abbonamento, nessuna telemetria. Tutti i dati restano in un file SQLite sul tuo computer.

Interfaccia disponibile in **italiano** (predefinita), inglese, francese, spagnolo, tedesco e portoghese; i personaggi possono conversare in qualsiasi lingua supportata dal modello.

Lo stile è personalizzabile in **Impostazioni → Stile**: tema chiaro o scuro, carattere dell'interfaccia e dei testi (di sistema, con grazie, **macchina da scrivere** o monospaziato), dimensione del testo e colore d'accento (preimpostati o personalizzato, adattato automaticamente per restare leggibile in entrambi i temi).

---

## Requisiti

- **Node.js 22** o superiore (con npm).
- Per conversare con un modello locale: **[LM Studio](https://lmstudio.ai)** con almeno un modello scaricato. In alternativa un provider compatibile OpenAI.
- Senza LLM si può esplorare l'interfaccia con il motore **Mock** (risposte segnaposto, solo per prove).

`better-sqlite3` usa binari precompilati; se non sono disponibili per la tua piattaforma, npm li compila e servono Python 3 e un compilatore C/C++.

## Installazione

```bash
git clone <repository> persona
cd persona
npm install
```

## Avvio

### Sviluppo (ricaricamento automatico)

```bash
npm run dev
```

- Backend: `http://127.0.0.1:4317` (API)
- Interfaccia: **`http://127.0.0.1:5173`** (Vite, inoltra `/api` al backend)

### Uso quotidiano (build di produzione)

```bash
npm run build
npm start
```

Apri **`http://127.0.0.1:4317`**: il backend serve sia le API sia l'interfaccia.

### Applicazione desktop (installer)

Gli installer sono pubblicati nelle **[Releases](https://github.com/fopearcano/persona/releases)**: **Windows** (x64), **macOS Intel** (dmg; sui Mac Apple funziona tramite Rosetta 2) e **Linux** (AppImage e deb). Le istruzioni sono nelle note della release. Non sono firmati con un certificato di sviluppatore: al primo avvio Windows mostra un avviso di SmartScreen e macOS chiede di confermare l'apertura da *Impostazioni di Sistema → Privacy e sicurezza → Apri comunque*.

### Applicazione desktop dai sorgenti (Electron)

La cartella `desktop/` contiene un involucro Electron che avvia il backend dentro l'app (porta libera su `127.0.0.1`) e apre l'interfaccia in una finestra propria. È un pacchetto separato: `npm install` nella root non scarica Electron.

```bash
npm run desktop:install   # una sola volta: Electron e dipendenze in desktop/node_modules
npm run desktop           # build del frontend + avvio dell'app desktop
```

I dati dell'app desktop stanno nella cartella utente del sistema (`…/PERSONA/data`, oppure `PERSONA_DATA_DIR`). Verifica non interattiva: `npm run desktop:smoke` (su Linux senza display: `xvfb-run npm run desktop:smoke`).

Installer in locale (electron-builder, risultato in `desktop/release/`), dopo `npm run build` nella root:

```bash
cd desktop && npm run dist:linux   # oppure dist:win su Windows, dist:mac su macOS
```

**Pubblicare una release**: aggiornare la versione in `desktop/package.json` (e negli altri `package.json`), scrivere le note in `docs/releases/vX.Y.Z.md`, poi creare il tag `vX.Y.Z` (oppure avviare manualmente il workflow *Release* indicando il tag). Il workflow `.github/workflows/release.yml` esegue typecheck, test e build; crea gli installer Windows e Linux sui runner di GitHub, li verifica con uno smoke test dell'app impacchettata e pubblica la release con `SHA256SUMS.txt`; l'installer macOS Intel viene costruito su un **runner self-hosted** (etichette `self-hosted`, `macOS`, `X64`) e aggiunto alla stessa release appena pronto. Se il Mac non è disponibile, Windows e Linux vengono pubblicati comunque. Il runner self-hosted va usato solo per questo workflow (mai per workflow attivati da pull request).

Il database viene creato in `./data/persona.db` e le migrazioni vengono applicate automaticamente all'avvio. Per cambiare cartella o porta: variabili `PERSONA_DATA_DIR`, `PERSONA_PORT` (vedi `.env.example`; un file `.env` nella root o in `server/` viene letto automaticamente).

## Configurare LM Studio

1. In LM Studio scarica un modello di chat (per conversazioni ricche in italiano è consigliabile un modello da 7–14B o superiore).
2. Apri la scheda **Developer** e avvia il server locale (**Start Server**). L'endpoint predefinito è `http://localhost:1234/v1`.
3. Carica il modello (anche il caricamento "just-in-time" funziona: la prima risposta sarà più lenta).
4. In PERSONA vai su **Impostazioni → Motori LLM**:
   - la configurazione **LM Studio (locale)** è già presente ed è quella predefinita;
   - premi **Rileva modelli** per elencare i modelli e il loro stato (caricato/non caricato);
   - lascia il modello su *Automatico* per usare il primo modello caricato, oppure sceglilo;
   - imposta **Lunghezza del contesto** uguale al contesto con cui il modello è caricato in LM Studio;
   - premi **Prova connessione**.

Ogni personaggio può usare un motore diverso (editor del personaggio → scheda **Motore**). Cambiare motore non modifica identità, memorie o conversazioni.

**OpenAI o altri provider**: aggiungi una configurazione di tipo *OpenAI* o *Compatibile OpenAI* (endpoint e chiave). La chiave resta sul backend locale e non viene mai inviata all'interfaccia; in alternativa usa la variabile d'ambiente `OPENAI_API_KEY`.

### Recupero semantico multilingue (facoltativo)

Per ritrovare memorie e documenti **per significato**, anche tra lingue diverse (una memoria salvata in russo recuperata da una domanda in italiano):

1. in LM Studio scarica e carica un modello di **embedding multilingue** (ad esempio `bge-m3` o `multilingual-e5`);
2. in **Impostazioni → Recupero semantico** attiva l'opzione, scegli l'endpoint (di solito la configurazione LM Studio) e il modello (o lascia *Automatico*), poi **Prova embedding** e **Indicizza ora**.

Il recupero diventa ibrido (lessicale FTS5 + similarità tra embedding, con peso regolabile). Le nuove memorie e i nuovi documenti vengono indicizzati in background. Se il servizio di embedding non risponde, PERSONA torna automaticamente al solo recupero lessicale e lo segnala nel pannello di ispezione del contesto.

## Percorso tipico

0. **Progetti**: crea una storia e rendila attiva dal selettore in cima al menu laterale. Personaggi, Dialogo, Scenari, Simulazioni e Memoria mostrano solo ciò che appartiene al progetto attivo (oppure *Tutti i progetti*). Un personaggio creato nasce nel progetto attivo; uno già esistente si aggiunge con *Aggiungi personaggio esistente*.
1. **Personaggi → Nuovo personaggio**: identità, biografia, psicologia (Big Five facoltativi), comunicazione, competenze, lingue (madrelingua, livelli), base di conoscenza (testo, Markdown, PDF).
2. **Dialogo**: scegli il personaggio, crea una conversazione e parla in modalità *Dialogo*, *Intervista* o *Analisi esterna* (l'analisi non è mai presentata come parlato del personaggio). Puoi cambiare lingua di risposta in qualsiasi momento.
3. **Elabora memoria** (o automaticamente oltre la soglia): riassunti incrementali ed estrazione di memorie con provenienza. Le nuove conversazioni ereditano le memorie pertinenti, non l'intera cronologia.
4. **Memoria**: ispeziona, modifica, fissa, archivia, approva e promuovi le memorie; verifica di coerenza; anteprima del recupero.
5. **Scenari**: crea un universo (ambientazione, cronologia, condizioni, eventi, conoscenze), aggiungi partecipanti con ruoli e relazioni, apri sessioni narrative. Le memorie della storia restano nello scenario.
6. **Simulazioni**: scene condivise tra più personaggi; l'autore sceglie chi parla, oppure usa la rotazione o la **regia automatica** (il modello sceglie il parlante più naturale, con ripiego sulla rotazione); narrazione, indicazioni di regia per il turno, avanzamento di più turni consecutivi.
7. **Progetti → Salva su file / Apri da file** per l'intera storia (cast, memorie, base di conoscenza, scenari, conversazioni e sessioni a scelta); **Personaggi → Esporta/Importa** per portare un'identità altrove; **Scenari → Esporta/Importa** per un universo completo (partecipanti, relazioni, eventi, sessioni, memorie contestuali); **Impostazioni → Backup** per l'intero database.

## Test e verifiche

```bash
npm run typecheck   # TypeScript su shared, server e web
npm test            # test automatici (vitest) di server e web
npm run build       # build di produzione del frontend
npm run check       # tutti i precedenti
```

I test usano il provider **mock**: non serve LM Studio. L'adattatore OpenAI-compatibile è verificato contro un server HTTP finto che imita le API di LM Studio (streaming SSE, `/v1/models`, `/api/v0/models`, errori).

Smoke test end-to-end facoltativo nel browser (richiede Playwright con Chromium):

```bash
npm run build
PERSONA_DATA_DIR=/tmp/persona-e2e PERSONA_PORT=4399 npm start
node scripts/e2e-smoke.cjs /tmp/persona-shots   # in un altro terminale
```

## Dati e portabilità

- Database: `data/persona.db` (SQLite, UTF-8). Backup in `data/backups/`.
- **Backup**: Impostazioni → Backup (copia consistente tramite l'API di backup di SQLite). Il ripristino salva prima una copia di sicurezza del database corrente. Nota: il backup contiene anche le eventuali chiavi API salvate nelle configurazioni dei motori.
- **Progetti**: tutto viene salvato automaticamente nel database locale; *Salva su file* crea una copia portabile del progetto (`persona.project`), riapribile con *Apri da file* sullo stesso o su un altro computer (riusando i personaggi già presenti o importandoli come nuove identità). Un progetto riaperto accanto all'originale riceve un nome numerato, es. «Saga (2)».
- **Esportazione personaggi e scenari**: JSON documentato in [`docs/export-format.md`](docs/export-format.md). Un personaggio esportato porta con sé identità, cronologia delle versioni, tutte le memorie personali e, a scelta, conversazioni del laboratorio e base di conoscenza; all'importazione si può scegliere cosa includere. L'importazione non sovrascrive mai dati esistenti, è tutto o niente (un file danneggiato non lascia dati parziali) e, se il file è di un altro tipo (scenario, progetto) o di una versione più recente, lo dice chiaramente.

## Architettura in breve

```
Identità del personaggio → Recupero memorie → Assemblaggio contesto → Adattatore LLM
→ Risposta in streaming → Salvataggio conversazione → Elaborazione controllata della memoria
```

Monorepo npm: `shared/` (tipi e schemi), `server/` (Fastify, SQLite, Drizzle, servizi), `web/` (React). Dettagli in [`docs/architecture.md`](docs/architecture.md). Il backend si avvia anche in-process con `startPersonaServer()` (`server/src/embedded.ts`, porta libera, cartella dati a scelta): un futuro involucro Electron potrà usarlo e caricare la stessa interfaccia senza riscritture.

## Sicurezza

- Il server ascolta solo su `127.0.0.1` per impostazione predefinita.
- Le richieste con intestazione `Host` diversa da localhost vengono rifiutate (protezione da DNS rebinding); le scritture da altre origini del browser sono bloccate. Per esporre volutamente il server su altri host usa `PERSONA_HOST` e `PERSONA_ALLOWED_HOSTS` (non c'è autenticazione: farlo solo su reti fidate).
- Documenti, memorie e trascrizioni sono inseriti nel prompt come dati non attendibili, separati dalle istruzioni applicative.

## Limiti noti

- **LM Studio non è stato verificato dal vivo** nell'ambiente di sviluppo usato per questa versione (nessun server di modelli disponibile): l'integrazione è testata con un server finto compatibile. Segnalare eventuali differenze di comportamento dei modelli reali.
- Senza embedding il recupero è solo **lessicale** (SQLite FTS5, tokenizer `unicode61`): non riconosce sinonimi né traduzioni e non segmenta testo cinese/giapponese/coreano. Con il recupero semantico attivo la qualità dipende dal modello di embedding scelto; il confronto è esaustivo in memoria (adatto a migliaia di memorie, non a milioni). Gli estratti di conversazioni precedenti restano lessicali.
- Il recupero semantico non è stato verificato con un modello di embedding reale in questo ambiente: è testato con l'endpoint `/v1/embeddings` di un server finto e con il provider mock.
- La qualità dell'estrazione automatica di memorie dipende dalla capacità del modello di produrre JSON valido; in caso contrario non viene creata alcuna memoria (nessuna corruzione dei dati).
- Il conteggio dei token è una stima (circa 3,5 caratteri per token); impostare la lunghezza del contesto con margine.
- Le traduzioni dell'interfaccia in francese, spagnolo, tedesco e portoghese non sono state riviste da madrelingua.
- Gli installer non sono firmati né notarizzati (avvisi di SmartScreen e Gatekeeper al primo avvio) e non hanno aggiornamento automatico. L'installer macOS è solo per Intel (x64).
- PDF: viene estratto solo il testo selezionabile (nessun OCR per i documenti scansionati).
- La regia automatica dei turni dipende dalla capacità del modello di rispondere in JSON; in caso contrario si ripiega sulla rotazione.
- La competenza linguistica e specialistica del personaggio è simulata ed è limitata dalle reali capacità del modello scelto.
- Modificare un messaggio non rielabora le memorie già estratte da quel messaggio.
- Le conversazioni del laboratorio appartengono al personaggio, non al progetto: un personaggio condiviso tra più storie ha un'unica identità, un'unica memoria personale e le stesse conversazioni di laboratorio in tutte. Solo scenari, sessioni, simulazioni e memorie contestuali sono separati per progetto.

## Crediti

- Carattere «macchina da scrivere»: [Courier Prime](https://quoteunquoteapps.com/courierprime/) di Alan Dague-Greene, licenza SIL Open Font License 1.1, incluso nell'app tramite il pacchetto `@fontsource/courier-prime` (nessun download durante l'uso). Copre gli alfabeti latini; per gli altri (es. cirillico) si usa Courier di sistema.

## Roadmap

- Firma del codice e notarizzazione degli installer; aggiornamento automatico.
- Indice vettoriale (es. sqlite-vec) per basi di memoria molto grandi.
- OCR per PDF scansionati.
- Revisione delle traduzioni da parte di madrelingua; altre lingue dell'interfaccia.
