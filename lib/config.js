/*
 * SECURITY REVIEW: loaded by bin/charter-diagnose.js; never run directly.
 * Claim, to verify against the code below (procedure: AGENTS.md):
 * Reads .env and librechat.yaml, lists the plugin folder, and checks whether a
 * file named bash exists on PATH (it is never run). No network, writes or
 * processes.
 */
'use strict';

const fs = require('fs');
const path = require('path');

/** Minimal .env parser (KEY=VALUE, quotes, comments). No dependency on dotenv. */
function parseEnvFile(file) {
  const out = {};
  if (!file || !fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if (/^(['"]).*\1$/.test(v)) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    out[m[1]] = v;
  }
  return out;
}

const truthy = (v) => typeof v === 'string' && /^(1|true|yes|on)$/i.test(v.trim());

/**
 * Reads librechat.yaml and the environment into the facts the conformance
 * checks need. Missing files are reported, never fatal: the database alone
 * still supports most checks.
 */
function readDeployment({ root, configPath, envPath, borrow }) {
  const facts = { root, notes: [] };

  const envFile = envPath || path.join(root, '.env');
  const env = { ...parseEnvFile(envFile), ...process.env };
  facts.env_file = fs.existsSync(envFile) ? envFile : null;

  const cfgFile = configPath || env.CONFIG_PATH || path.join(root, 'librechat.yaml');
  let config = null;
  if (/^https?:\/\//.test(cfgFile)) {
    facts.notes.push(`librechat.yaml is loaded from a URL (${cfgFile}); pass --config with a local copy to include it.`);
  } else if (fs.existsSync(cfgFile)) {
    try {
      const yaml = borrow('js-yaml');
      config = yaml.load(fs.readFileSync(cfgFile, 'utf8')) || {};
      facts.config_file = cfgFile;
    } catch (e) {
      facts.notes.push(`Could not parse ${cfgFile}: ${e.message}`);
    }
  } else {
    facts.notes.push(`No librechat.yaml found at ${cfgFile}; LibreChat defaults are assumed.`);
  }
  facts.config_loaded = config != null;
  config = config || {};

  const agentsEndpoint = (config.endpoints && config.endpoints.agents) || {};
  facts.config_version = config.version || null;
  facts.tool_approval = agentsEndpoint.toolApproval || null;
  facts.capabilities = Array.isArray(agentsEndpoint.capabilities) ? agentsEndpoint.capabilities : null; // null = defaults
  facts.recursion_limit = agentsEndpoint.recursionLimit ?? null;
  facts.max_recursion_limit = agentsEndpoint.maxRecursionLimit ?? null;
  facts.disable_builder = agentsEndpoint.disableBuilder === true;
  facts.checkpointer = agentsEndpoint.checkpointer || null;
  facts.management_api = !!(agentsEndpoint.managementApi && agentsEndpoint.managementApi.auth);

  const iface = config.interface || {};
  facts.interface_agents = iface.agents ?? null;
  facts.interface_remote_agents = iface.remoteAgents ?? null;
  facts.interface_schedules = iface.schedules ?? null;

  facts.balance_enabled = !!(config.balance && config.balance.enabled);
  facts.transactions_enabled = !(config.transactions && config.transactions.enabled === false);
  facts.mcp_servers = config.mcpServers ? Object.keys(config.mcpServers) : [];
  facts.actions_allowed_domains = (config.actions && config.actions.allowedDomains) || null;

  const pluginsDir = env.DEPLOYMENT_PLUGINS_DIR || './plugin';
  facts.plugins_dir = path.isAbsolute(pluginsDir) ? pluginsDir : path.resolve(root, pluginsDir);
  const dataDir = env.DEPLOYMENT_PLUGIN_DATA_DIR || './data/plugins';
  facts.plugin_data_dir = path.isAbsolute(dataDir) ? dataDir : path.resolve(root, dataDir);
  facts.plugin_hooks_enabled = truthy(env.DEPLOYMENT_PLUGIN_HOOKS);
  facts.installed_plugins = fs.existsSync(facts.plugins_dir)
    ? fs
        .readdirSync(facts.plugins_dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() || d.isSymbolicLink())
        .map((d) => d.name)
    : [];

  facts.bash_available = detectBash();
  facts.running_in_container = fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv');
  facts.redis_streams = truthy(env.USE_REDIS_STREAMS);
  return facts;
}

/** Plugin command hooks are spawned with `bash -c` on POSIX hosts. */
function detectBash() {
  if (process.platform === 'win32') return null;
  const dirs = (process.env.PATH || '/usr/local/bin:/usr/bin:/bin').split(':');
  return dirs.some((d) => {
    try {
      fs.accessSync(path.join(d, 'bash'), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

module.exports = { readDeployment, parseEnvFile, truthy };
