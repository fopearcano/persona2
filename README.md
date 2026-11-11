# PERSONA 2

**Laboratorio local-first di identità artificiali persistenti, con la costruzione dei personaggi secondo McKee.**

> **Novità della versione 2.** PERSONA integra il costruttore di personaggi [CharBuild](https://github.com/fopearcano/char-build): sedici *tappe* che seguono *Character: The Art of Role and Cast Design for Page, Stage, and Screen* di Robert McKee (2021), con infografiche dal vivo, «verifiche McKee», profilo, mappa del cast, impianto narrativo della storia, ricerca nella tua copia del libro e un **coach McKee**. La costruzione fa parte dell'identità del personaggio: viene salvata nella cronologia delle versioni e guida il modo in cui il personaggio parla e sceglie nelle conversazioni. Vedi [Costruzione McKee](#costruzione-mckee-novità-della-versione-2).

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
git clone <repository> persona2
cd persona2
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

Gli installer sono pubblicati nelle **[Releases](https://github.com/fopearcano/persona2/releases)**: **Windows** (x64), **macOS Intel** (dmg; sui Mac Apple funziona tramite Rosetta 2) e **Linux** (AppImage e deb). Le istruzioni sono nelle note della release. Non sono firmati con un certificato di sviluppatore: al primo avvio Windows mostra un avviso di SmartScreen e macOS chiede di confermare l'apertura da *Impostazioni di Sistema → Privacy e sicurezza → Apri comunque*.

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

I dati stanno **fuori dal repository**, nella cartella utente del sistema (la stessa dell'app desktop), così reinstallare o clonare di nuovo il progetto non li perde:

| Sistema | Cartella dati |
|---|---|
| Windows | `%APPDATA%\PERSONA\data` |
| macOS | `~/Library/Application Support/PERSONA/data` |
| Linux | `~/.config/PERSONA/data` (o `$XDG_CONFIG_HOME/PERSONA/data`) |

Il percorso esatto è indicato in **Impostazioni → Informazioni → Cartella dati** e nel messaggio di avvio del server. Le migrazioni vengono applicate automaticamente all'avvio. Per usare un'altra cartella o porta: variabili `PERSONA_DATA_DIR`, `PERSONA_PORT` (vedi `.env.example`; un file `.env` nella root o in `server/` viene letto automaticamente).

**Aggiornare da una versione che teneva i dati in `./data`** (PERSONA 0.4 e 2.0 avviati dai sorgenti): al primo avvio, se il repository contiene ancora `data/persona.db` e la cartella utente non ha un database, i dati vengono copiati lì e la vecchia cartella viene rinominata in `data.moved-<data>` come copia di sicurezza (si può eliminare dopo aver controllato). Se entrambe contengono un database, PERSONA usa quello della cartella utente e lo segnala all'avvio; per usare l'altro imposta `PERSONA_DATA_DIR`. Evita di tenere aperti contemporaneamente l'app desktop e la versione dai sorgenti: userebbero lo stesso database.

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

## Costruzione McKee (novità della versione 2)

Ogni personaggio ha una **Costruzione McKee** (pulsante con il martello nell'elenco dei personaggi, nell'editor dell'identità oppure `/characters/<id>/build`). È il costruttore di CharBuild riscritto nello stile di PERSONA:

| Tappa | McKee | Cosa costruisci |
|---|---|---|
| 01 La scintilla | Cap. 3–5 | Fonti d'ispirazione (le cinque sfere), il dettaglio rivelatore, il «se magico», dall'esterno o dall'interno, le quattro ricerche |
| 02 Ruolo nel cast | Cap. 6 | Orbita (protagonista / primo, secondo, terzo cerchio), supporto o servizio, varianti di protagonista, gli 8 requisiti, il Centro del Bene, contraltare e narratore |
| 03 Tratti espliciti | Cap. 7 | I 18 tratti osservabili; l'occhio segna quelli messi in scena, per misurare la **regola dei 3/10** |
| 04 Tratti impliciti | Cap. 7 | Big Five (sono gli stessi dell'identità), intelligenze, atteggiamenti, le domande di McKee, umore e temperamento |
| 05 Mondo ed espressione | Cap. 7 | Tempo e spazio, livelli di conflitto, ambientazioni, vincoli culturali, i 9 modi di esprimere la caratterizzazione |
| 06 I quattro sé | Cap. 5 | Sé sociale, personale, nucleare e nascosto; le maschere secondo potere e intimità |
| 07 Motivazione e desiderio | Cap. 8 | Le 12 motivazioni, l'incidente scatenante, il super-obiettivo, l'oggetto del desiderio |
| 08 Scelta, pressione ed emozione | Cap. 8 | Il dilemma, rischio × libertà («profondità della scelta»), valori, emozioni, reazioni, decisioni |
| 09 Dimensioni | Cap. 9 | Le contraddizioni, con tipo, livello del sé, un comportamento per polo e la **dimensione definitoria** |
| 10 Antagonismo e profondità | Cap. 10 | Le forze antagoniste contro le sue capacità (la **bilancia della sfavorita**), il controdesiderio, i tratti di profondità, testo e sottotesto |
| 11 Arco e completamento | Cap. 11 | Bisogno → rivelazione → cambiamento → completamento, punti di svolta da trascinare sul grafico |
| 12 Simbolo e radicale | Cap. 12–13 | Archetipo, allegoria, tipo, figura di repertorio; il velo; personaggio × mondo |
| 13 Il personaggio nel genere | Cap. 14 | La posizione nel cast centrale dei generi della storia |
| 14 Il personaggio in azione | Cap. 15 | Il racconto di sé, il modus operandi, il costruttore di scene |
| 15 Il personaggio in scena | Cap. 16 | Le 7 funzioni, scoperta e riconoscimento, suspense = curiosità × apprensione |
| 16 Relazioni nel cast | Cap. 17 | I legami con il resto del cast e quale dimensione fa emergere ciascuno |

- **Infografiche dal vivo** per ogni tappa (sfere dell'ispirazione, orbite del cast, tela dei tratti con il misuratore dei 3/10, radar della personalità, i quattro sé, la scala delle motivazioni, il calibro della scelta, la ruota delle dimensioni, la bilancia della sfavorita, il grafico dell'arco, la rete delle relazioni…) e **verifiche McKee** con il capitolo di riferimento («Nessun vero dilemma», «Non è sfavorita», «I desideri non si contraddicono», «La ripetizione è il nemico mortale»…). I ruoli del secondo e terzo cerchio hanno aspettative più leggere, come consiglia McKee.
- **Profilo**: la «bibbia» del personaggio in una pagina (stampabile) ed esportazione in **Markdown**.
- **È identità.** Si modifica una bozza e la si salva esplicitamente: ogni salvataggio crea una nuova versione nella cronologia (con motivo facoltativo) ed è reversibile; esportazioni, varianti e duplicati portano con sé la costruzione. La sola posizione sulla mappa del cast non conta come modifica d'identità.
- **Nelle conversazioni.** Con *Usa nelle conversazioni* attivo (predefinito), il profilo McKee entra nel contesto del personaggio (sezione *design* nell'ispettore del contesto): tratti osservabili, sé, motivazioni e desideri, contraddizioni, sottotesto, racconto di sé, modus operandi, relazioni. Il **sé nascosto** e il **desiderio inconscio** arrivano come materiale «sotto la consapevolezza»: guidano il comportamento ma il personaggio non li dichiara mai. Le scelte d'autore (arco, climax, simbolo, genere, scene pianificate) restano fuori: il personaggio non conosce la propria storia futura. L'*analisi esterna* invece vede tutta la costruzione.
- **Storia e cast** (menu laterale, o il pulsante sulla scheda del progetto): l'impianto narrativo del progetto (logline, mezzo, causalità, tema, valore centrale, generi primari e di presentazione, mondo) e la **mappa del cast** con i cerchi di McKee: si trascinano i personaggi tra le orbite e le frecce mostrano chi aiuta o ostacola chi. Verifiche del cast («Nessuna protagonista», «Protagonista con meno dimensioni»…), schede di genere ed esportazione Markdown della storia.
- **Coach McKee** (pulsante *Coach*): un collaboratore che legge la costruzione — anche le modifiche non ancora salvate —, le verifiche McKee, la tappa aperta e i passaggi pertinenti del libro. Usa il **motore del personaggio** (LM Studio, OpenAI o compatibili; nessuno strumento richiesto, quindi funziona anche con modelli locali senza *function calling*). Propone valori per i campi e nuovi membri del cast: le proposte sono validate e vanno **applicate dall'autore** alla bozza, poi salvate. Le conversazioni con il coach non sono parlato del personaggio e non generano memorie.
- **Costruire chattando** (assistente di costruzione): invece di compilare i campi, si costruisce il personaggio conversando. Nella Costruzione McKee scegli la vista **Chat** (o, dall'elenco dei personaggi, **Crea chattando**: basta un nome). L'assistente guida l'intervista tappa per tappa — partendo dalle tappe attese per il ruolo e saltando ciò che è già compilato — e trasforma ogni risposta in valori dei campi: della costruzione e dell'identità di base (nome, età, origine, professione, biografia, aspetto, temperamento, registro…). Si può anche raccontare il personaggio liberamente: un paragrafo compila molti campi. Le modifiche entrano subito nella bozza, si vedono nel messaggio dell'assistente e si annullano una per una; nella barra laterale si segue l'avanzamento e si può scegliere di quale tappa parlare. Come sempre, l'identità cambia solo quando salvi (una sola revisione per costruzione e identità). Usa la stessa API e lo stesso motore del coach.
- **Distillare un'intervista** (esercizio del racconto di sé, Cap. 4): nel Dialogo, il pulsante con il martello apre il coach con la trascrizione della conversazione, che il coach trasforma in proposte per la costruzione.
- **Il libro.** Il libro di McKee **non è incluso**. Se ne possiedi una copia in formato .epub, caricala in **Impostazioni → Libro di McKee** (resta nella cartella dati, in `books/`) oppure indica `PERSONA_BOOK_PATH`. PERSONA la legge in locale, la divide in passaggi per capitolo e sezione e la cerca con BM25; le ricerche in italiano vengono ampliate con il lessico inglese di McKee (*dimensione definitoria* → *defining dimension*). Senza libro tutto il resto funziona.
- **Lingue.** I contenuti McKee (tappe, catalogo, verifiche, infografiche) sono in **italiano e inglese**; con l'interfaccia in francese, spagnolo, tedesco o portoghese appaiono in inglese. Il coach risponde nella lingua dell'interfaccia.

## Percorso tipico

0. **Progetti**: crea una storia e rendila attiva dal selettore in cima al menu laterale. Personaggi, Dialogo, Scenari, Simulazioni e Memoria mostrano solo ciò che appartiene al progetto attivo (oppure *Tutti i progetti*). Un personaggio creato nasce nel progetto attivo; uno già esistente si aggiunge con *Aggiungi personaggio esistente*.
1. **Personaggi → Nuovo personaggio**: identità, biografia, psicologia (Big Five facoltativi), comunicazione, competenze, lingue (madrelingua, livelli), base di conoscenza (testo, Markdown, PDF).
   Poi la **Costruzione McKee**: le sedici tappe, con il coach accanto, oppure la vista **Chat** per costruirlo conversando con l'assistente; poi **Storia e cast** per l'impianto narrativo del progetto e la mappa del cast.
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

Smoke test end-to-end facoltativi nel browser (richiedono Playwright con Chromium, ciascuno su un database vuoto):

```bash
npm run build
PERSONA_DATA_DIR=/tmp/persona-e2e PERSONA_PORT=4399 npm start
node scripts/e2e-smoke.cjs /tmp/persona-shots   # in un altro terminale: flusso principale
node scripts/e2e-mckee.cjs /tmp/persona-shots   # (su un altro database vuoto) costruzione McKee, coach, libro, mappa del cast
```

## Dati e portabilità

- Database: `persona.db` (SQLite, UTF-8) nella cartella dati (vedi [Avvio](#avvio)). Backup in `backups/` nella stessa cartella.
- **Backup**: Impostazioni → Backup (copia consistente tramite l'API di backup di SQLite). Il ripristino salva prima una copia di sicurezza del database corrente. Nota: il backup contiene anche le eventuali chiavi API salvate nelle configurazioni dei motori.
- **Progetti**: tutto viene salvato automaticamente nel database locale; *Salva su file* crea una copia portabile del progetto (`persona.project`), riapribile con *Apri da file* sullo stesso o su un altro computer (riusando i personaggi già presenti o importandoli come nuove identità). Un progetto riaperto accanto all'originale riceve un nome numerato, es. «Saga (2)».
- **Costruzione McKee e impianto della storia**: viaggiano con le esportazioni di personaggi (`build`) e progetti (`story`); aprendo un progetto da file le relazioni del cast puntano ai personaggi importati. I file di PERSONA 1 si importano come prima (senza costruzione).
- **Esportazione personaggi e scenari**: JSON documentato in [`docs/export-format.md`](docs/export-format.md). Un personaggio esportato porta con sé identità, cronologia delle versioni, tutte le memorie personali e, a scelta, conversazioni del laboratorio e base di conoscenza; all'importazione si può scegliere cosa includere. L'importazione non sovrascrive mai dati esistenti, è tutto o niente (un file danneggiato non lascia dati parziali) e, se il file è di un altro tipo (scenario, progetto) o di una versione più recente, lo dice chiaramente.

## Architettura in breve

```
Identità del personaggio → Recupero memorie → Assemblaggio contesto → Adattatore LLM
→ Risposta in streaming → Salvataggio conversazione → Elaborazione controllata della memoria
```

Monorepo npm: `shared/` (tipi e schemi; `shared/src/mckee/` = modello, tappe, catalogo, analisi e verifiche McKee, condivisi da backend e frontend), `server/` (Fastify, SQLite, Drizzle, servizi), `web/` (React). Dettagli in [`docs/architecture.md`](docs/architecture.md). Il backend si avvia anche in-process con `startPersonaServer()` (`server/src/embedded.ts`, porta libera, cartella dati a scelta): un futuro involucro Electron potrà usarlo e caricare la stessa interfaccia senza riscritture.

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
- **Costruzione McKee**: i contenuti di McKee sono tradotti solo in italiano e inglese (in fr/es/de/pt appaiono in inglese). La costruzione è unica per l'identità: un personaggio presente in più storie ha la stessa orbita e le stesse relazioni in tutte (la storia di riferimento si sceglie nel costruttore). La qualità delle proposte del coach dipende dalla capacità del modello di produrre JSON valido; le proposte non valide vengono scartate e segnalate. Il coach, l'assistente di costruzione e la distillazione sono verificati con il provider mock, non con un modello reale: con modelli piccoli l'assistente può raccogliere meno campi per risposta o ripetere domande. La ricerca nel libro è lessicale (BM25) e funziona con gli EPUB non cifrati (DRM non supportato).
- Le conversazioni del laboratorio appartengono al personaggio, non al progetto: un personaggio condiviso tra più storie ha un'unica identità, un'unica memoria personale e le stesse conversazioni di laboratorio in tutte. Solo scenari, sessioni, simulazioni e memorie contestuali sono separati per progetto.

## Crediti

- Costruzione dei personaggi: [CharBuild](https://github.com/fopearcano/char-build), dal metodo di Robert McKee, *Character: The Art of Role and Cast Design for Page, Stage, and Screen* (Twelve, 2021). Le indicazioni delle tappe sono parafrasi con riferimenti ai capitoli; nessun testo del libro è incluso nell'app.
- Carattere «macchina da scrivere»: [Courier Prime](https://quoteunquoteapps.com/courierprime/) di Alan Dague-Greene, licenza SIL Open Font License 1.1, incluso nell'app tramite il pacchetto `@fontsource/courier-prime` (nessun download durante l'uso). Copre gli alfabeti latini; per gli altri (es. cirillico) si usa Courier di sistema.

## Roadmap

- Firma del codice e notarizzazione degli installer; aggiornamento automatico.
- Indice vettoriale (es. sqlite-vec) per basi di memoria molto grandi.
- OCR per PDF scansionati.
- Revisione delle traduzioni da parte di madrelingua; altre lingue dell'interfaccia.
- Contenuti McKee in francese, spagnolo, tedesco e portoghese; orbita del cast distinta per storia.
- Verifica del coach McKee con modelli locali reali (LM Studio).
