# Formato di esportazione dei personaggi (`persona.character`, versione 1)

File JSON in UTF-8, prodotto da `GET /api/characters/:id/export` (interfaccia: **Personaggi → Esporta** sulla scheda del personaggio) e accettato da `POST /api/characters/import` (**Personaggi → Importa**). Le definizioni TypeScript di riferimento sono in [`shared/src/export-format.ts`](../shared/src/export-format.ts).

Il nome del file scaricato è `persona-<nome>.json`; per i nomi con caratteri non latini l'intestazione `Content-Disposition` fornisce il nome UTF-8 (`filename*`) e un nome ASCII di ripiego.

## Parametri di esportazione

| Parametro | Predefinito | Effetto |
|---|---|---|
| `conversations=1` | sì | Include le conversazioni del Laboratorio con messaggi e riassunti |
| `knowledge=1` | sì | Include la base di conoscenza (testo completo dei documenti) |
| `contextual=1` | no | Include memorie contestuali e sessioni di scenario/simulazione |

Identità, cronologia dell'identità e **tutte** le memorie personali sono sempre incluse, senza limiti di numero.

## Struttura

```jsonc
{
  "format": "persona.character",
  "version": 1,
  "exportedAt": "2026-11-08T10:00:00.000Z",
  "app": { "name": "PERSONA", "version": "0.1.0" },
  "character": {
    "id": "…",                       // id originale (all'importazione ne viene generato uno nuovo)
    "name": "Irina Volkova",
    "age": "52", "origin": "…", "culturalBackground": "…", "occupation": "…", "education": "…",
    "biography": "…", "appearance": "…",
    "portrait": "data:image/jpeg;base64,…" | null,
    "temperament": "…", "interpersonalStyle": "…", "conflictResponse": "…", "stressResponse": "…",
    "bigFive": { "openness": 85, "conscientiousness": 70, "extraversion": null, "agreeableness": 40, "neuroticism": null } | null,
    "register": "…", "vocabulary": "…", "formality": "…", "humor": "…", "assertiveness": "…",
    "argumentativeStyle": "…", "conversationalDepth": "…", "culturalLinguisticNotes": "…",
    "preferredLanguage": "it" | null,
    "authorNotes": "…" | null,
    "traits":    [ { "category": "personality|motivation|value|desire|fear|bias|contradiction|expression", "content": "…", "sortOrder": 0 } ],
    "languages": [ { "code": "ru", "proficiency": "native|fluent|advanced|intermediate|basic", "isNative": true, "notes": null, "sortOrder": 0 } ],
    "expertise": [ { "domain": "Cosmologia", "level": "foundational|competent|expert|leading", "description": "…", "subtopics": ["…"], "sortOrder": 0 } ],
    "identityVersion": 3, "parentId": null, "variantNote": null,
    "status": "active|archived",     // facoltativo (assente nei file meno recenti = active)
    "createdAt": "…", "updatedAt": "…"
  },
  // Facoltativo (assente nei file meno recenti): le versioni precedenti a identityVersion,
  // con lo stesso contenuto di "character" (profilo, tratti, lingue, competenze).
  "identityRevisions": [
    { "version": 1, "reason": "…" | null, "createdAt": "…", "snapshot": { "name": "…", "traits": [], "languages": [], "expertise": [] } }
  ],
  "memories": [
    {
      "id": "…",
      "category": "core|episodic|semantic|contextual",
      "scenarioId": null,                // valorizzato solo per le memorie contestuali
      "content": "…",
      "importance": 1,                   // 1–5
      "epistemicStatus": "fact|interpretation|opinion|fiction|unverified",
      "language": "it" | null,
      "status": "active|proposed|archived",
      "origin": "author|conversation|summary|extraction|promotion|import",
      "pinned": false,
      "promotedFromId": null,
      "createdAt": "…", "updatedAt": "…",
      "sources": [ { "conversationId": "…", "messageId": null, "scenarioId": null, "fromSeq": 3, "toSeq": 12, "note": "…" } ]
    }
  ],
  "knowledge": [
    { "id": "…", "title": "…", "kind": "text|markdown|note", "content": "…", "sourceRef": "…" | null,
      "epistemicStatus": "fact", "language": null, "enabled": true, "createdAt": "…" }
  ],
  "conversations": [
    {
      "id": "…", "kind": "lab|scenario|simulation", "scenarioId": null, "title": "…",
      "language": "auto", "defaultMode": "dialogue|interview|analysis", "createdAt": "…", "updatedAt": "…",
      "messages": [
        { "id": "…", "seq": 1, "role": "author|character|analysis|narrator", "isSelf": false,
          "speakerName": null, "content": "…", "mode": "dialogue", "language": null,
          "status": "complete|incomplete|error|superseded", "model": null, "createdAt": "…" }
      ],
      "summaries": [ { "fromSeq": 1, "toSeq": 20, "content": "…", "createdAt": "…" } ]
    }
  ],
  "scenarios": [ { "id": "…", "title": "…" } ]   // scenari referenziati (solo riferimento)
}
```

