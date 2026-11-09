import type { FastifyInstance } from 'fastify';
import {
  projectMembershipSchema,
  characterImportOptionsSchema,
  connectionTestSchema,
  contextPreviewSchema,
  embeddingTestSchema,
  processMemorySchema,
  retrievalPreviewSchema,
} from '@persona/shared';
import { createReadStream } from 'node:fs';
import type { AppContext } from '../context.js';
import { attachmentHeader } from '../lib/import-check.js';
import { streamResponse } from '../lib/sse.js';
import { AppError, validate } from '../lib/util.js';
import * as characters from '../services/characters.js';
import * as conversations from '../services/conversations.js';
import * as embeddings from '../services/embeddings.js';
import { assembleContext } from '../services/context-engine.js';
import * as generation from '../services/generation.js';
import * as knowledge from '../services/knowledge.js';
import * as memory from '../services/memory.js';
import { processConversationMemory, processPendingFor } from '../services/memory-processing.js';
import * as models from '../services/model-configs.js';
import * as portability from '../services/portability.js';
import { extractPdf } from '../services/pdf.js';
import { getPreferences, updatePreferences } from '../services/preferences.js';
import { coreMemories, searchScopedMemories } from '../services/retrieval.js';
import * as projects from '../services/projects.js';
import * as scenarioPortability from '../services/scenario-portability.js';
import * as scenarios from '../services/scenarios.js';

type Params = { id: string };
type Q = Record<string, string | undefined>;
const bool = (v: string | undefined, d = false) => (v === undefined ? d : v === '1' || v === 'true');

