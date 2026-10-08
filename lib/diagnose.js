/*
 * SECURITY REVIEW: loaded by bin/charter-diagnose.js; never run directly.
 * Claim, to verify against the code below (procedure: AGENTS.md):
 * Reads the LibreChat root package.json for its version; otherwise pure. No
 * network, database, writes or processes.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { evaluateAgent } = require('./agents');
const { evaluateConformance } = require('./conformance');
const { operationMethods } = require('./tools');
const { draftCharter } = require('./draft');

const TOOL_VERSION = require('../package.json').version;
const SPEC_VERSION = '0.1.1';

function librechatVersion(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version || null;
  } catch {
    return null;
  }
}

/**
 * Pure function over a snapshot + deployment facts + observations.
 * Everything the report shows comes from the object this returns.
 */
/** domain key (dots as ---) → { operationId: HTTP method } from stored OpenAPI specs. */
function buildActionMethods(snap, yaml) {
  const actionMethods = new Map();
  for (const a of snap.actions || []) {
    if (!a.domain) continue;
    const key = String(a.domain).split('.').join('---');
    actionMethods.set(key, { ...(actionMethods.get(key) || {}), ...operationMethods(a.raw_spec, yaml) });
  }
  return actionMethods;
}

function diagnose({ snap, deployment, observations, probes, borrowYaml, now = new Date().toISOString() }) {
  const usersById = new Map((snap.users || []).map((u) => [u._id, u]));
  const actionMethods = buildActionMethods(snap, borrowYaml);
  const ctx = {
    acl: snap.acl || [],
    usersById,
    policy: deployment.tool_approval,
    usage: snap.usage || {},
    schedules: snap.schedules || [],
    actionMethods,
    deployment,
    now,
  };
  const agents = snap.agents.map((a) => evaluateAgent(a, ctx)).sort((a, b) => b.wrongs.length - a.wrongs.length || b.exposure - a.exposure);
  const conformance = evaluateConformance({ snap, results: agents, deployment, observations });

  const used = agents.filter((a) => a.usage.conversations > 0);
  const tally = (list, pick) => {
    const t = {};
    for (const a of list) for (const x of pick(a)) {
      t[x.key] = t[x.key] || { label: x.label, n: x.n, met: 0, stated: 0, partial: 0, missing: 0, violated: 0, 'n/a': 0 };
      t[x.key][x.status] += 1;
    }
    return t;
  };

  const summary = {
    agents: agents.length,
    agents_used: used.length,
    agents_shared: agents.filter((a) => a.sharing.shared).length,
    agents_public: agents.filter((a) => a.sharing.principals.public).length,
    agents_with_consequential_tools: agents.filter((a) => a.tools.some((t) => ['write', 'irreversible', 'code'].includes(t.access) || t.wildcard)).length,
    could_activate: agents.filter((a) => a.activation.complete).length,
    need_approval: agents.filter((a) => a.activation.path === 'approval').length,
    with_wrongs: agents.filter((a) => a.wrongs.length).length,
    no_never_do: agents.filter((a) => a.pillars.find((p) => p.key === 'scope').status === 'missing').length,
    no_escalation_recipient: agents.filter((a) => a.pillars.find((p) => p.key === 'escalation_recipient').status === 'missing').length,
    irreversible_unheld_agents: agents.filter((a) => a.pillars.find((p) => p.key === 'constraints').status === 'violated').length,
    owner_left: agents.filter((a) => !a.author.exists).length,
    changed_after_sharing: agents.filter((a) => a.lifecycle.some((l) => l.key === 'changed_after_sharing')).length,
    pillars: tally(agents, (a) => a.pillars),
    header: tally(agents, (a) => a.header),
    triggers: tally(agents, (a) => a.triggers),
    wrongs: countStrings(agents.flatMap((a) => a.wrongs)),
    rights: countStrings(agents.flatMap((a) => a.rights)),
  };

  return {
    tool: { name: 'librechat-charter-diagnostic', version: TOOL_VERSION },
    spec: { name: 'Delegation Charter Specification', version: SPEC_VERSION, url: 'https://github.com/almma-ai/delegation-charter' },
    generated_at: now,
    run_by: snap.run_by || null,
    source: { kind: snap.source, database: snap.database || null, collected_at: snap.collected_at, collections: snap.collections },
    librechat: { version: librechatVersion(deployment.root), config_loaded: deployment.config_loaded, config_version: deployment.config_version, notes: deployment.notes },
    deployment: {
      tool_approval: deployment.tool_approval ? { enabled: deployment.tool_approval.enabled === true, mode: deployment.tool_approval.mode || 'default', allow: deployment.tool_approval.allow || [], ask: deployment.tool_approval.ask || [], deny: deployment.tool_approval.deny || [], hooks: (deployment.tool_approval.hooks || []).length } : null,
      balance_enabled: deployment.balance_enabled,
      plugin_hooks_enabled: deployment.plugin_hooks_enabled,
      bash_available: deployment.bash_available,
      installed_plugins: deployment.installed_plugins,
      mcp_servers: deployment.mcp_servers.length,
      agent_api_keys: snap.agent_api_keys,
      schedules_active: (snap.schedules || []).filter((s) => s.enabled).length,
      audit_log: snap.audit_log,
    },
    summary,
    conformance,
    agents,
    observations,
    probes: probes || null,
    drafts: agents.map((a) => draftCharter(a, { now })),
  };
}

function countStrings(list) {
  const m = {};
  for (const s of list) m[s] = (m[s] || 0) + 1;
  return Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .map(([text, n]) => ({ text, n }));
}

/** Counts only: safe to post publicly or send to the spec editors. */
function aggregate(result) {
  const s = result.summary;
  const strip = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { met: v.met, stated: v.stated, partial: v.partial, missing: v.missing, violated: v.violated, na: v['n/a'] }]));
  return {
    schema: 'librechat-charter-diagnostic/aggregate/1',
    tool_version: result.tool.version,
    spec_version: result.spec.version,
    librechat_version: result.librechat.version,
    snapshot_utc: result.generated_at.slice(0, 10),
    agents: s.agents,
    agents_used: s.agents_used,
    agents_shared: s.agents_shared,
    agents_public: s.agents_public,
    agents_with_consequential_tools: s.agents_with_consequential_tools,
    could_activate: s.could_activate,
    need_approval: s.need_approval,
    irreversible_unheld_agents: s.irreversible_unheld_agents,
    owner_left: s.owner_left,
    changed_after_sharing: s.changed_after_sharing,
    header: strip(s.header),
    pillars: strip(s.pillars),
    triggers: strip(s.triggers),
    conformance: {
      reached: result.conformance.reached,
      checks: Object.fromEntries(result.conformance.checks.map((c) => [c.key, c.status])),
    },
    observations: result.observations && result.observations.present ? { days: result.observations.window ? Math.max(1, Math.round((new Date(result.observations.window.last) - new Date(result.observations.window.first)) / 86400000)) : null, ...result.observations.totals } : null,
    probes: result.probes ? result.probes.flatMap((p) => (p.probes || []).map((x) => `${x.key}:${x.result}`)).reduce((m, k) => ((m[k] = (m[k] || 0) + 1), m), {}) : null,
  };
}

module.exports = { diagnose, aggregate, buildActionMethods, SPEC_VERSION };