## Regole di importazione

- Viene sempre creata una **nuova** identità con nuovi identificativi; nessun dato esistente viene sovrascritto. Il collegamento a un personaggio genitore (`parentId`) non viene ricreato.
- **Tutto o niente**: l'importazione avviene in un'unica transazione; se una parte del file non è valida non resta nulla di parziale.
- Opzioni (`?conversations=0|1&memories=0|1&knowledge=0|1`, tutte attive per impostazione predefinita; `projectId=<id>` aggiunge il personaggio a un progetto).
- **Cronologia**: le revisioni di `identityRevisions` vengono ricreate con numero, motivo, data e contenuto originali, e il personaggio mantiene il suo `identityVersion` (quindi «identità v3» resta v3 e le versioni precedenti si possono ripristinare). Senza `identityRevisions` (file meno recenti) l'identità riparte dalla versione 1. Anche lo stato (`archived`) viene mantenuto.
- **Promozioni**: `promotedFromId` viene ricollegato se anche la memoria d'origine è nel file.
- La base di conoscenza mantiene le date originali e le fonti disattivate restano disattivate; i vincoli sono gli stessi della creazione manuale (titolo ≤ 500 caratteri, contenuto ≤ 2 000 000).
- Le conversazioni del Laboratorio vengono importate con messaggi e riassunti; i messaggi con `isSelf: true` vengono attribuiti al nuovo personaggio.
- Le **sessioni di scenario e le simulazioni** non vengono importate (dipendono da scenari e altri personaggi): sono conteggiate in `skipped.scenarioConversations`. Restano comunque nel file come archivio leggibile.
- Le **memorie contestuali** vengono importate solo se lo scenario referenziato esiste nel database di destinazione con lo stesso id; altrimenti sono saltate e conteggiate in `skipped.contextualMemories`.
- La provenienza delle memorie viene conservata e annotata con l'id della memoria originale.
- Il file viene validato prima di qualsiasi scrittura. Gli errori sono `400 invalid_import` con `details.reason`:
  - `wrong_format`: è un altro file di PERSONA (`details.found`, es. `persona.scenario`); l'interfaccia indica dove importarlo;
  - `not_persona`: non è un file di PERSONA;
  - `newer_version`: creato da una versione più recente (`details.version`, `details.supported`);
  - `invalid`: struttura non valida (il messaggio indica il campo).
- Le stesse regole di formato, versione e atomicità valgono per scenari (`persona.scenario`) e progetti (`persona.project`).

## Compatibilità

Le versioni future del formato incrementeranno `version` e manterranno l'importazione delle versioni precedenti. Campi aggiunti in modo compatibile (come `identityRevisions` e `status`) restano nella versione 1: i file che non li contengono si importano come prima.

---

# Formato di esportazione degli scenari (`persona.scenario`, versione 1)

Prodotto da `GET /api/scenarios/:id/export?sessions=0|1` e accettato da `POST /api/scenarios/import?characters=reuse|new&sessions=0|1`. Tipi di riferimento: `ScenarioExportV1` in [`shared/src/export-format.ts`](../shared/src/export-format.ts).

