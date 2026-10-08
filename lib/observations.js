/*
 * SECURITY REVIEW: loaded by bin/charter-diagnose.js; never run directly.
 * Claim, to verify against the code below (procedure: AGENTS.md):
 * Reads this plugin's observation files. No network, database, writes or
 * processes.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { parseTool, isConsequential } = require('./tools');
const { decide } = require('./policy');

const PLUGIN_NAME = 'delegation-charter-diagnostic';

/** Tools LibreChat adds from agent capabilities without listing them on the agent. */
const CAPABILITY_TOOLS = new Set([
  'ask_user_question',
  'tool_search',
  'read_file',
  'create_file',
  'edit_file',
  'bash_tool',
  'skill',
  'check_background_task',
  'run_tools_with_code',
  'run_tools_with_bash',
  'memory',
]);

function parseSince(since) {
  if (!since) return null;
  const m = String(since).match(/^(\d+)\s*d$/i);
  if (m) return new Date(Date.now() - Number(m[1]) * 86400000).toISOString();
  const d = new Date(since);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function readRecords(dir, sinceIso) {
  if (!dir || !fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
    .filter((f) => !sinceIso || f.slice(0, 10) >= sinceIso.slice(0, 10))
    .sort();
  const out = [];
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const r = JSON.parse(line);
        if (!sinceIso || r.ts >= sinceIso) out.push(r);
      } catch {
        /* skip torn line */
      }
    }
  }
  return out;
}

function defaultDir(deployment) {
  return path.join(deployment.plugin_data_dir, PLUGIN_NAME, 'observations');
}

/**
 * @returns summary with per-agent behaviour, or { present:false }
 */
function summarize({ dir, since, snap, policy, actionMethods }) {
  const sinceIso = parseSince(since);
  const records = readRecords(dir, sinceIso);
  if (records.length === 0) return { present: false, dir, since: sinceIso };

  const agentsById = new Map(snap.agents.map((a) => [a.id, a]));
  const per = {};
  const get = (id) =>
    (per[id] = per[id] || {
      agent: id,
      runs: 0,
      sessions: new Set(),
      tool_calls: 0,
      executed: 0,
      failed: 0,
      not_executed: 0,
      subagent_starts: 0,
      tools: {},
      unlisted: {},
      capability: {},
      consequential_executed: 0,
      consequential_unheld: 0,
      handoffs_to: new Set(),
    });

  const pre = new Map();
  const post = new Set();
  let first = null;
  let last = null;
  for (const r of records) {
    first = !first || r.ts < first ? r.ts : first;
    last = !last || r.ts > last ? r.ts : last;
    const id = r.exec_agent || r.agent || '(unknown agent)';
    const p = get(id);
    if (r.session) p.sessions.add(r.session);
    if (r.exec_agent && r.agent && r.exec_agent !== r.agent) get(r.agent).handoffs_to.add(r.exec_agent);
    switch (r.event) {
      case 'RunStart':
      case 'SessionStart':
        p.runs += 1;
        break;
      case 'SubagentStart':
        p.subagent_starts += 1;
        break;
      case 'PreToolUse':
        p.tool_calls += 1;
        if (r.call) pre.set(r.call, { id, tool: r.tool });
        p.tools[r.tool] = (p.tools[r.tool] || 0) + 1;
        break;
      case 'PostToolUse':
        p.executed += 1;
        if (r.call) post.add(r.call);
        break;
      case 'PostToolUseFailure':
        p.failed += 1;
        if (r.call) post.add(r.call);
        break;
      default:
        break;
    }
  }
  for (const [call, { id }] of pre) if (!post.has(call)) get(id).not_executed += 1;

  // Compare what ran with what each agent was given.
  let unlistedTotal = 0;
  let consequentialTotal = 0;
  let unheldTotal = 0;
  for (const p of Object.values(per)) {
    const agent = agentsById.get(p.agent);
    p.known_agent = !!agent;
    const listed = new Set(agent ? agent.tools : []);
    const wildServers = agent ? agent.tools.map((k) => parseTool(k, { actionMethods })).filter((t) => t.wildcard).map((t) => t.server) : [];
    for (const [tool, n] of Object.entries(p.tools)) {
      const t = parseTool(tool, { actionMethods });
      const coveredByWildcard = t.kind === 'mcp' && wildServers.includes(t.server);
      if (!listed.has(tool) && !coveredByWildcard) {
        if (CAPABILITY_TOOLS.has(tool)) p.capability[tool] = n;
        else {
          p.unlisted[tool] = n;
          unlistedTotal += n;
        }
      }
      if (isConsequential(t)) {
        p.consequential_executed += n;
        consequentialTotal += n;
        const d = decide(policy, t).decision;
        if (d !== 'ask' && d !== 'deny') {
          p.consequential_unheld += n;
          unheldTotal += n;
        }
      }
    }
    p.sessions = p.sessions.size;
    p.handoffs_to = [...p.handoffs_to];
  }

  const agents = Object.values(per).sort((a, b) => b.tool_calls - a.tool_calls);
  return {
    present: true,
    dir,
    since: sinceIso,
    window: { first, last },
    totals: {
      records: records.length,
      runs: agents.reduce((s, a) => s + a.runs, 0),
      tool_calls: agents.reduce((s, a) => s + a.tool_calls, 0),
      executed: agents.reduce((s, a) => s + a.executed, 0),
      not_executed: agents.reduce((s, a) => s + a.not_executed, 0),
      unlisted_tool_calls: unlistedTotal,
      consequential_calls: consequentialTotal,
      consequential_unheld: unheldTotal,
      agents_active: agents.filter((a) => a.runs || a.tool_calls).length,
      unknown_agents: agents.filter((a) => !a.known_agent).length,
    },
    agents,
  };
}

module.exports = { summarize, defaultDir, readRecords, parseSince, PLUGIN_NAME, CAPABILITY_TOOLS };
