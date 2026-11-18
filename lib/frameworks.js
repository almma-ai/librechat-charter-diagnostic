/*
 * SECURITY REVIEW: loaded by lib/diagnose.js; never run directly.
 * Claim, to verify against the code below (procedure: AGENTS.md):
 * Pure functions over the diagnosis result: no network, database, files,
 * processes or dynamic code.
 */
'use strict';

/**
 * Reads the diagnosis against outside frameworks: the EU AI Act, ISO/IEC 42001
 * Annex A and the NIST AI RMF 1.0. One row per requirement, each with the
 * clauses it touches and how this deployment's evidence stands against it.
 *
 * MAP_STATUS says whether a qualified person has checked the clause mapping.
 * Until they have, every output carries that warning. This is a gap list, not
 * a compliance opinion: the tool cannot tell whether an agent is high-risk
 * under the Act, and most of the Act's obligations below apply only if it is.
 */

const MAP_VERSION = '0.1.0';
const MAP_STATUS = 'unreviewed';
const MAP_NOTE =
  'This mapping has not yet been reviewed clause by clause by a lawyer or an accredited ISO/IEC 42001 auditor. It is not legal advice and not a conformity assessment.';

const ACT_DATES = [
  { what: 'AI literacy (Art. 4) and prohibited practices (Art. 5)', applies: 'since 2 February 2025' },
  { what: 'Transparency to people interacting with AI (Art. 50)', applies: 'since 2 August 2026' },
  { what: 'High-risk obligations for Annex III uses (Arts. 9-15, 26)', applies: 'from 2 December 2027, as amended by Regulation (EU) 2026/1744' },
];

const PASS_CONF = new Set(['supported', 'configured']);

function stats(agents, pick) {
  const t = { n: 0, met: 0, stated: 0, partial: 0, missing: 0, violated: 0, 'n/a': 0 };
  for (const a of agents) {
    const x = pick(a);
    if (!x) continue;
    t.n += 1;
    t[x.status] = (t[x.status] || 0) + 1;
  }
  t.applicable = t.n - t['n/a'];
  return t;
}
const pillar = (key) => (a) => a.pillars.find((p) => p.key === key);
const header = (key) => (a) => a.header.find((h) => h.key === key);
const conf = (r, key) => r.conformance.checks.find((c) => c.key === key) || { status: 'not_supported', evidence: '' };
const lifecycleCount = (r, key) => r.agents.filter((a) => a.lifecycle.some((l) => l.key === key)).length;
const of = (k, n) => `${k} of ${n}`;

/** gap < partial < covered; not_assessed stands apart. */
function worst(...ss) {
  const rank = { gap: 0, partial: 1, covered: 2 };
  return ss.reduce((w, s) => (rank[s] < rank[w] ? s : w), 'covered');
}

/**
 * Each requirement: plain title (the words people search for), the clauses,
 * who the Act puts the duty on, and evaluate(result) → { status, finding, fix }.
 */