```jsonc
{
  "format": "persona.scenario",
  "version": 1,
  "exportedAt": "…",
  "app": { "name": "PERSONA", "version": "0.4.0" },
  "scenario": { "id": "…", "title": "Aurora", "description": "…", "setting": "…", "timeline": "…", "environment": "…",
                "initialSituation": "…", "currentSituation": "…", "knowledge": "…", "language": "en" | null,
                "status": "active", "createdAt": "…", "updatedAt": "…" },
  "characters": [ /* un oggetto persona.character v1 per ogni partecipante (senza conversazioni del Laboratorio) */ ],
  "participants": [ { "characterId": "…", "role": "…", "roleDescription": "…", "knowledge": "…", "objectives": "…", "sortOrder": 0 } ],
  "relationships": [ { "fromCharacterId": "…", "toCharacterId": "…", "description": "…" } ],
  "events": [ { "title": "…", "content": "…", "fictionalTime": "Giorno 12", "sortOrder": 0, "createdAt": "…" } ],
  "memories": [ /* memorie contestuali dello scenario, come in persona.character, più "characterId" */ ],
  "sessions": [
    { "id": "…", "kind": "scenario|simulation", "title": "…", "language": "auto", "defaultMode": "dialogue",
      "turnMode": "manual|round-robin|auto", "characterId": "…" | null, "participantIds": ["…"],
      "createdAt": "…", "updatedAt": "…",
      "messages": [ { "seq": 1, "role": "narrator", "characterId": null, "speakerName": null, "content": "…", "mode": "dialogue",
                      "language": null, "status": "complete", "model": null, "createdAt": "…" } ],
      "summaries": [ { "fromSeq": 1, "toSeq": 20, "content": "…", "createdAt": "…" } ] }
  ]
}
```

## Regole di importazione

- Viene sempre creato un **nuovo** scenario.
- `characters=reuse` (predefinito): i personaggi il cui id esiste già nel database vengono riutilizzati così come sono (la loro identità non viene modificata); gli altri vengono importati come nuove identità. `characters=new`: tutti i personaggi vengono importati come nuove identità.
- Partecipanti, relazioni, eventi, sessioni (con messaggi e riassunti) e memorie contestuali vengono ricollegati ai personaggi importati o riutilizzati. Le memorie contestuali restano isolate nel nuovo scenario.
- I messaggi delle sessioni importate sono considerati già elaborati per la memoria (le memorie contestuali arrivano con il file).

---

# Formato dei progetti salvati (`persona.project`, versione 1)

Un progetto è una storia: il file contiene il cast, gli scenari e, a scelta, conversazioni e sessioni. Prodotto da `GET /api/projects/:id/export?conversations=0|1&sessions=0|1` (interfaccia: **Progetti → Salva su file**) e accettato da `POST /api/projects/import?characters=reuse|new&conversations=0|1&sessions=0|1` (**Progetti → Apri da file**). Tipi di riferimento: `ProjectExportV1` in [`shared/src/export-format.ts`](../shared/src/export-format.ts).

```jsonc
{
  "format": "persona.project",
  "version": 1,
  "exportedAt": "…",
  "app": { "name": "PERSONA", "version": "0.4.0" },
  "project": { "id": "…", "name": "Cronache di Marte", "description": "…" | null, "status": "active" | "archived",
               "createdAt": "…", "updatedAt": "…" },
  // Un persona.character v1 per ogni membro del progetto (e per ogni partecipante agli scenari),
  // con base di conoscenza, memorie personali e, se richieste, le conversazioni del Laboratorio.
  // Le memorie contestuali non stanno qui ma negli scenari.
  "characters": [ /* persona.character v1 */ ],
  // Un persona.scenario v1 per ogni scenario del progetto, con "characters": [] (il cast è sopra).
  "scenarios": [ /* persona.scenario v1 */ ]
}
```

## Regole di apertura

- Viene sempre creato un **nuovo** progetto; il progetto originale, se presente, non viene toccato. Se esiste già un progetto con lo stesso nome, il nuovo riceve un suffisso numerato («Cronache di Marte (2)»).
- `characters=reuse` (predefinito): i personaggi il cui id esiste già vengono riutilizzati così come sono (identità e memorie invariate) e aggiunti al nuovo progetto; gli altri vengono importati come nuove identità. `characters=new`: tutti i personaggi vengono importati come nuove identità.
- Ogni scenario viene importato secondo le regole di `persona.scenario`, all'interno del nuovo progetto e ricollegato ai personaggi riusati o importati.
- `conversations=0` ignora le conversazioni del Laboratorio presenti nel file; `sessions=0` ignora sessioni e simulazioni degli scenari.
- L'apertura è **atomica**: se una parte del file non è valida non viene creato nulla (né progetto né personaggi) e la risposta è `400 invalid_import`.
- Le conversazioni del Laboratorio appartengono al personaggio, non al progetto: aprire lo stesso file due volte con `characters=new` crea due copie indipendenti di ogni personaggio.
