/*
 * SECURITY REVIEW: loaded by bin/charter-diagnose.js; never run directly.
 * Claim, to verify against the code below (procedure: AGENTS.md):
 * Pure functions: no network, database, files, processes or dynamic code.
 */
'use strict';

/**
 * Tests the deployment against SPEC.md v0.1.1 §Platform conformance.
 * Each clause is one check. `close_with` says what would close the gap, in
 * the terms that matter for a LibreChat operator or contributor:
 *   config  a librechat.yaml or .env change, available today
 *   plugin  buildable as an Agent Plugin on v0.8.8 hooks, no core change
 *   core    needs a change to LibreChat itself
 */

const { holdsAnything } = require('./policy');
const { isIrreversibleLike } = require('./tools');

const PASS = new Set(['supported', 'configured']);

function roleShareSummary(roles) {
  const sharers = [];
  const publics = [];
  for (const r of roles || []) {
    const a = r.agents || {};
    if (a.SHARE === true || a.share === true) sharers.push(r.name);
    if (a.SHARE_PUBLIC === true || a.public === true) publics.push(r.name);
  }
  return { sharers, publics };
}

function evaluateConformance({ snap, results, deployment, observations }) {
  const agents = results;
  const n = agents.length;
  const policy = deployment.tool_approval;
  const checks = [];
  const add = (c) => checks.push(c);

  // ------------------------------------------------------------- Level 1
  add({
    level: 1,
    key: 'capture_must_fields',
    clause: 'Capture every MUST field.',
    status: 'not_supported',
    evidence:
      'The agent record has fields for name, description, instructions, tools and a free-text support contact. It has none for an accountable owner, escalation recipient, approval authority, never-do list, access class per tool, escalation rules or state.',
    close_with: 'plugin',
    close_note: 'A plugin can store a charter per agent (JSON keyed by agent ID). Editing it inside the agent builder needs a core UI change.',
  });
  add({
    level: 1,
    key: 'refuse_incomplete',
    clause: 'Refuse to approve an incomplete charter.',
    status: 'not_supported',
    evidence: 'There is no approval step: an agent runs as soon as it is saved.',
    close_with: 'plugin',
    close_note: 'A RunStart or PreToolUse hook can refuse runs of agents without an Active charter.',
  });
  const multiVersion = snap.agents.filter((a) => a.versions.length > 1).length;
  const liveIds = new Set(snap.agents.map((a) => a.id));
  const deleted = Object.entries(snap.usage || {}).filter(([id]) => !liveIds.has(id));
  const deletedConvos = deleted.reduce((s, [, u]) => s + u.conversations, 0);
  add({
    level: 1,
    key: 'keep_versions',
    clause: 'Keep every charter version.',
    status: 'partial',
    evidence: `LibreChat stores agent versions (${multiVersion} of ${n} agents have more than one). Deleting an agent deletes its history: ${deleted.length} deleted agents still have ${deletedConvos} conversations whose configuration can no longer be read.`,
    close_with: 'core',
    close_note: 'Retire instead of delete, so records stay readable.',
    metrics: { agents_with_versions: multiVersion, deleted_agents_with_traffic: deleted.length, conversations_on_deleted_agents: deletedConvos },
  });
  const withContact = snap.agents.filter((a) => a.support_contact && (a.support_contact.name || a.support_contact.email)).length;
  add({
    level: 1,
    key: 'show_terms_to_users',
    clause: 'Show users what the agent will never do, when it stops, who gets called, and whether it is Approved or Self-declared.',
    status: 'partial',
    evidence: `Users can see an agent's description and support contact (${withContact} of ${n} agents have one). Nothing shows a never-do list, stop rules, or approval status.`,
    close_with: 'core',
    close_note: 'A summary card in the agent picker; a plugin cannot add UI.',
  });

  // ------------------------------------------------------------- Level 2
  const wildcardAgents = agents.filter((a) => a.access_summary.wildcard > 0).length;
  add({
    level: 2,
    key: 'deny_unlisted',
    clause: 'Deny by default any tool or data source not listed in pillar 5, at the tool boundary.',
    status: wildcardAgents ? 'partial' : 'supported',
    evidence: `Agents only receive the tools on their list, which is the right default. ${wildcardAgents ? `${wildcardAgents} agent(s) are granted every tool on an MCP server, including tools added later.` : 'No agent holds a whole-server MCP grant.'} Capability tools (Ask User, file and skill tools) are added at run time without being listed; the observer measures how often.`,
    close_with: wildcardAgents ? 'config' : null,
    close_note: wildcardAgents ? 'Replace whole-server MCP grants with named tools.' : null,
    metrics: { agents_with_wildcard_mcp: wildcardAgents },
  });

  const hookCount = policy && Array.isArray(policy.hooks) ? policy.hooks.length : 0;
  const denyRules = policy && Array.isArray(policy.deny) ? policy.deny.length : 0;
  const pluginPreToolUse = deployment.plugin_hooks_enabled && deployment.installed_plugins.length > 0;
  add({
    level: 2,
    key: 'enforce_never_do',
    clause: 'Enforce every never-do item that maps to a tool, data source or action, outside the model.',
    status: policy && policy.enabled && (denyRules || hookCount) ? 'partial' : 'not_configured',
    evidence: `${policy && policy.enabled ? `Tool approval is on with ${denyRules} deny rule(s) and ${hookCount} programmatic hook(s).` : 'Tool approval is off, so no rule stops a tool call.'} Static rules apply to every agent alike: LibreChat accepts per-agent policy but does not merge it yet (v0.8.8, hitl/policy.ts). No agent has a never-do list to enforce.`,
    close_with: 'plugin',
    close_note: 'PreToolUse hooks receive agent_id, tool name and inputs, so they can enforce each agent\'s own never-do items, including conditions on inputs.',
  });
  add({
    level: 2,
    key: 'route_escalations',
    clause: 'Route each escalation trigger to the named recipient.',
    status: 'not_supported',
    evidence: 'Ask User and tool approval both ask the person chatting. Nothing hands a case to an escalation recipient or backup.',
    close_with: 'core',
    close_note: 'Routing to a third person needs a notification path; a plugin can only deny with a reason that names the recipient.',
  });

  // Hold irreversible actions
  const allIrr = agents.flatMap((a) => a.tools.filter(isIrreversibleLike).map((t) => ({ agent: a, t })));
  const unheld = allIrr.filter(({ t }) => !['ask', 'deny'].includes(t.approval.decision));
  const apiAgents = agents.filter((a) => a.api_reachable).length;
  const keys = snap.agent_api_keys;
  let holdStatus;
  if (!policy || policy.enabled !== true) holdStatus = allIrr.length ? 'not_configured' : 'partial';
  else holdStatus = unheld.length ? 'partial' : 'configured';
  add({
    level: 2,
    key: 'hold_irreversible',
    clause: 'Hold irreversible actions until a person approves.',
    status: holdStatus,
    evidence: `${allIrr.length} irreversible tool grant(s) across ${new Set(allIrr.map((x) => x.agent.id)).size} agent(s); ${unheld.length} would run with nobody approving in chat${policy && policy.enabled ? ` (mode "${policy.mode || 'default'}")` : ' because tool approval is off'}. Approval only applies to chat runs: LibreChat attaches the approval policy only for callers that can pause, and the Agents API and Responses API cannot (agents/run.ts). ${apiAgents} agent(s) are granted for API use; ${keys ? `${keys.total ?? 0} API key(s) exist, ${keys.used ?? 0} used` : 'API key usage unknown'}.`,
    close_with: policy && policy.enabled ? 'plugin' : 'config',
    close_note:
      policy && policy.enabled
        ? 'Plugin hooks run on every path, including the API; there an "ask" becomes a deny, which is the safe outcome.'
        : 'Turn on endpoints.agents.toolApproval with ask rules for write tools; add plugin hooks to cover the API path.',
    metrics: { irreversible_grants: allIrr.length, unheld_in_chat: unheld.length, api_granted_agents: apiAgents },
  });

  const { sharers, publics } = roleShareSummary(snap.roles);
  const sharedAgents = agents.filter((a) => a.sharing.shared).length;
  const selfShared = agents.filter((a) => a.sharing.shared && a.sharing.granted_only_by_author).length;
  add({
    level: 2,
    key: 'approve_sharing',
    clause: 'Require the approval authority to approve sharing.',
    status: 'not_supported',
    evidence: `Sharing is a permission, not an approval. Roles that may share agents: ${sharers.join(', ') || 'none found'}; with everyone: ${publics.join(', ') || 'none'}. ${sharedAgents} agents are shared, ${selfShared} of them only by their own creator.`,
    close_with: 'core',
    close_note: 'An approval step before a share takes effect.',
    metrics: { shared_agents: sharedAgents, shared_by_creator_only: selfShared },
  });
  const changedAfterShare = agents.filter((a) => a.lifecycle.some((l) => l.key === 'changed_after_sharing')).length;
  add({
    level: 2,
    key: 'redraft_on_change',
    clause: 'Return an approved charter to Draft when it changes.',
    status: 'not_supported',
    evidence: `Edits take effect immediately for everyone the agent is shared with. ${changedAfterShare} shared agent(s) changed after they were first shared.`,
    close_with: 'plugin',
    close_note: 'A plugin can compare the running version with the approved one and hold tool calls until re-approval.',
    metrics: { changed_after_sharing: changedAfterShare },
  });

  // Hook runtime health: prerequisite for any plugin-based enforcement.
  let hookStatus;
  let hookEvidence;
  if (!deployment.plugin_hooks_enabled) {
    hookStatus = 'not_configured';
    hookEvidence = 'DEPLOYMENT_PLUGIN_HOOKS is not set, so plugin hooks are parsed but never run.';
  } else if (deployment.bash_available === false) {
    hookStatus = 'broken';
    hookEvidence =
      'Plugin hooks are enabled but bash is not on this host. LibreChat runs command hooks with bash on Linux; the official image is Alpine without bash. A hook that cannot start is logged and skipped, so a guard hook fails open.';
  } else {
    hookStatus = 'configured';
    hookEvidence = `Plugin hooks are enabled and bash is available. ${deployment.installed_plugins.length} plugin folder(s) installed.`;
  }
  add({
    level: 2,
    key: 'hook_runtime',
    clause: 'Prerequisite: a place outside the model where enforcement can run.',
    status: hookStatus,
    evidence: hookEvidence + (deployment.running_in_container ? '' : ' (Run this diagnosis inside the API container for a reliable bash check.)'),
    close_with: hookStatus === 'configured' ? null : 'config',
    close_note: hookStatus === 'broken' ? 'Add bash to the image (apk add --no-cache bash), or ask upstream to fall back to sh.' : 'Set DEPLOYMENT_PLUGIN_HOOKS=true.',
  });

  // ------------------------------------------------------------- Level 3
  const audit = snap.audit_log;
  const auditActions = audit ? Object.keys(audit.by_action) : [];
  const runAudited = auditActions.some((k) => /^(agent_run|tool_call|approval):/.test(k));
  const obs = observations && observations.present;
  add({
    level: 3,
    key: 'link_records',
    clause: 'Link every execution record to the charter version it ran under.',
    status: runAudited ? 'partial' : obs ? 'partial' : 'not_supported',
    evidence: `${audit ? `The audit log (append-only, hash-chained) holds ${audit.total} record(s): ${auditActions.join(', ') || 'none'}.` : 'No audit log collection.'} ${runAudited ? '' : 'Agent runs, tool calls and approvals are not recorded there; LibreChat defines those categories but no actions for them yet.'} ${obs ? `This plugin's observer has recorded ${observations.totals.runs} run(s) and ${observations.totals.tool_calls} tool call(s), but there is no charter version to link them to.` : 'The observer is not running, so no execution records exist.'}`,
    close_with: 'plugin',
    close_note: 'The observer in this package writes shadow execution records; linking them to a charter needs a charter store.',
  });
  add({
    level: 3,
    key: 'flag_drift',
    clause: 'Flag drift: tools or data used that the charter does not list.',
    status: obs ? 'partial' : 'not_supported',
    evidence: obs ? `The observer found ${observations.totals.unlisted_tool_calls} tool call(s) to tools not on the agent's list.` : 'Nothing compares what agents used with what they were given.',
    close_with: 'plugin',
  });
  add({
    level: 3,
    key: 'review_prompts',
    clause: 'Prompt the owner at each review date.',
    status: 'not_supported',
    evidence: 'Agents have no review date and no owner to prompt.',
    close_with: 'plugin',
    close_note: 'A scheduled job over the charter store.',
  });
  add({
    level: 3,
    key: 'independent_read',
    clause: 'Let someone other than the owner and the platform vendor read the records.',
    status: audit && audit.total > 0 ? 'partial' : 'not_supported',
    evidence: audit && audit.total > 0 ? 'The audit log is readable by admins and tamper-evident, but it holds no agent activity.' : 'There are no agent execution records to read.',
    close_with: 'plugin',
  });

  const levels = [1, 2, 3].map((lvl) => {
    const cs = checks.filter((c) => c.level === lvl);
    return { level: lvl, name: ['Declared', 'Enforced', 'Verified'][lvl - 1], total: cs.length, passing: cs.filter((c) => PASS.has(c.status)).length };
  });
  let reached = 0;
  for (const l of levels) {
    if (l.passing === l.total) reached = l.level;
    else break;
  }
  return { checks, levels, reached, policy_holds_anything: holdsAnything(policy) };
}

module.exports = { evaluateConformance, PASS };
