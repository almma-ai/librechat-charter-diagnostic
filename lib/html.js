/*
 * SECURITY REVIEW: loaded by bin/charter-diagnose.js; never run directly.
 * Claim, to verify against the code below (procedure: AGENTS.md):
 * Pure: returns a string. The report it builds is one self-contained HTML file
 * with no external resources; its small inline script only shows and hides
 * rows, makes no requests and uses no storage.
 */
'use strict';

/**
 * Renders the diagnosis as one self-contained HTML file: no external requests,
 * no scripts beyond a small filter, prints cleanly. Every value that came from
 * the database is escaped: agent names and instructions are user content.
 */

const esc = (v) =>
  String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const STATUS_LABEL = {
  met: 'Met',
  stated: 'Instructed only',
  partial: 'Partial',
  missing: 'Missing',
  violated: 'Contradicted',
  'n/a': 'Not required',
  supported: 'Supported',
  configured: 'Configured',
  not_configured: 'Not configured',
  not_supported: 'Not supported',
  broken: 'Broken',
  held: 'Held',
  answered: 'Went ahead',
  unclear: 'Read reply',
  error: 'Error',
};
const STATUS_CLASS = {
  met: 'ok',
  supported: 'ok',
  configured: 'ok',
  held: 'ok',
  stated: 'info',
  partial: 'warn',
  unclear: 'warn',
  not_configured: 'warn',
  missing: 'bad',
  not_supported: 'bad',
  answered: 'bad',
  violated: 'crit',
  broken: 'crit',
  error: 'muted',
  'n/a': 'muted',
};
const SHORT = { met: '✓', stated: 'I', partial: '~', missing: '✗', violated: '!', 'n/a': '·' };

const pill = (status, text) => `<span class="pill ${STATUS_CLASS[status] || 'muted'}">${esc(text || STATUS_LABEL[status] || status)}</span>`;
const tag = (cls, text) => `<span class="pill ${cls}">${esc(text)}</span>`;
const plural = (n, w, p) => `${n} ${n === 1 ? w : p || `${w}s`}`;
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

