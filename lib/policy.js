/*
 * SECURITY REVIEW: loaded by bin/charter-diagnose.js; never run directly.
 * Claim, to verify against the code below (procedure: AGENTS.md):
 * Pure functions: no network, database, files, processes or dynamic code.
 */
'use strict';

/**
 * Simulates LibreChat's endpoint-level tool-approval policy
 * (endpoints.agents.toolApproval) for one tool name, mirroring the SDK fold
 * documented in librechat-data-provider v0.8.8:
 *   deny → ask → allow → bypass(allow) → dontAsk(deny) → fallthrough(ask)
 * Globs are anchored, `*` matches anything (packages/api/src/agents/hitl/policy.ts).
 *
 * MCP tools are matched under both spellings we know of — the runtime key
 * `<tool>_mcp_<server>` and the documented rule form `mcp:<server>:<tool>` —
 * because an operator may have written either.
 */

function globToRegex(pattern) {
  const escaped = String(pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
}

function namesFor(tool) {
  const names = [tool.key];
  if (tool.kind === 'mcp' || tool.kind === 'mcp_all') {
    names.push(`mcp:${tool.server}:${tool.tool === '*' ? '*' : tool.tool}`);
  }
  return names;
}

function matches(patterns, names) {
  if (!Array.isArray(patterns) || patterns.length === 0) return null;
  for (const p of patterns) {
    const re = globToRegex(p);
    if (names.some((n) => re.test(n))) return p;
  }
  return null;
}

/**
 * @returns {{decision:'off'|'deny'|'ask'|'allow', rule:string|null, why:string}}
 */
function decide(policy, tool) {
  if (!policy || policy.enabled !== true) {
    return { decision: 'off', rule: null, why: 'tool approval is not enabled' };
  }
  const names = namesFor(tool);
  let rule = matches(policy.deny, names);
  if (rule) return { decision: 'deny', rule, why: `deny rule "${rule}"` };
  rule = matches(policy.ask, names);
  if (rule) return { decision: 'ask', rule, why: `ask rule "${rule}"` };
  rule = matches(policy.allow, names);
  if (rule) return { decision: 'allow', rule, why: `allow rule "${rule}"` };
  const mode = policy.mode || 'default';
  if (mode === 'bypass') return { decision: 'allow', rule: null, why: 'mode "bypass" allows unmatched tools' };
  if (mode === 'dontAsk') return { decision: 'deny', rule: null, why: 'mode "dontAsk" denies unmatched tools' };
  return { decision: 'ask', rule: null, why: 'mode "default" asks for unmatched tools' };
}

/** Whether the policy has at least one rule or a mode that holds anything. */
function holdsAnything(policy) {
  if (!policy || policy.enabled !== true) return false;
  if ((policy.ask || []).length > 0) return true;
  if ((policy.hooks || []).length > 0) return true;
  const mode = policy.mode || 'default';
  return mode === 'default' && !(policy.allow || []).includes('*');
}

module.exports = { decide, holdsAnything, globToRegex };
