/*
 * SECURITY REVIEW: loaded by bin/charter-diagnose.js; never run directly.
 * Claim, to verify against the code below (procedure: AGENTS.md):
 * Pure functions: no network, database, files, processes or dynamic code.
 */
'use strict';

/**
 * Parses the tool keys stored on a LibreChat agent and infers an access
 * class for each, as SPEC pillar 5 requires ("each marked read, write or
 * irreversible"). LibreChat stores no access class, so everything here is
 * INFERRED and labelled as such in the report and in draft charters.
 *
 * Key formats (librechat-data-provider, v0.8.8):
 *   MCP tool         <tool>_mcp_<server>
 *   All tools of MCP sys__all__sys_mcp_<server>   (future tools included)
 *   OpenAPI action   <operationId>_action_<domain with --- for dots>
 *   Built-in / legacy plugin: plain name (web_search, execute_code, dalle, ...)
 */

const MCP_DELIMITER = '_mcp_';
const MCP_ALL = 'sys__all__sys';
const ACTION_DELIMITER = '_action_';
const ACTION_DOMAIN_SEPARATOR = '---';

/** Built-ins and common legacy plugins with a known effect. */
const KNOWN = {
  web_search: { access: 'read', reach: 'external', label: 'Web search' },
  file_search: { access: 'read', reach: 'internal', label: 'File search' },
  retrieval: { access: 'read', reach: 'internal', label: 'Retrieval' },
  read_file: { access: 'read', reach: 'internal', label: 'Read file' },
  skill: { access: 'read', reach: 'internal', label: 'Skills' },
  ui_resources: { access: 'read', reach: 'internal', label: 'UI resources' },
  memory: { access: 'write', reach: 'internal', label: 'Persistent memory' },
  execute_code: { access: 'code', reach: 'external', label: 'Code execution' },
  code_interpreter: { access: 'code', reach: 'external', label: 'Code interpreter' },
  bash_tool: { access: 'code', reach: 'external', label: 'Bash' },
  run_tools_with_code: { access: 'code', reach: 'external', label: 'Programmatic tool calls' },
  run_tools_with_bash: { access: 'code', reach: 'external', label: 'Programmatic tool calls' },
  create_file: { access: 'write', reach: 'internal', label: 'Create file' },
  edit_file: { access: 'write', reach: 'internal', label: 'Edit file' },
  ask_user_question: { access: 'read', reach: 'internal', label: 'Ask User' },
  calculator: { access: 'read', reach: 'internal', label: 'Calculator' },
  wolfram: { access: 'read', reach: 'external', label: 'Wolfram' },
  google: { access: 'read', reach: 'external', label: 'Google search' },
  tavily_search_results_json: { access: 'read', reach: 'external', label: 'Tavily search' },
  traversaal_search: { access: 'read', reach: 'external', label: 'Traversaal search' },
  'azure-ai-search': { access: 'read', reach: 'external', label: 'Azure AI Search' },
  youtube: { access: 'read', reach: 'external', label: 'YouTube' },
  open_weather: { access: 'read', reach: 'external', label: 'Weather' },
  dalle: { access: 'write', reach: 'external', label: 'Image generation' },
  image_gen_oai: { access: 'write', reach: 'external', label: 'Image generation' },
  image_edit_oai: { access: 'write', reach: 'external', label: 'Image editing' },
  flux: { access: 'write', reach: 'external', label: 'Image generation' },
  'stable-diffusion': { access: 'write', reach: 'external', label: 'Image generation' },
  gemini_image_gen: { access: 'write', reach: 'external', label: 'Image generation' },
};

/**
 * Verb vocabularies. Tool names are usually verb-first (get_x, send_y), so the
 * FIRST token found in any vocabulary decides: "list_deleted_items" is a read,
 * "delete_item" is irreversible. Nouns that double as verbs (post, order,
 * email, message) are deliberately left out to avoid misreading get_post.
 */
const IRREVERSIBLE = new Set(
  'delete del remove rm void drop destroy purge wipe truncate pay charge refund transfer wire payout send notify publish tweet deploy release merge approve reject sign submit cancel terminate revoke disable ban kick execute exec trigger invoke reserve purchase buy checkout'.split(
    ' ',
  ),
);
const WRITE = new Set(
  'create add record insert update upsert edit modify patch put set write save upload move rename copy assign invite share comment reply draft schedule tag label link attach enable close open archive star mark append import sync push commit'.split(
    ' ',
  ),
);
const READ = new Set(
  'get list read fetch search find lookup query retrieve view show describe browse count check status info inspect preview download export summarize summarise analyze analyse stats history'.split(
    ' ',
  ),
);