function css() {
  return `
:root{--bg:#f7f6f3;--card:#fff;--ink:#1d1d1b;--muted:#6b6a65;--line:#e4e2dc;--soft:#efede8;
--ok:#1f7a4d;--ok-bg:#e3f2ea;--info:#285d8f;--info-bg:#e4edf6;--warn:#8a5a00;--warn-bg:#fbf0d9;--bad:#9a3b26;--bad-bg:#f8e5df;--crit:#fff;--crit-bg:#b3261e;--mu:#77756f;--mu-bg:#eeece7;--accent:#1d1d1b}
@media (prefers-color-scheme:dark){:root{--bg:#141413;--card:#1d1d1b;--ink:#ecebe6;--muted:#a3a19a;--line:#33322f;--soft:#262523;
--ok:#7fd1a4;--ok-bg:#16301f;--info:#9cc3ea;--info-bg:#18283a;--warn:#f0c46a;--warn-bg:#35290f;--bad:#f0a08c;--bad-bg:#3a1f18;--crit:#fff;--crit-bg:#a8322a;--mu:#a3a19a;--mu-bg:#2a2927;--accent:#ecebe6}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:32px 20px 80px}
header.top{border-bottom:2px solid var(--ink);padding-bottom:18px;margin-bottom:28px}
.eyebrow{font:600 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
h1{font:700 34px/1.15 Georgia,"Times New Roman",serif;margin:10px 0 8px;letter-spacing:-.01em}
h2{font:700 22px/1.25 Georgia,"Times New Roman",serif;margin:44px 0 6px}
h3{font-size:16px;margin:0 0 6px}
.sub{color:var(--muted);margin:0}
.meta{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:12px;font-size:13px;color:var(--muted)}
.meta b{color:var(--ink);font-weight:600}
.lede{font-size:17px;max-width:820px;margin:18px 0 0}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin:22px 0 8px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 16px 14px}
.kpi .n{font:700 34px/1 Georgia,serif}
.kpi .n small{font:500 15px/1 ui-sans-serif,system-ui;color:var(--muted)}
.kpi p{margin:8px 0 0;font-size:13.5px;color:var(--muted)}
.kpi.alert{border-color:var(--bad)}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px 20px;margin:14px 0}
.note{font-size:13.5px;color:var(--muted)}
.pill{display:inline-block;font-size:12px;font-weight:600;line-height:1;padding:5px 8px;border-radius:999px;white-space:nowrap}
.ok{color:var(--ok);background:var(--ok-bg)}.info{color:var(--info);background:var(--info-bg)}.warn{color:var(--warn);background:var(--warn-bg)}
.bad{color:var(--bad);background:var(--bad-bg)}.crit{color:var(--crit);background:var(--crit-bg)}.muted{color:var(--mu);background:var(--mu-bg)}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;vertical-align:top;padding:9px 10px;border-bottom:1px solid var(--line)}
th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);font-weight:600}
.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.matrix td,.matrix th{text-align:center;padding:7px 6px}
.matrix td:first-child,.matrix th:first-child{text-align:left;min-width:190px}
.cell{display:inline-flex;align-items:center;justify-content:center;width:28px;height:24px;border-radius:5px;font:700 14px/1 ui-sans-serif,system-ui,sans-serif}
.matrix a{color:var(--ink);text-decoration:none;font-weight:600}.matrix a:hover{text-decoration:underline}
.legend{display:flex;flex-wrap:wrap;gap:8px 14px;font-size:12.5px;color:var(--muted);margin:10px 0 0}
.legend span{display:inline-flex;gap:6px;align-items:center}
.ladder{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}
.level h3{display:flex;justify-content:space-between;align-items:baseline}
.level .score{font:600 13px ui-monospace,monospace;color:var(--muted)}
.clause{border-top:1px solid var(--line);padding:10px 0}
.clause:first-of-type{border-top:0}
.clause .row{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.clause p{margin:6px 0 0;font-size:13.5px;color:var(--muted)}
.fix{font-size:12.5px;color:var(--muted)}
.fix b{display:inline-block;margin-bottom:3px;font:600 11px ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em;padding:2px 6px;border:1px solid var(--line);border-radius:4px;color:var(--ink)}
.agent{scroll-margin-top:16px}
.agent header{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;align-items:baseline}
.agent h3{font:700 19px/1.2 Georgia,serif;margin:0}
.facts{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:13px;color:var(--muted);margin:6px 0 12px}
.rw{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:6px 0 12px}
.rw ul{margin:4px 0 0;padding-left:0;list-style:none}
.rw li{padding:3px 0 3px 22px;position:relative;font-size:14px}
.rw .r li:before{content:"✓";position:absolute;left:2px;color:var(--ok);font-weight:700}
.rw .w li:before{content:"✕";position:absolute;left:2px;color:var(--bad);font-weight:700}
details{border-top:1px solid var(--line);padding-top:8px;margin-top:8px}
summary{cursor:pointer;font-weight:600;font-size:14px}
.ev{font-size:13.5px;color:var(--muted)}
.kv td:first-child{width:250px;font-weight:600}
code{font:12.5px ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--soft);padding:1px 5px;border-radius:4px;overflow-wrap:anywhere}
pre{white-space:pre-wrap;font:12.5px/1.5 ui-monospace,monospace;background:var(--soft);padding:10px;border-radius:6px;margin:6px 0}
.filters{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}
.filters button{font:inherit;font-size:13px;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:6px 12px;cursor:pointer}
.filters button[aria-pressed="true"]{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.bar{height:8px;background:var(--soft);border-radius:4px;overflow:hidden;display:flex}
.bar i{display:block;height:100%}
.pbar{padding:9px 0;border-bottom:1px solid var(--line)}.pbar:last-child{border-bottom:0}.pbar .row{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:14px;margin-bottom:6px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
footer{margin-top:48px;border-top:1px solid var(--line);padding-top:14px;font-size:12.5px;color:var(--muted)}
a{color:var(--info)}
@media (max-width:720px){.rw,.two{grid-template-columns:1fr}h1{font-size:27px}.kv td:first-child{width:auto}}
@media print{body{background:#fff}.filters{display:none}.card,.kpi{break-inside:avoid}details{display:block}details>*{display:block}}
`;
}

