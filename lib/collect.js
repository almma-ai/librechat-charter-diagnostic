/*
 * SECURITY REVIEW: loaded by bin/charter-diagnose.js; never run directly.
 * Claim, to verify against the code below (procedure: AGENTS.md):
 * Database reads only: find, countDocuments, estimatedDocumentCount, distinct,
 * listCollections. withDb() opens one MongoDB connection to the URI it is given
 * and always closes it. loadSnapshot() reads one file. No writes, no processes.
 */
'use strict';

/**
 * Reads the parts of a LibreChat database the diagnosis needs and returns a
 * normalized snapshot. Read-only: every call is find / countDocuments /
 * listCollections. Never read: message bodies, conversation titles, user
 * emails, passwords, tokens, API key hashes, action credentials.
 *
 * The same snapshot shape can be produced without Node by
 * scripts/export-snapshot.mongosh.js and passed with --snapshot.
 */

const SNAPSHOT_VERSION = 1;

const AGENT_FIELDS = {
  _id: 1,
  id: 1,
  name: 1,
  description: 1,
  instructions: 1,
  provider: 1,
  model: 1,
  tools: 1,
  actions: 1,
  mcpServerNames: 1,
  edges: 1,
  agent_ids: 1,
  subagents: 1,
  skills: 1,
  skills_enabled: 1,
  author: 1,
  authorName: 1,
  support_contact: 1,
  category: 1,
  is_promoted: 1,
  recursion_limit: 1,
  end_after_tools: 1,
  tool_options: 1,
  memory_scope: 1,
  conversation_starters: 1,
  tenantId: 1,
  createdAt: 1,
  updatedAt: 1,
  'versions.updatedAt': 1,
  'versions.createdAt': 1,
  'versions.updatedBy': 1,
  'versions.tools': 1,
};

const str = (v) => (v == null ? null : String(v));
const iso = (v) => (v ? new Date(v).toISOString() : null);

function normalizeAgent(a) {
  const versions = Array.isArray(a.versions) ? a.versions : [];
  return {
    _id: str(a._id),
    id: str(a.id),
    name: a.name || null,
    description: a.description || '',
    instructions: typeof a.instructions === 'string' ? a.instructions : '',
    provider: a.provider || null,
    model: a.model || null,
    tools: Array.isArray(a.tools) ? a.tools.map(String) : [],
    actions: Array.isArray(a.actions) ? a.actions.map(String) : [],
    mcpServerNames: Array.isArray(a.mcpServerNames) ? a.mcpServerNames.map(String) : [],
    edges: Array.isArray(a.edges) ? a.edges.map((e) => ({ from: str(e && e.from), to: str(e && e.to), type: (e && e.edgeType) || (e && e.type) || null })) : [],
    agent_ids: Array.isArray(a.agent_ids) ? a.agent_ids.map(String) : [],
    subagents: a.subagents && typeof a.subagents === 'object' ? { enabled: a.subagents.enabled === true, count: Array.isArray(a.subagents.agent_ids) ? a.subagents.agent_ids.length : null } : null,
    skills: Array.isArray(a.skills) ? a.skills.length : 0,
    skills_enabled: a.skills_enabled === true,
    author: str(a.author),
    authorName: a.authorName || null,
    support_contact:
      a.support_contact && typeof a.support_contact === 'object'
        ? { name: a.support_contact.name || '', email: a.support_contact.email || '' }
        : null,
    category: a.category || null,
    is_promoted: a.is_promoted === true,
    recursion_limit: typeof a.recursion_limit === 'number' ? a.recursion_limit : null,
    end_after_tools: a.end_after_tools === true,
    tool_options: a.tool_options && typeof a.tool_options === 'object' ? a.tool_options : null,
    memory_scope: a.memory_scope || null,
    tenantId: a.tenantId || null,
    createdAt: iso(a.createdAt),
    updatedAt: iso(a.updatedAt),
    versions: versions.map((v) => ({
      at: iso((v && (v.updatedAt || v.createdAt)) || null),
      by: str(v && v.updatedBy),
      tools: Array.isArray(v && v.tools) ? v.tools.map(String) : null,
    })),
  };
}

async function listNames(db) {
  const cols = await db.listCollections({}, { nameOnly: true }).toArray();
  return new Set(cols.map((c) => c.name));
}