function tokens(name) {
  return String(name || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function classifyVerb(name) {
  for (const t of tokens(name)) {
    if (IRREVERSIBLE.has(t)) return 'irreversible';
    if (WRITE.has(t)) return 'write';
    if (READ.has(t)) return 'read';
  }
  return 'unknown';
}

/** OpenAPI raw_spec → { operationId: METHOD }. JSON or simple YAML; best-effort. */
function operationMethods(rawSpec, yaml) {
  const map = {};
  if (!rawSpec || typeof rawSpec !== 'string') return map;
  let spec = null;
  try {
    spec = JSON.parse(rawSpec);
  } catch {
    try {
      spec = yaml ? yaml.load(rawSpec) : null;
    } catch {
      spec = null;
    }
  }
  if (!spec || typeof spec !== 'object' || !spec.paths) return map;
  for (const [route, ops] of Object.entries(spec.paths)) {
    if (!ops || typeof ops !== 'object') continue;
    for (const [method, op] of Object.entries(ops)) {
      if (!op || typeof op !== 'object') continue;
      const id = op.operationId || `${method}_${route}`;
      map[id] = method.toUpperCase();
    }
  }
  return map;
}

function accessFromMethod(method) {
  switch (method) {
    case 'GET':
    case 'HEAD':
    case 'OPTIONS':
      return 'read';
    case 'DELETE':
      return 'irreversible';
    case 'POST':
    case 'PUT':
    case 'PATCH':
      return 'write';
    default:
      return 'unknown';
  }
}

/**
 * @param {string} key  tool key as stored on the agent
 * @param {object} ctx  { actionsByDomain: Map<domainKey, {methods}> }
 */
function parseTool(key, ctx = {}) {
  const raw = String(key);
  if (raw.includes(MCP_DELIMITER)) {
    const idx = raw.lastIndexOf(MCP_DELIMITER);
    const tool = raw.slice(0, idx);
    const server = raw.slice(idx + MCP_DELIMITER.length);
    if (tool === MCP_ALL) {
      return {
        key: raw,
        kind: 'mcp_all',
        server,
        tool: '*',
        label: `Every tool on MCP server "${server}", including tools added later`,
        access: 'unknown',
        reach: 'external',
        basis: 'wildcard grant',
        wildcard: true,
      };
    }
    const access = classifyVerb(tool);
    return {
      key: raw,
      kind: 'mcp',
      server,
      tool,
      label: `${tool} (MCP: ${server})`,
      access,
      reach: 'external',
      basis: access === 'unknown' ? 'no verb in name' : 'inferred from tool name',
    };
  }
  if (raw.includes(ACTION_DELIMITER)) {
    const idx = raw.lastIndexOf(ACTION_DELIMITER);
    const op = raw.slice(0, idx);
    const domainKey = raw.slice(idx + ACTION_DELIMITER.length);
    const domain = domainKey.split(ACTION_DOMAIN_SEPARATOR).join('.');
    const methods = ctx.actionMethods && ctx.actionMethods.get(domainKey);
    const method = methods ? methods[op] : undefined;
    let access = method ? accessFromMethod(method) : classifyVerb(op);
    let basis = method ? `HTTP ${method} in the action's OpenAPI spec` : 'inferred from operation name';
    if (access === 'unknown') {
      access = 'write';
      basis = 'unknown HTTP method; treated as write';
    }
    return {
      key: raw,
      kind: 'action',
      domain,
      tool: op,
      method: method || null,
      label: `${op} (action: ${domain})`,
      access,
      reach: 'external',
      basis,
    };
  }
  const known = KNOWN[raw];
  if (known) {
    return { key: raw, kind: 'builtin', tool: raw, ...known, basis: 'known LibreChat tool' };
  }
  const access = classifyVerb(raw);
  return {
    key: raw,
    kind: 'plugin',
    tool: raw,
    label: raw,
    access,
    reach: 'unknown',
    basis: access === 'unknown' ? 'no verb in name' : 'inferred from tool name',
  };
}

/** Access classes that SPEC pillar 8 says must be held for a person when irreversible. */
function isConsequential(t) {
  return t.access === 'write' || t.access === 'irreversible' || t.access === 'code' || t.wildcard === true;
}
function isIrreversibleLike(t) {
  return t.access === 'irreversible' || t.access === 'code' || t.wildcard === true;
}

module.exports = {
  MCP_DELIMITER,
  MCP_ALL,
  ACTION_DELIMITER,
  parseTool,
  classifyVerb,
  operationMethods,
  isConsequential,
  isIrreversibleLike,
};