function headline(r) {
  const s = r.summary;
  const c = r.conformance;
  const parts = [];
  parts.push(`${s.could_activate === 0 ? 'None' : s.could_activate} of the ${s.agents} agents on this deployment could be activated under the Delegation Charter as they stand.`);
  if (s.need_approval) parts.push(`${s.need_approval} would need a second person's approval, and LibreChat has no place to record one.`);
  if (s.irreversible_unheld_agents) parts.push(`${s.irreversible_unheld_agents} can take actions that are hard to undo with nobody approving.`);
  parts.push(c.reached ? `The deployment reaches conformance Level ${c.reached}.` : 'The deployment does not yet reach conformance Level 1.');
  return parts.join(' ');
}

function kpis(r) {
  const s = r.summary;
  const c = r.conformance;
  const o = r.observations;
  const items = [
    { n: `${s.could_activate}<small> / ${s.agents}</small>`, p: 'agents that meet every MUST field of the charter', alert: s.could_activate === 0 && s.agents > 0 },
    { n: `${s.no_never_do}<small> / ${s.agents}</small>`, p: 'agents with no never-do list at all', alert: s.no_never_do > 0 },
    { n: `${s.irreversible_unheld_agents}`, p: 'agents that can act irreversibly with nobody approving', alert: s.irreversible_unheld_agents > 0 },
    { n: `${s.agents_shared}`, p: `agents shared beyond their creator${s.agents_public ? `, ${s.agents_public} with everyone` : ''}; none approved by a second person` },
    { n: c.reached ? `L${c.reached}` : '—', p: `conformance level reached (${c.levels.map((l) => `L${l.level} ${l.passing}/${l.total}`).join(' · ')})`, alert: !c.reached },
  ];
  if (o && o.present) items.push({ n: `${o.totals.consequential_unheld}`, p: `write or irreversible tool calls no approval rule covered, of ${o.totals.tool_calls} observed` , alert: o.totals.consequential_unheld > 0 });
  return `<div class="kpis">${items.map((k) => `<div class="kpi${k.alert ? ' alert' : ''}"><div class="n">${k.n}</div><p>${esc(k.p)}</p></div>`).join('')}</div>`;
}

function matrix(r) {
  const cols = [
    { key: 'purpose', label: 'Purpose', from: 'header' },
    { key: 'state', label: 'State', from: 'header' },
    ...r.agents[0]?.pillars.map((p) => ({ key: p.key, label: `P${p.n}`, title: p.label, from: 'pillars' })) || [],
  ];
  const rows = r.agents
    .map((a) => {
      const cells = cols
        .map((c) => {
          const x = a[c.from].find((y) => y.key === c.key);
          return `<td><span class="cell ${STATUS_CLASS[x.status]}" title="${esc(`${c.title || c.label}: ${STATUS_LABEL[x.status]}`)}">${SHORT[x.status]}</span></td>`;
        })
        .join('');
      const flags = [a.sharing.shared && 'shared', a.wrongs.length && 'wrongs', a.tools.some((t) => ['write', 'irreversible', 'code'].includes(t.access) || t.wildcard) && 'tools'].filter(Boolean).join(' ');
      return `<tr data-flags="${flags}"><td><a href="#a-${esc(a.id)}">${esc(a.name)}</a><div class="note">${esc(a.sharing.audience === 'nobody else' ? 'private' : `shared: ${a.sharing.audience}`)} · ${plural(a.usage.conversations, 'conversation')}</div></td>${cells}<td>${a.wrongs.length ? tag('bad', String(a.wrongs.length)) : tag('muted', '0')}</td></tr>`;
    })
    .join('');
  const head = `<tr><th>Agent</th>${cols.map((c) => `<th title="${esc(c.title || c.label)}">${esc(c.label)}</th>`).join('')}<th>Wrongs</th></tr>`;
  const pillarKey = (r.agents[0]?.pillars || []).map((p) => `P${p.n} ${p.label}`).join(' · ');
  return `
  <div class="filters" role="group" aria-label="Filter agents">
    <button type="button" data-f="all" aria-pressed="true">All ${r.agents.length}</button>
    <button type="button" data-f="shared" aria-pressed="false">Shared</button>
    <button type="button" data-f="tools" aria-pressed="false">Holds write or irreversible tools</button>
    <button type="button" data-f="wrongs" aria-pressed="false">Has something wrong</button>
  </div>
  <div class="card scroll"><table class="matrix" id="matrix"><thead>${head}</thead><tbody>${rows}</tbody></table>
  <div class="legend">${['met', 'stated', 'partial', 'missing', 'violated', 'n/a'].map((s) => `<span><span class="cell ${STATUS_CLASS[s]}">${SHORT[s]}</span>${STATUS_LABEL[s]}</span>`).join('')}</div>
  <p class="note" style="margin-top:8px">${esc(pillarKey)}. “Instructed only” means the term is written in the agent's instructions: it guides the model but is not a charter field and nothing outside the model enforces it.</p></div>`;
}