async function safe(fn, fallback) {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

async function findAgents(db) {
  try {
    return await db.collection('agents').find({}, { projection: AGENT_FIELDS }).toArray();
  } catch {
    // Some Mongo-compatible servers reject dotted projections into arrays.
    const { ['versions.updatedAt']: _a, ['versions.createdAt']: _b, ['versions.updatedBy']: _c, ['versions.tools']: _d, ...rest } = AGENT_FIELDS;
    return db.collection('agents').find({}, { projection: { ...rest, versions: 1 } }).toArray();
  }
}

async function conversationUsage(db) {
  const usage = {};
  const cursor = db
    .collection('conversations')
    .find({ agent_id: { $exists: true, $ne: null } }, { projection: { _id: 0, agent_id: 1, updatedAt: 1, user: 1 } });
  for await (const c of cursor) {
    const id = String(c.agent_id);
    const u = (usage[id] = usage[id] || { conversations: 0, users: new Set(), last: null });
    u.conversations += 1;
    if (c.user) u.users.add(String(c.user));
    const t = c.updatedAt ? new Date(c.updatedAt).toISOString() : null;
    if (t && (!u.last || t > u.last)) u.last = t;
  }
  for (const u of Object.values(usage)) u.users = u.users.size;
  return usage;
}

/**
 * @param {object} db  a connected mongodb Db
 */
async function collectFromDb(db, { dbName } = {}) {
  const names = await listNames(db);
  const has = (n) => names.has(n);
  const snap = {
    snapshot_version: SNAPSHOT_VERSION,
    source: 'mongodb',
    database: dbName || null,
    collected_at: new Date().toISOString(),
    collections: {},
  };
  for (const n of ['agents', 'users', 'aclentries', 'accessroles', 'roles', 'groups', 'actions', 'conversations', 'schedules', 'agentapikeys', 'auditlogs', 'toolcalls', 'mcpservers', 'projects']) {
    snap.collections[n] = has(n);
  }
  if (!has('agents')) {
    snap.error = 'No "agents" collection. Is this the LibreChat database?';
    return snap;
  }

  snap.agents = (await findAgents(db)).map(normalizeAgent);

  snap.users = has('users')
    ? (await db.collection('users').find({}, { projection: { _id: 1, name: 1, username: 1, role: 1, provider: 1, tenantId: 1 } }).toArray()).map((u) => ({
        _id: str(u._id),
        name: u.name || u.username || null,
        role: u.role || null,
        provider: u.provider || null,
      }))
    : [];

  snap.acl = has('aclentries')
    ? (
        await db
          .collection('aclentries')
          .find({ resourceType: { $in: ['agent', 'remoteAgent'] } }, { projection: { _id: 0, resourceType: 1, resourceId: 1, principalType: 1, principalId: 1, permBits: 1, grantedBy: 1, grantedAt: 1, createdAt: 1 } })
          .toArray()
      ).map((e) => ({
        resourceType: e.resourceType,
        resourceId: str(e.resourceId),
        principalType: e.principalType,
        principalId: str(e.principalId),
        permBits: typeof e.permBits === 'number' ? e.permBits : null,
        grantedBy: str(e.grantedBy),
        grantedAt: iso(e.grantedAt || e.createdAt),
      }))
    : [];

  snap.roles = has('roles')
    ? (await db.collection('roles').find({}, { projection: { _id: 0, name: 1, permissions: 1 } }).toArray()).map((r) => ({
        name: r.name,
        agents: (r.permissions && (r.permissions.AGENTS || r.permissions.agents)) || null,
        remoteAgents: (r.permissions && (r.permissions.REMOTE_AGENTS || r.permissions.remoteAgents)) || null,
      }))
    : [];

  snap.groups = has('groups') ? await safe(() => db.collection('groups').countDocuments(), null) : null;

  snap.actions = has('actions')
    ? (await db.collection('actions').find({}, { projection: { _id: 0, action_id: 1, agent_id: 1, 'metadata.domain': 1, 'metadata.raw_spec': 1 } }).toArray()).map((a) => ({
        action_id: str(a.action_id),
        agent_id: str(a.agent_id),
        domain: (a.metadata && a.metadata.domain) || null,
        raw_spec: (a.metadata && a.metadata.raw_spec) || null,
      }))
    : [];

  snap.usage = has('conversations') ? await safe(() => conversationUsage(db), {}) : {};

  snap.schedules = has('schedules')
    ? (await db.collection('schedules').find({ erased: { $ne: true } }, { projection: { _id: 0, agent_id: 1, enabled: 1, 'cadence.frequency': 1, user: 1, lastRunAt: 1 } }).toArray()).map((s) => ({
        agent_id: str(s.agent_id),
        enabled: s.enabled !== false,
        frequency: (s.cadence && s.cadence.frequency) || null,
        user: str(s.user),
      }))
    : [];

  snap.agent_api_keys = has('agentapikeys')
    ? {
        total: await safe(() => db.collection('agentapikeys').countDocuments(), null),
        used: await safe(() => db.collection('agentapikeys').countDocuments({ lastUsedAt: { $ne: null } }), null),
        users: (await safe(() => db.collection('agentapikeys').distinct('userId'), [])).map(String),
      }
    : null;

  if (has('auditlogs')) {
    const byAction = {};
    const cursor = db.collection('auditlogs').find({}, { projection: { _id: 0, action: 1, category: 1 } });
    let total = 0;
    for await (const r of cursor) {
      total += 1;
      const k = `${r.category || '?'}:${r.action || '?'}`;
      byAction[k] = (byAction[k] || 0) + 1;
    }
    snap.audit_log = { total, by_action: byAction };
  } else {
    snap.audit_log = null;
  }

  snap.tool_calls_stored = has('toolcalls') ? await safe(() => db.collection('toolcalls').estimatedDocumentCount(), null) : null;
  snap.mcp_servers_in_db = has('mcpservers') ? await safe(() => db.collection('mcpservers').countDocuments(), null) : null;

  return snap;
}

/** Opens a read-preferring connection, runs fn(db, mongodb), always closes. */
async function withDb(uri, { borrow }, fn) {
  const mongodb = borrow('mongodb');
  const client = new mongodb.MongoClient(uri, { serverSelectionTimeoutMS: 8000, readPreference: 'secondaryPreferred' });
  await client.connect();
  try {
    return await fn(client.db(), mongodb);
  } finally {
    await client.close();
  }
}

function loadSnapshot(file) {
  const snap = JSON.parse(require('fs').readFileSync(file, 'utf8'));
  if (!snap || !Array.isArray(snap.agents)) throw new Error(`${file} is not a charter-diagnostic snapshot`);
  snap.agents = snap.agents.map((a) => (a.versions && a.versions.every((v) => 'at' in v) ? a : normalizeAgent(a)));
  snap.source = snap.source || 'snapshot';
  return snap;
}

module.exports = { collectFromDb, withDb, loadSnapshot, normalizeAgent, SNAPSHOT_VERSION };