export async function registerRoutes(app: FastifyInstance, ctx: AppContext) {
  /* ---------------- Sistema ---------------- */
  app.get('/api/health', async () => ({ ok: true, name: 'PERSONA', version: ctx.config.version }));

  app.get('/api/info', async () => {
    const count = (t: string) => (ctx.dbm.sqlite.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n;
    return {
      name: 'PERSONA',
      version: ctx.config.version,
      dataDir: ctx.config.dataDir,
      databaseFile: ctx.dbm.file,
      schemaVersion: ctx.dbm.schemaVersion(),
      stats: {
        characters: count('characters'),
        memories: count('memories'),
        conversations: count('conversations'),
        messages: count('messages'),
        scenarios: count('scenarios'),
      },
    };
  });

  /* ---------------- Preferenze ---------------- */
  app.get('/api/preferences', async () => getPreferences(ctx));
  app.put('/api/preferences', async (req) => {
    const activeProjectId = (req.body as { activeProjectId?: string | null } | null)?.activeProjectId;
    if (activeProjectId) projects.getProjectRow(ctx, activeProjectId);
    const next = updatePreferences(ctx, req.body as never);
    if ((req.body as { embeddings?: unknown } | null)?.embeddings) embeddings.scheduleIndexing(ctx);
    return next;
  });

  /* ---------------- Embedding (recupero semantico) ---------------- */
  app.get('/api/embeddings/status', async () => embeddings.embeddingStatus(ctx));
  app.post('/api/embeddings/reindex', async (req) => {
    if (((req.body ?? {}) as { reset?: boolean }).reset) embeddings.resetEmbeddings(ctx);
    await embeddings.runIndexing(ctx);
    return embeddings.embeddingStatus(ctx);
  });
  app.post('/api/embeddings/test', async (req) => {
    const data = validate(embeddingTestSchema, req.body ?? {});
    return embeddings.testEmbeddings(ctx, { modelConfigId: data.modelConfigId ?? undefined, model: data.model });
  });

  /* ---------------- Configurazioni modello ---------------- */
  app.get('/api/model-configs', async () => models.listModelConfigs(ctx));
  app.post('/api/model-configs', async (req, reply) => reply.code(201).send(models.createModelConfig(ctx, req.body as never)));
  app.put<{ Params: Params }>('/api/model-configs/:id', async (req) => models.updateModelConfig(ctx, req.params.id, req.body as never));
  app.delete<{ Params: Params }>('/api/model-configs/:id', async (req, reply) => {
    models.deleteModelConfig(ctx, req.params.id);
    return reply.code(204).send();
  });
  app.post<{ Params: Params }>('/api/model-configs/:id/test', async (req) => {
    const { completion } = validate(connectionTestSchema, req.body ?? {});
    return models.testModelConfig(ctx, req.params.id, completion);
  });
  app.get<{ Params: Params }>('/api/model-configs/:id/models', async (req) => models.listModelsFor(ctx, req.params.id));
  app.post('/api/model-configs/probe', async (req) => models.probeModels(ctx, req.body));

  /* ---------------- Progetti ---------------- */
  app.get('/api/projects', async () => projects.listProjects(ctx));
  app.post('/api/projects', async (req, reply) => reply.code(201).send(projects.createProject(ctx, req.body as never)));
  app.get<{ Params: Params }>('/api/projects/:id', async (req) => projects.getProject(ctx, req.params.id));
  app.put<{ Params: Params }>('/api/projects/:id', async (req) => projects.updateProject(ctx, req.params.id, req.body as never));
  app.delete<{ Params: Params; Querystring: Q }>('/api/projects/:id', async (req) =>
    projects.deleteProject(ctx, req.params.id, { deleteCharacters: bool(req.query.deleteCharacters, false) }),
  );
  app.post<{ Params: Params }>('/api/projects/:id/characters', async (req, reply) => {
    const { characterId } = validate(projectMembershipSchema, req.body);
    projects.addCharacterToProject(ctx, req.params.id, characterId);
    return reply.code(201).send(characters.getCharacter(ctx, characterId));
  });
  app.delete<{ Params: { id: string; characterId: string } }>('/api/projects/:id/characters/:characterId', async (req, reply) => {
    projects.removeCharacterFromProject(ctx, req.params.id, req.params.characterId);
    return reply.code(204).send();
  });
  /** Salvataggio del progetto su file (persona.project). */
  app.get<{ Params: Params; Querystring: Q }>('/api/projects/:id/export', async (req, reply) => {
    const data = projects.exportProject(ctx, req.params.id, {
      conversations: bool(req.query.conversations, true),
      sessions: bool(req.query.sessions, true),
    });
    reply.header('Content-Disposition', attachmentHeader('persona-progetto', data.project.name, 'progetto'));
    return data;
  });
  app.post<{ Querystring: Q }>('/api/projects/import', async (req, reply) =>
    reply.code(201).send(
      projects.importProject(ctx, req.body, {
        characters: req.query.characters === 'new' ? 'new' : 'reuse',
        includeConversations: bool(req.query.conversations, true),
        includeSessions: bool(req.query.sessions, true),
      }),
    ),
  );

  /* ---------------- Personaggi ---------------- */
  app.get<{ Querystring: Q }>('/api/characters', async (req) =>
    characters.listCharacters(ctx, { status: req.query.status, projectId: req.query.projectId }),
  );
  app.post('/api/characters', async (req, reply) => {
    // projectId non fa parte dell'identità: indica solo il progetto in cui nasce il personaggio.
    const { projectId, ...input } = (req.body ?? {}) as { projectId?: string | null };
    if (projectId) projects.getProjectRow(ctx, projectId);
    const created = characters.createCharacter(ctx, input as never);
    if (projectId) projects.addCharacterToProject(ctx, projectId, created.id);
    return reply.code(201).send(characters.getCharacter(ctx, created.id));
  });
  app.get<{ Params: Params }>('/api/characters/:id', async (req) => characters.getCharacter(ctx, req.params.id));
  app.put<{ Params: Params }>('/api/characters/:id', async (req) => characters.updateCharacter(ctx, req.params.id, req.body as never));
  app.put<{ Params: Params }>('/api/characters/:id/model', async (req) =>
    characters.setCharacterModel(ctx, req.params.id, ((req.body ?? {}) as { modelConfigId?: string | null }).modelConfigId ?? null),
  );
  app.put<{ Params: Params }>('/api/characters/:id/status', async (req) => characters.setCharacterStatus(ctx, req.params.id, req.body));
  app.delete<{ Params: Params }>('/api/characters/:id', async (req, reply) => {
    characters.deleteCharacter(ctx, req.params.id);
    return reply.code(204).send();
  });
  app.post<{ Params: Params }>('/api/characters/:id/duplicate', async (req, reply) =>
    reply.code(201).send(characters.duplicateCharacter(ctx, req.params.id, req.body ?? {})),
  );
  app.post<{ Params: Params }>('/api/characters/:id/variants', async (req, reply) =>
    reply.code(201).send(characters.createVariant(ctx, req.params.id, req.body ?? {})),
  );
  app.get<{ Params: Params }>('/api/characters/:id/variants', async (req) => characters.listVariants(ctx, req.params.id));
  app.get<{ Params: Params }>('/api/characters/:id/engine-status', async (req) =>
    models.engineStatus(ctx, characters.getCharacterRow(ctx, req.params.id).modelConfigId),
  );
  app.get<{ Params: Params }>('/api/characters/:id/revisions', async (req) => characters.listRevisions(ctx, req.params.id));
  app.post<{ Params: { id: string; revisionId: string } }>('/api/characters/:id/revisions/:revisionId/restore', async (req) =>
    characters.restoreRevision(ctx, req.params.id, req.params.revisionId),
  );
  app.get<{ Params: Params; Querystring: Q }>('/api/characters/:id/export', async (req, reply) => {
    const data = portability.exportCharacter(ctx, req.params.id, {
      conversations: bool(req.query.conversations, true),
      contextual: bool(req.query.contextual, false),
      knowledge: bool(req.query.knowledge, true),
    });
    reply.header('Content-Disposition', attachmentHeader('persona', data.character.name, 'personaggio'));
    return data;
  });
  app.post<{ Querystring: Q }>('/api/characters/import', async (req, reply) => {
    const opts = validate(characterImportOptionsSchema, {
      includeConversations: bool(req.query.conversations, true),
      includeMemories: bool(req.query.memories, true),
      includeKnowledge: bool(req.query.knowledge, true),
    });
    const projectId = req.query.projectId;
    if (projectId) projects.getProjectRow(ctx, projectId);
    const result = portability.importCharacter(ctx, req.body, opts);
    if (projectId) {
      projects.addCharacterToProject(ctx, projectId, result.character.id);
      result.character = characters.getCharacter(ctx, result.character.id);
    }
    return reply.code(201).send(result);
  });

  /* ---------------- Conoscenza ---------------- */
  app.get<{ Params: Params }>('/api/characters/:id/knowledge', async (req) => knowledge.listKnowledge(ctx, req.params.id));
  app.post<{ Params: Params }>('/api/characters/:id/knowledge', async (req, reply) =>
    reply.code(201).send(knowledge.createKnowledgeSource(ctx, req.params.id, req.body as never)),
  );
  app.get<{ Params: Params; Querystring: Q }>('/api/characters/:id/knowledge/search', async (req) =>
    knowledge.searchCharacterKnowledge(ctx, req.params.id, req.query.q ?? ''),
  );
  app.get<{ Params: Params }>('/api/knowledge/:id', async (req) => knowledge.getKnowledgeSource(ctx, req.params.id));
  /** Estrae il testo di un PDF (corpo binario) per l'anteprima prima del salvataggio. */
  app.post<{ Querystring: Q }>('/api/knowledge/extract-pdf', async (req) => {
    if (!Buffer.isBuffer(req.body)) throw new AppError('invalid_pdf', 'Inviare il PDF come application/pdf');
    return extractPdf(req.body, req.query.filename ?? 'documento.pdf');
  });
  app.put<{ Params: Params }>('/api/knowledge/:id', async (req) => knowledge.updateKnowledgeSource(ctx, req.params.id, req.body as never));
  app.delete<{ Params: Params }>('/api/knowledge/:id', async (req, reply) => {
    knowledge.deleteKnowledgeSource(ctx, req.params.id);
    return reply.code(204).send();
  });

  /* ---------------- Memoria ---------------- */
  app.get<{ Querystring: Q }>('/api/memories', async (req) => memory.listMemories(ctx, req.query));
  app.post('/api/memories', async (req, reply) => reply.code(201).send(memory.createMemory(ctx, req.body as never)));
  app.get<{ Params: Params }>('/api/memories/:id', async (req) => memory.getMemory(ctx, req.params.id));
  app.put<{ Params: Params }>('/api/memories/:id', async (req) => memory.updateMemory(ctx, req.params.id, req.body as never));
  app.delete<{ Params: Params }>('/api/memories/:id', async (req, reply) => {
    memory.deleteMemory(ctx, req.params.id);
    return reply.code(204).send();
  });
  app.post<{ Params: Params }>('/api/memories/:id/approve', async (req) => memory.approveMemory(ctx, req.params.id));
  app.post<{ Params: Params }>('/api/memories/:id/promote', async (req, reply) =>
    reply.code(201).send(memory.promoteMemory(ctx, req.params.id, req.body)),
  );
  app.post<{ Params: Params; Querystring: Q }>('/api/characters/:id/memory/consistency', async (req) =>
    memory.checkConsistency(ctx, req.params.id, bool(req.query.llm, false)),
  );
  /** Anteprima del recupero: quali memorie verrebbero selezionate per una query. */
  app.post('/api/memories/retrieve', async (req) => {
    const data = validate(retrievalPreviewSchema, req.body);
    characters.getCharacterRow(ctx, data.characterId);
    const q = await embeddings.embedQuery(ctx, data.query);
    const semantic =
      q.vector && q.model ? { vector: q.vector, model: q.model, weight: getPreferences(ctx).embeddings.semanticWeight } : null;
    return {
      mode: semantic ? 'hybrid' : 'lexical',
      semanticError: q.error,
      core: coreMemories(ctx, data.characterId),
      scoped: searchScopedMemories(ctx, { characterId: data.characterId, scenarioId: data.scenarioId }, data.query, 30, semantic),
    };
  });

  /* ---------------- Conversazioni ---------------- */
  app.get<{ Querystring: Q }>('/api/conversations', async (req) =>
    conversations.listConversations(ctx, {
      characterId: req.query.characterId,
      scenarioId: req.query.scenarioId,
      kind: req.query.kind,
      includeArchived: bool(req.query.archived, false),
      projectId: req.query.projectId,
    }),
  );
  app.post('/api/conversations', async (req, reply) => {
    const conv = conversations.createConversation(ctx, req.body as never);
    if (conv.characterId) processPendingFor(ctx, conv.characterId, conv.id);
    return reply.code(201).send(conv);
  });
  app.get<{ Params: Params; Querystring: Q }>('/api/conversations/:id', async (req) =>
    conversations.getConversationDetail(ctx, req.params.id, { includeSuperseded: bool(req.query.superseded, false) }),
  );
  app.put<{ Params: Params }>('/api/conversations/:id', async (req) => conversations.updateConversation(ctx, req.params.id, req.body));
  app.delete<{ Params: Params }>('/api/conversations/:id', async (req, reply) => {
    conversations.deleteConversation(ctx, req.params.id);
    return reply.code(204).send();
  });
  app.post<{ Params: Params }>('/api/conversations/:id/messages', async (req, reply) => {
    conversations.getConversationRow(ctx, req.params.id);
    return streamResponse(req, reply, (sink, signal) => generation.sendMessage(ctx, req.params.id, req.body, sink, signal));
  });
  app.post<{ Params: Params }>('/api/conversations/:id/turn', async (req, reply) => {
    conversations.getConversationRow(ctx, req.params.id);
    return streamResponse(req, reply, (sink, signal) => generation.takeTurn(ctx, req.params.id, req.body ?? {}, sink, signal));
  });
  app.post<{ Params: Params }>('/api/messages/:id/regenerate', async (req, reply) => {
    conversations.getMessageRow(ctx, req.params.id);
    return streamResponse(req, reply, (sink, signal) => generation.regenerate(ctx, req.params.id, req.body ?? {}, sink, signal));
  });
  app.put<{ Params: Params }>('/api/messages/:id', async (req) => conversations.editMessage(ctx, req.params.id, req.body));
  app.delete<{ Params: Params }>('/api/messages/:id', async (req, reply) => {
    if (generation.isGenerating(conversations.getMessageRow(ctx, req.params.id).conversationId)) {
      throw new AppError('busy', 'Generazione in corso', 409);
    }
    conversations.deleteMessage(ctx, req.params.id);
    return reply.code(204).send();
  });
  app.get<{ Params: Params }>('/api/messages/:id/revisions', async (req) => conversations.listMessageRevisions(ctx, req.params.id));

  /** Ispezione del contesto: cosa verrebbe inviato al modello per il prossimo turno. */
  app.post<{ Params: Params }>('/api/conversations/:id/context-preview', async (req) => {
    const data = validate(contextPreviewSchema, req.body ?? {});
    const conv = conversations.getConversationRow(ctx, req.params.id);
    const speakerId = data.characterId ?? conv.characterId ?? conversations.participantIds(ctx, conv.id)[0];
    if (!speakerId) throw new AppError('validation', 'Nessun personaggio');
    const character = characters.getCharacter(ctx, speakerId);
    const engine = await models.resolveEngine(ctx, character.modelConfigId).catch(() => null);
    const history = conversations.activeMessages(ctx, conv.id);
    const mode = data.mode ?? (conv.defaultMode as 'dialogue');
    if (data.content.trim()) {
      history.push({
        id: 'preview',
        conversationId: conv.id,
        seq: conversations.nextSeq(ctx, conv.id),
        role: 'author',
        characterId: null,
        speakerName: null,
        content: data.content,
        reasoning: null,
        mode,
        language: null,
        status: 'complete',
        providerType: null,
        model: null,
        contextMeta: null,
        regeneratedFromId: null,
        editedAt: null,
        createdAt: new Date().toISOString(),
      });
    }
    return await assembleContext(ctx, {
      conversation: conv,
      speakerId,
      mode,
      responseLanguage: data.language ?? conv.language,
      history,
      engine: {
        providerType: (engine?.config.providerType ?? 'mock') as never,
        model: engine?.model ?? '(nessun modello disponibile)',
        contextLength: engine?.config.contextLength ?? 8192,
        maxTokens: engine?.config.maxTokens ?? 1024,
      },
      touch: false,
    });
  });
  app.post<{ Params: Params }>('/api/conversations/:id/process-memory', async (req) => {
    const { force } = validate(processMemorySchema, req.body ?? {});
    conversations.getConversationRow(ctx, req.params.id);
    return processConversationMemory(ctx, req.params.id, { force });
  });

  /* ---------------- Scenari ---------------- */
  app.get<{ Querystring: Q }>('/api/scenarios', async (req) => scenarios.listScenarios(ctx, { projectId: req.query.projectId }));
  app.get<{ Params: Params; Querystring: Q }>('/api/scenarios/:id/export', async (req, reply) => {
    const data = scenarioPortability.exportScenario(ctx, req.params.id, { sessions: bool(req.query.sessions, true) });
    reply.header('Content-Disposition', attachmentHeader('persona-scenario', data.scenario.title, 'scenario'));
    return data;
  });
  app.post<{ Querystring: Q }>('/api/scenarios/import', async (req, reply) =>
    reply.code(201).send(
      scenarioPortability.importScenario(
        ctx,
        req.body,
        { characters: req.query.characters === 'new' ? 'new' : 'reuse', includeSessions: bool(req.query.sessions, true) },
        { projectId: req.query.projectId || null },
      ),
    ),
  );
  app.post('/api/scenarios', async (req, reply) => reply.code(201).send(scenarios.createScenario(ctx, req.body as never)));
  app.get<{ Params: Params }>('/api/scenarios/:id', async (req) => scenarios.getScenario(ctx, req.params.id));
  app.put<{ Params: Params }>('/api/scenarios/:id', async (req) => scenarios.updateScenario(ctx, req.params.id, req.body as never));
  app.delete<{ Params: Params }>('/api/scenarios/:id', async (req, reply) => {
    scenarios.deleteScenario(ctx, req.params.id);
    return reply.code(204).send();
  });
  app.post<{ Params: Params }>('/api/scenarios/:id/participants', async (req, reply) =>
    reply.code(201).send(scenarios.addParticipant(ctx, req.params.id, req.body as never)),
  );
  app.put<{ Params: Params }>('/api/scenario-participants/:id', async (req) => scenarios.updateParticipant(ctx, req.params.id, req.body));
  app.delete<{ Params: Params }>('/api/scenario-participants/:id', async (req) => scenarios.removeParticipant(ctx, req.params.id));
  app.post<{ Params: Params }>('/api/scenarios/:id/relationships', async (req, reply) =>
    reply.code(201).send(scenarios.addRelationship(ctx, req.params.id, req.body)),
  );
  app.delete<{ Params: Params }>('/api/scenario-relationships/:id', async (req) => scenarios.deleteRelationship(ctx, req.params.id));
  app.post<{ Params: Params }>('/api/scenarios/:id/events', async (req, reply) =>
    reply.code(201).send(scenarios.addEvent(ctx, req.params.id, req.body)),
  );
  app.put<{ Params: Params }>('/api/scenario-events/:id', async (req) => scenarios.updateEvent(ctx, req.params.id, req.body));
  app.delete<{ Params: Params }>('/api/scenario-events/:id', async (req) => scenarios.deleteEvent(ctx, req.params.id));

  /* ---------------- Backup ---------------- */
  app.get('/api/backups', async () => portability.listBackups(ctx));
  app.post('/api/backups', async (_req, reply) => reply.code(201).send(await portability.createBackup(ctx)));
  app.get<{ Params: { name: string } }>('/api/backups/:name', async (req, reply) => {
    const file = portability.backupPath(ctx, req.params.name);
    reply.header('Content-Type', 'application/vnd.sqlite3');
    reply.header('Content-Disposition', `attachment; filename="${req.params.name}"`);
    return reply.send(createReadStream(file));
  });
  app.delete<{ Params: { name: string } }>('/api/backups/:name', async (req, reply) => {
    portability.deleteBackup(ctx, req.params.name);
    return reply.code(204).send();
  });
  app.post<{ Params: { name: string } }>('/api/backups/:name/restore', async (req) => portability.restoreFromStored(ctx, req.params.name));
  app.post('/api/restore', async (req) => {
    if (!Buffer.isBuffer(req.body)) throw new AppError('invalid_backup', 'Inviare il file del database come application/octet-stream');
    return portability.restoreFromBuffer(ctx, req.body);
  });
}