function pillarBars(r) {
  const t = r.summary.pillars;
  const order = ['violated', 'missing', 'partial', 'stated', 'met', 'n/a'];
  const color = { violated: 'var(--crit-bg)', missing: 'var(--bad)', partial: 'var(--warn)', stated: 'var(--info)', met: 'var(--ok)', 'n/a': 'var(--mu-bg)' };
  const rows = Object.values(t)
    .map((p) => {
      const total = order.reduce((s, k) => s + p[k], 0) || 1;
      const segs = order.map((k) => (p[k] ? `<i style="width:${(100 * p[k]) / total}%;background:${color[k]}" title="${esc(`${STATUS_LABEL[k]}: ${p[k]}`)}"></i>` : '')).join('');
      const fail = p.missing + p.violated;
      return `<div class="pbar"><div class="row"><span><b>P${p.n}</b> ${esc(p.label)}</span><span class="note">${fail ? `${fail} missing or contradicted` : 'none missing'} · ${p.stated} instructed only</span></div><div class="bar">${segs}</div></div>`;
    })
    .join('');
  return `<div class="card">${rows}</div>`;
}

function commonList(list, cls, empty) {
  if (!list.length) return `<p class="note">${esc(empty)}</p>`;
  return `<ul>${list.slice(0, 8).map((x) => `<li>${esc(x.text)} <span class="note">(${plural(x.n, 'agent')})</span></li>`).join('')}</ul>`;
}

function ladder(r) {
  const c = r.conformance;
  return `${c.levels
    .map((l) => {
      const cs = c.checks.filter((x) => x.level === l.level);
      return `<div class="card level"><h3><span>Level ${l.level} · ${esc(l.name)}</span><span class="score">${l.passing} of ${l.total} clauses pass</span></h3><div class="scroll"><table><thead><tr><th style="width:28%">Clause</th><th style="width:13%">Status</th><th>What we found</th><th style="width:24%">What would close it</th></tr></thead><tbody>${cs
        .map(
          (x) => `<tr><td><b>${esc(x.clause)}</b></td><td>${pill(x.status)}</td><td class="ev">${esc(x.evidence)}</td><td class="fix">${x.close_with ? `<b>${esc(x.close_with)}</b> ${esc(x.close_note || '')}` : '—'}</td></tr>`,
        )
        .join('')}</tbody></table></div></div>`;
    })
    .join('')}
  <p class="note">A platform conforms at a level when every clause of that level passes, and each level includes the one before it. <b>config</b> can be changed today in librechat.yaml or .env; <b>plugin</b> is buildable on the v0.8.8 Agent Plugin hooks without changing LibreChat; <b>core</b> needs a change to LibreChat itself.</p>`;
}