const REQUIREMENTS = [
  {
    key: 'inventory',
    title: 'An inventory of AI agents',
    eu: [{ ref: 'Art. 26 (whole)', note: 'Not a separate duty in the Act, but a deployer cannot meet Art. 26 for systems it has not listed.' }],
    iso: ['A.4.2'],
    nist: ['GOVERN 1.6'],
    duty_on: 'deployer',
    evaluate(r) {
      const s = r.summary;
      const left = s.owner_left;
      return {
        status: left ? 'partial' : 'covered',
        finding: `This report lists ${s.agents} agent(s), ${s.agents_used} used and ${s.agents_shared} shared.${left ? ` ${left} still run with a creator who no longer exists.` : ''} Deleted agents cannot be listed.`,
        fix: 'Keep this run on a schedule so the inventory stays current; record an accountable owner for every agent.',
      };
    },
  },
  {
    key: 'intended_use',
    title: 'A documented purpose and limits for each agent',
    eu: [{ ref: 'Art. 26(1)', note: 'Use the system according to its instructions for use.' }, { ref: 'Art. 13(3)(b)', note: 'Provider states intended purpose and limitations.' }],
    iso: ['A.9.4'],
    nist: ['MAP 1.1'],
    duty_on: 'both',
    evaluate(r) {
      const p = stats(r.agents, header('purpose'));
      const sc = stats(r.agents, pillar('scope'));
      const status = sc.missing > sc.n / 2 ? 'gap' : 'partial';
      return {
        status,
        finding: `Purpose written: ${of(p.stated + p.met, p.n)} agents (in instructions only). Never-do list written: ${of(sc.stated + sc.met, sc.n)}; missing for ${sc.missing}. None is held in a structured record.`,
        fix: 'Write a charter for each agent with purpose and never-do items (draft charters are in charters/).',
      };
    },
  },
  {
    key: 'oversight_people',
    title: 'Named people responsible for human oversight',
    eu: [{ ref: 'Art. 26(2)', note: 'Assign oversight to people with the competence, training, authority and support to do it.' }],
    iso: ['A.3.2'],
    nist: ['GOVERN 2.1', 'GOVERN 3.2'],
    duty_on: 'deployer',
    evaluate(r) {
      const o = stats(r.agents, pillar('owner'));
      const e = stats(r.agents, pillar('escalation_recipient'));
      const ap = stats(r.agents, pillar('approval_authority'));
      const status = o.violated || e.missing > e.n / 2 ? 'gap' : 'partial';
      return {
        status,
        finding: `No agent has a declared accountable owner (the creator is on record for ${o.partial}; ${o.violated} creator(s) are gone). Escalation recipient named for ${of(e.stated + e.met, e.n)}. Approval authority needed for ${ap.applicable}, recorded for ${ap.met}.`,
        fix: 'Name an owner, an escalation recipient and, for shared or acting agents, an approval authority in each charter.',
      };
    },
  },
  {
    key: 'stop_override',
    title: 'Ability to override, hold or stop an agent',
    eu: [{ ref: 'Art. 14(4)(d)-(e)', note: 'Overseers can decide not to use, override or reverse output, and halt the system safely.' }, { ref: 'Art. 26(5)', note: 'Deployer suspends use when it has reason to believe there is a risk.' }],
    iso: ['A.9.2'],
    nist: ['MANAGE 2.4'],
    duty_on: 'both',
    evaluate(r) {
      const hold = conf(r, 'hold_irreversible');
      const unheld = r.summary.irreversible_unheld_agents;
      const holdStatus = unheld || !PASS_CONF.has(hold.status) ? 'gap' : 'covered';
      return {
        status: worst(holdStatus, 'partial'),
        finding: `${unheld} agent(s) can take an irreversible-like action no approval rule holds. ${hold.evidence} There is no Suspended state: an agent can only be edited or deleted.`,
        fix: 'Turn on endpoints.agents.toolApproval with ask rules for every irreversible tool; add a suspend switch (plugin hook refusing runs of suspended agents).',
      };
    },
  },
  {
    key: 'escalation',
    title: 'Escalation to a person when an agent is out of bounds',
    eu: [{ ref: 'Art. 14(4)(a)', note: 'Overseers can monitor operation and detect anomalies.' }],
    iso: ['A.3.3'],
    nist: ['MAP 3.5'],
    duty_on: 'both',
    evaluate(r) {
      const t = stats(r.agents, pillar('escalation_rules'));
      const route = conf(r, 'route_escalations');
      return {
        status: t.missing > t.n / 2 || !PASS_CONF.has(route.status) ? 'gap' : 'partial',
        finding: `Escalation rules written for ${of(t.stated + t.met, t.n)} agents (all four triggers or some). ${route.evidence}`,
        fix: 'Write the four stop triggers into each charter; route escalations to the named recipient, not back to the requester.',
      };
    },
  },
  {
    key: 'logging',
    title: 'Automatic logs of what agents did',
    eu: [{ ref: 'Art. 12', note: 'High-risk systems allow automatic recording of events over their lifetime (provider design duty).' }, { ref: 'Art. 26(6)', note: 'Deployer keeps the logs under its control.' }],
    iso: ['A.6.2.8'],
    nist: ['MANAGE 4.1'],
    duty_on: 'both',
    evaluate(r) {
      const link = conf(r, 'link_records');
      const obs = r.observations && r.observations.present;
      return {
        status: obs ? 'partial' : 'gap',
        finding: obs
          ? `Observer records cover ${r.observations.totals.records} event(s) since ${r.observations.window.first.slice(0, 10)}, metadata only. ${link.evidence}`
          : `No record of which agent called which tool. ${link.evidence}`,
        fix: 'Enable the plugin hooks (DEPLOYMENT_PLUGIN_HOOKS=true, bash on the API host); link each record to the charter version it ran under.',
      };
    },
  },
  {
    key: 'log_retention',
    title: 'Keeping agent logs for at least six months',
    eu: [{ ref: 'Art. 26(6)', note: 'Deployers keep logs at least six months unless other law (e.g. GDPR) requires otherwise.' }, { ref: 'Art. 19(1)', note: 'Same minimum for providers.' }],
    iso: ['A.6.2.8'],
    nist: [],
    duty_on: 'both',
    evaluate(r) {
      const days = r.deployment.observer_retention_days;
      const obs = r.observations && r.observations.present;
      if (!obs) {
        return { status: 'gap', finding: 'No agent activity logs exist to retain.', fix: 'Enable logging first, then set retention to at least 183 days.' };
      }
      const ok = typeof days === 'number' && days >= 183;
      return {
        status: ok ? 'covered' : 'gap',
        finding: `Observer records are kept ${days == null ? 'for an unknown period' : `${days} days`}${ok ? '' : ', below the six-month minimum'}. Retention of LibreChat's own logs was not checked.`,
        fix: ok ? 'Confirm the retention period against your data protection assessment.' : 'Set CHARTER_DIAG_RETENTION_DAYS=183 or more, and check it against your GDPR retention basis.',
      };
    },
  },
  {
    key: 'monitoring',
    title: 'Monitoring agents in operation and catching drift',
    eu: [{ ref: 'Art. 26(5)', note: 'Deployers monitor operation and inform the provider of risks or serious incidents.' }, { ref: 'Art. 72', note: 'Provider post-market monitoring.' }],
    iso: ['A.6.2.6'],
    nist: ['MANAGE 4.1'],
    duty_on: 'both',
    evaluate(r) {
      const drift = conf(r, 'flag_drift');
      const obs = r.observations && r.observations.present;
      return {
        status: PASS_CONF.has(drift.status) ? 'covered' : obs ? 'partial' : 'gap',
        finding: drift.evidence || 'No observer records to compare against agent tool lists.',
        fix: 'Run this diagnosis on a schedule and have each owner review drift for their agents.',
      };
    },
  },
  {
    key: 'change_control',
    title: 'Version history and change control for agents',
    eu: [{ ref: 'Art. 11 and Annex IV', note: 'Technical documentation kept up to date (provider).' }],
    iso: ['A.6.2.7'],
    nist: [],
    duty_on: 'provider',
    evaluate(r) {
      const keep = conf(r, 'keep_versions');
      const redraft = conf(r, 'redraft_on_change');
      const changed = lifecycleCount(r, 'changed_after_sharing');
      return {
        status: changed ? 'gap' : worst(PASS_CONF.has(keep.status) ? 'covered' : 'partial', PASS_CONF.has(redraft.status) ? 'covered' : 'partial'),
        finding: `${changed} shared agent(s) were changed after sharing with no re-approval. ${keep.evidence}`,
        fix: 'Return an agent to Draft when its tools or instructions change, and keep its history when it is deleted.',
      };
    },
  },
  {
    key: 'least_privilege',
    title: 'Agents limited to the tools they need',
    eu: [{ ref: 'Art. 9(2)', note: 'Risk management: identify and mitigate foreseeable risks.' }, { ref: 'Art. 15(5)', note: 'Resilience against misuse of the system (cybersecurity).' }],
    iso: ['A.4.2', 'A.9.2'],
    nist: [],
    duty_on: 'both',
    evaluate(r) {
      const deny = conf(r, 'deny_unlisted');
      const sys = stats(r.agents, pillar('systems'));
      return {
        status: PASS_CONF.has(deny.status) ? 'partial' : 'gap',
        finding: `${r.summary.agents_with_consequential_tools} agent(s) hold write, irreversible or code tools. No agent has a confirmed access class per tool (${sys.partial} inferred). ${deny.evidence}`,
        fix: 'Replace whole-server MCP grants with named tools and confirm each tool\'s access class in the charter.',
      };
    },
  },
  {
    key: 'user_info',
    title: 'Telling people they are dealing with AI, and its limits',
    eu: [{ ref: 'Art. 50(1)', note: 'People are informed they are interacting with an AI system (provider design duty), in force since 2 August 2026.' }, { ref: 'Art. 26(11)', note: 'Annex III deployers inform affected persons.' }],
    iso: ['A.8.2'],
    nist: [],
    duty_on: 'both',
    evaluate(r) {
      const show = conf(r, 'show_terms_to_users');
      return {
        status: 'partial',
        finding: `${show.evidence} Whether your interface discloses AI use to each person was not checked.`,
        fix: 'Show each agent\'s purpose, limits and contact in the chat; check your AI disclosure wording separately.',
      };
    },
  },
  {
    key: 'review_retire',
    title: 'Periodic review and retirement of agents',
    eu: [{ ref: 'Art. 26(5)', note: 'Suspend use where a risk is identified.' }],
    iso: ['A.6.2.6'],
    nist: ['GOVERN 1.5', 'GOVERN 1.7'],
    duty_on: 'deployer',
    evaluate(r) {
      const dormant = lifecycleCount(r, 'dormant_but_shared');
      return {
        status: 'gap',
        finding: `No agent has a review date or a Retired state. ${dormant} agent(s) are still shared but unused for 90+ days.`,
        fix: 'Set a review date in each charter and retire dormant shared agents.',
      };
    },
  },
  {
    key: 'risk_classification',
    title: 'Knowing which agents are high-risk under the Act',
    eu: [{ ref: 'Art. 6 and Annex III', note: 'High-risk uses include hiring, education access, credit, essential services.' }],
    iso: ['A.5.2'],
    nist: ['MAP 1.1'],
    duty_on: 'both',
    evaluate() {
      return {
        status: 'not_assessed',
        finding: 'This tool cannot tell what an agent is used for in the real world. Most rows above become legal duties only for agents used in an Annex III area.',
        fix: 'Classify each agent by use; the charter purpose field is where that answer belongs.',
      };
    },
  },
  {
    key: 'ai_literacy',
    title: 'AI literacy of the people using agents',
    eu: [{ ref: 'Art. 4', note: 'Measures for sufficient AI literacy of staff (softened by Regulation (EU) 2026/1744).' }],
    iso: ['A.4.6'],
    nist: ['GOVERN 2.2'],
    duty_on: 'both',
    evaluate() {
      return { status: 'not_assessed', finding: 'Training is outside what a deployment scan can see.', fix: 'Keep training records alongside the charters.' };
    },
  },
];

function frameworkGaps(result) {
  const rows = REQUIREMENTS.map((q) => {
    let ev;
    try {
      ev = q.evaluate(result);
    } catch (e) {
      ev = { status: 'not_assessed', finding: `Could not be evaluated (${e.message}).`, fix: '' };
    }
    return { key: q.key, title: q.title, eu: q.eu, iso: q.iso, nist: q.nist, duty_on: q.duty_on, ...ev };
  });
  const count = (s) => rows.filter((x) => x.status === s).length;
  return {
    map_version: MAP_VERSION,
    map_status: MAP_STATUS,
    map_note: MAP_NOTE,
    act_dates: ACT_DATES,
    totals: { covered: count('covered'), partial: count('partial'), gap: count('gap'), not_assessed: count('not_assessed') },
    rows,
  };
}

module.exports = { frameworkGaps, REQUIREMENTS, MAP_VERSION, MAP_STATUS, MAP_NOTE, ACT_DATES };