function observations(r) {
  const o = r.observations;
  if (!o || !o.present) {
    return `<div class="card"><p>No observer records yet. This section fills in once the plugin's hooks have run for a few days: set <code>DEPLOYMENT_PLUGIN_HOOKS=true</code>, make sure <code>bash</code> is available on the API host, restart LibreChat and run this report again. The observer records which agent called which tool; it never blocks a call and stores no prompts, arguments or outputs.</p><p class="note">Looked in <code>${esc(o && o.dir)}</code>.</p></div>`;
  }
  const t = o.totals;
  const rows = o.agents
    .map((a) => {
      const agent = r.agents.find((x) => x.id === a.agent);
      const name = agent ? `<a href="#a-${esc(a.agent)}">${esc(agent.name)}</a>` : `<code>${esc(a.agent)}</code> <span class="note">(not in database: deleted?)</span>`;
      const unl = Object.entries(a.unlisted).map(([k, n]) => `${esc(k)} ×${n}`).join(', ');
      const cap = Object.entries(a.capability).map(([k, n]) => `${esc(k)} ×${n}`).join(', ');
      return `<tr><td style="min-width:170px">${name}</td><td>${a.runs}</td><td>${a.tool_calls}</td><td>${a.consequential_executed}</td><td>${a.consequential_unheld ? tag('bad', String(a.consequential_unheld)) : '0'}</td><td>${a.not_executed}</td><td class="ev">${unl || (cap || a.handoffs_to.length || a.subagent_starts ? '' : '—')}${cap ? `<div>added by LibreChat: ${cap}</div>` : ''}${a.handoffs_to.length ? `<div>handed work to: ${a.handoffs_to.map(esc).join(', ')}</div>` : ''}${a.subagent_starts ? `<div>${plural(a.subagent_starts, 'subagent start')}</div>` : ''}</td></tr>`;
    })
    .join('');
  return `<div class="card"><p>From ${esc(o.window.first.slice(0, 10))} to ${esc(o.window.last.slice(0, 10))}: ${plural(t.runs, 'run')}, ${plural(t.tool_calls, 'tool call')} across ${plural(t.agents_active, 'agent')}. ${t.consequential_calls} were write or irreversible calls; <b>${t.consequential_unheld}</b> of them matched no approval rule. ${t.unlisted_tool_calls ? `<b>${t.unlisted_tool_calls}</b> calls went to tools that are not on the agent's list.` : 'No calls went to unlisted tools.'} ${t.not_executed} calls started but never completed (held, denied or aborted).</p>
  <div class="scroll"><table><thead><tr><th>Agent</th><th>Runs</th><th>Tool calls</th><th>Write / irreversible</th><th>Not covered by approval</th><th>Started, not completed</th><th>Tools not on its list</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="note">None of these runs can be tied to a charter version, because no charter exists. That link is what Level 3 asks for.</p></div>`;
}

function probes(r) {
  if (!r.probes) {
    return `<div class="card"><p>Not run. Live probes send four short, text-only messages to agents you choose, through the Agents API, and check whether each one stops, asks or hands off when it should. Run with <code>--probe &lt;agent_id,…&gt; --api-key &lt;your agent API key&gt;</code>. Agents holding write or irreversible tools are skipped unless you pass <code>--probe-allow-tools</code>; prefer a staging copy for those.</p></div>`;
  }
  return r.probes
    .map((p) => {
      if (p.skipped) return `<div class="card"><h3>${esc(p.name || p.agent)}</h3><p class="note">Skipped: ${esc(p.skipped)}</p></div>`;
      return `<div class="card"><h3>${esc(p.name)}</h3><div class="scroll"><table><thead><tr><th style="width:34%">Trigger</th><th style="width:16%">Result</th><th>Reply</th></tr></thead><tbody>${p.probes
        .map((x) => `<tr><td><b>${esc(x.trigger)}</b><div class="note">“${esc(x.prompt)}”</div></td><td>${pill(x.result)}${x.note && !/^(Went ahead|Stopped, asked, or deferred)\.$/.test(x.note) ? `<div class="note">${esc(x.note)}</div>` : ''}</td><td class="ev">${esc(x.reply || '')}${x.tool_calls && x.tool_calls.length ? `<div>Tool calls: ${x.tool_calls.map(esc).join(', ')}</div>` : ''}</td></tr>`)
        .join('')}</tbody></table></div></div>`;
    })
    .join('');
}

function agentCard(a) {
  const facts = [
    `ID <code>${esc(a.id)}</code>`,
    a.author.exists ? `created by ${esc(a.author.name || 'a user')}` : '<b>creator no longer exists</b>',
    a.sharing.shared ? `shared with ${esc(a.sharing.audience)}` : 'private',
    `${plural(a.usage.conversations, 'conversation')}${a.usage.users ? ` by ${plural(a.usage.users, 'user')}` : ''}`,
    a.usage.last ? `last used ${esc(a.usage.last.slice(0, 10))}` : 'never used',
    `${esc(a.provider || '?')} / ${esc(a.model || '?')}`,
  ];
  if (a.schedules) facts.push(`${plural(a.schedules, 'schedule')}`);
  if (a.api_reachable) facts.push('granted for the Agents API');
  const rows = (list) =>
    list.map((x) => `<tr><td>${x.n ? `P${x.n} ` : ''}${esc(x.label)}${x.requirement ? ` <span class="note">${esc(x.requirement)}</span>` : ''}</td><td>${pill(x.status)}</td><td class="ev">${esc(x.evidence)}</td></tr>`).join('');
  const toolRows = a.tools
    .map((t) => `<tr><td><code>${esc(t.tool === '*' ? `all tools · ${t.server}` : t.tool)}</code><div class="note">${esc(t.kind === 'mcp' || t.kind === 'mcp_all' ? `MCP ${t.server}` : t.kind === 'action' ? `action ${t.domain}` : t.kind)}</div></td><td>${pill(t.access === 'read' ? 'met' : t.access === 'unknown' ? 'n/a' : t.access === 'write' ? 'partial' : 'missing', t.wildcard ? 'wildcard' : t.access)}<div class="note">${esc(t.basis)}</div></td><td>${pill(t.approval.decision === 'ask' || t.approval.decision === 'deny' ? 'held' : 'n/a', t.approval.decision === 'off' ? 'no approval' : t.approval.decision)}<div class="note">${esc(t.approval.why)}</div></td></tr>`)
    .join('');
  return `<article class="card agent" id="a-${esc(a.id)}">
  <header><h3>${esc(a.name)}</h3><span>${pill(a.activation.complete ? 'met' : 'missing', a.activation.complete ? 'MUST fields present' : 'Could not be activated')} ${pill('muted', a.activation.path === 'approval' ? 'Needs approval' : 'May self-declare')}</span></header>
  <div class="facts">${facts.map((f) => `<span>${f}</span>`).join('')}</div>
  <div class="rw"><div class="r"><b>Done right</b>${a.rights.length ? `<ul>${a.rights.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="note">Nothing yet.</p>'}</div>
  <div class="w"><b>Wrong or missing</b>${a.wrongs.length ? `<ul>${a.wrongs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p class="note">No contradictions found; ${plural(a.activation.missing.length, 'MUST field')} still missing.</p>`}</div></div>
  <p class="ev">${esc(a.activation.verdict)}${a.activation.missing.length ? ` Missing: ${esc(a.activation.missing.join('; '))}.` : ''}</p>
  <details><summary>Eight pillars</summary><div class="scroll"><table>${rows(a.pillars)}</table></div></details>
  <details><summary>Header, escalation triggers and lifecycle</summary><div class="scroll"><table>${rows(a.header)}${rows(a.triggers.map((t) => ({ ...t, label: `Trigger: ${t.label}` })))}${a.lifecycle.map((l) => `<tr><td>Lifecycle: ${esc(l.key.replace(/_/g, ' '))}</td><td>${pill(l.status)}</td><td class="ev">${esc(l.evidence)}</td></tr>`).join('')}</table></div></details>
  ${a.tools.length ? `<details><summary>Tools (${a.tools.length}): inferred access and approval in chat</summary><div class="scroll"><table><thead><tr><th>Tool</th><th>Access (inferred)</th><th>Approval in chat</th></tr></thead><tbody>${toolRows}</tbody></table></div></details>` : ''}
  <p class="note" style="margin-top:10px">Draft charter: <code>charters/${esc(a.id)}.draft.json</code></p>
</article>`;
}

function script() {
  return `<script>
(function(){var bs=document.querySelectorAll('.filters button');var rows=document.querySelectorAll('#matrix tbody tr');var cards=document.querySelectorAll('article.agent');
bs.forEach(function(b){b.addEventListener('click',function(){bs.forEach(function(x){x.setAttribute('aria-pressed',x===b?'true':'false')});var f=b.getAttribute('data-f');
rows.forEach(function(r){var on=f==='all'||(' '+r.getAttribute('data-flags')+' ').indexOf(' '+f+' ')>=0;r.style.display=on?'':'none';var id=r.querySelector('a').getAttribute('href').slice(1);var c=document.getElementById(id);if(c)c.style.display=on?'':'none';});});});})();
</script>`;
}

function renderHtml(r) {
  const s = r.summary;
  const d = r.deployment;
  const ta = d.tool_approval;
  const title = 'Delegation Charter diagnosis';
  const meta = [
    `<span><b>Date</b> ${esc(r.generated_at.slice(0, 10))}</span>`,
    `<span><b>Run by</b> ${esc((r.run_by && r.run_by.name) || '?')} (${esc((r.run_by && r.run_by.role) || '?')})</span>`,
    `<span><b>LibreChat</b> ${esc(r.librechat.version || 'version unknown')}</span>`,
    `<span><b>Database</b> ${esc(r.source.database || r.source.kind)}</span>`,
    `<span><b>Spec</b> <a href="${esc(r.spec.url)}">Delegation Charter v${esc(r.spec.version)}</a></span>`,
    `<span><b>Tool</b> ${esc(r.tool.name)} ${esc(r.tool.version)}</span>`,
  ];
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title><style>${css()}</style></head>
<body><div class="wrap">
<header class="top">
  <div class="eyebrow">Confidential · for LibreChat administrators</div>
  <h1>${esc(title)}</h1>
  <p class="sub">Every agent tested against the eight pillars of the Delegation Charter, and the deployment against its three conformance levels.</p>
  <div class="meta">${meta.join('')}</div>
  <p class="lede">${esc(headline(r))}</p>
</header>

${kpis(r)}

<div class="card"><h3>How to read this</h3><p class="ev">A charter is the set of terms written down before an agent acts for someone: what it will never do, when it stops, and who answers for it. This report checks whether those terms exist for each agent and whether the platform can hold agents to them. It does not judge whether an agent behaves well. An agent with careful instructions can still misbehave, and one with none may behave perfectly; without written terms, nobody can tell which is which. Everything here was read from your database and configuration; nothing was changed.</p></div>

<h2>Agents against the eight pillars</h2>
<p class="sub">Most exposed first: things that are wrong, then how widely each agent is shared and what it can do.</p>
${matrix(r)}

<h2>Where the gaps are</h2>
${pillarBars(r)}
<div class="card rw"><div class="w"><b>Most common wrongs</b>${commonList(s.wrongs, 'w', 'None found.')}</div><div class="r"><b>Most common strengths</b>${commonList(s.rights, 'r', 'None found.')}</div></div>

<h2>Can the platform hold agents to a charter?</h2>
<p class="sub">SPEC.md, Platform conformance. These are properties of the deployment, not of any one agent.</p>
${ladder(r)}

<h2>What agents actually did</h2>
<p class="sub">Shadow execution records from the plugin's observe-only hooks.</p>
${observations(r)}

<h2>Live probes</h2>
<p class="sub">Do agents stop, ask or hand off in the four cases the spec names?</p>
${probes(r)}

<h2>Agent by agent</h2>
<p class="sub">What each agent does right, what is wrong or missing, and the evidence for every pillar.</p>
${r.agents.map(agentCard).join('\n')}

<h2>Deployment settings read</h2>
<div class="card scroll"><table class="kv">
<tr><td>Tool approval</td><td>${ta ? `${ta.enabled ? 'on' : 'off'}, mode <code>${esc(ta.mode)}</code>; ask ${esc(ta.ask.join(', ') || 'none')}; deny ${esc(ta.deny.join(', ') || 'none')}; allow ${esc(ta.allow.join(', ') || 'none')}; ${ta.hooks} hook module(s)` : 'not configured (off)'}</td></tr>
<tr><td>Plugin hooks</td><td>${d.plugin_hooks_enabled ? 'enabled' : 'not enabled'}; bash ${d.bash_available === false ? '<b>not found</b>' : d.bash_available ? 'found' : 'n/a'}; plugins installed: ${esc(d.installed_plugins.join(', ') || 'none')}</td></tr>
<tr><td>Spend limits</td><td>${d.balance_enabled ? 'token balances on' : 'balance off'}</td></tr>
<tr><td>Agent API keys</td><td>${d.agent_api_keys ? `${d.agent_api_keys.total} issued, ${d.agent_api_keys.used} used` : 'collection not present'}</td></tr>
<tr><td>Active schedules</td><td>${d.schedules_active}</td></tr>
<tr><td>Audit log</td><td>${d.audit_log ? `${d.audit_log.total} record(s): ${esc(Object.keys(d.audit_log.by_action).join(', ') || 'none')}` : 'collection not present'}</td></tr>
<tr><td>MCP servers in librechat.yaml</td><td>${d.mcp_servers}</td></tr>
${r.librechat.notes.length ? `<tr><td>Notes</td><td>${r.librechat.notes.map(esc).join('<br>')}</td></tr>` : ''}
</table></div>

<h2>Method and limits</h2>
<div class="card ev">
<p><b>What was read.</b> Agent configuration and version history, sharing grants, roles, schedules, Agent API key counts, audit log counts, per-agent conversation counts, librechat.yaml and the plugin's own observer records. Not read: message content, conversation titles, user emails, passwords, tokens, key hashes or action credentials.</p>
<p><b>Text checks are keyword-based and English-only.</b> Purpose, prohibitions, recipients and the four escalation triggers are found by pattern, carried over from agent-governance-check's codebook where possible. Instructions in other languages read as missing, which overstates gaps; a keyword in an unrelated sentence reads as present, which understates them. Anything found this way is marked “Instructed only”, never “Met”.</p>
<p><b>Access classes are inferred.</b> LibreChat does not record whether a tool reads, writes or cannot be undone. The class comes from the tool's name, or from the HTTP method in an action's OpenAPI spec. Confirm them in the draft charters.</p>
<p><b>Approval decisions are simulated</b> from endpoints.agents.toolApproval using LibreChat's own rule order (deny, ask, allow, then mode). Per the v0.8.8 source, that policy is only attached to runs from the chat UI; Agents API and Responses API runs do not get it, while plugin hooks run on every path.</p>
<p><b>Versions are a lower bound</b>, and deleted agents cannot be checked at all: their configuration is gone.</p>
<p><b>Charter status.</b> A pass here would mean the written terms exist, not that an agent is safe. The spec says so too: a charter bounds what an agent may touch and makes departures detectable; it does not make a model reliable.</p>
</div>

<footer>Generated by ${esc(r.tool.name)} ${esc(r.tool.version)} against the <a href="${esc(r.spec.url)}">Delegation Charter Specification v${esc(r.spec.version)}</a> (CC BY 4.0, Lucas E. Wall, Almma.AI). This file contains agent names, instructions excerpts and sharing details: keep it among administrators. <code>aggregate.json</code> holds counts only and is safe to share.</footer>
</div>${script()}</body></html>`;
}

module.exports = { renderHtml, esc };
