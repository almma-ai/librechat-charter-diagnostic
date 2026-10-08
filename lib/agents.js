/*
 * SECURITY REVIEW: loaded by bin/charter-diagnose.js; never run directly.
 * Claim, to verify against the code below (procedure: AGENTS.md):
 * Pure functions: no network, database, files, processes or dynamic code.
 */
'use strict';

/**
 * Tests one LibreChat agent against the Delegation Charter Specification
 * v0.1.1: the header, the eight pillars, the four minimum escalation
 * triggers, and the lifecycle rules.
 *
 * Status vocabulary (shown in the report):
 *   met        the platform keeps a structured record that satisfies the clause
 *   stated     only written in the agent's instructions or description:
 *              guidance to the model ("Instructed"), not a charter field
 *   partial    part of the clause is satisfied
 *   missing    nothing satisfies the clause
 *   violated   the platform state contradicts the clause
 *   n/a        the clause does not apply to this agent
 */

const T = require('./text');
const { parseTool, isConsequential, isIrreversibleLike } = require('./tools');
const { decide } = require('./policy');

const OWNER_BITS = 1 | 2 | 4 | 8;

function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function fmtDate(d) {
  return d ? String(d).slice(0, 10) : '?';
}

function plural(n, word, pluralWord) {
  return `${n} ${n === 1 ? word : pluralWord || `${word}s`}`;
}

/** Sharing facts for one agent from ACL entries. */
function sharingFor(agent, acl) {
  const entries = acl.filter((e) => e.resourceType === 'agent' && e.resourceId === agent._id);
  const others = entries.filter((e) => !(e.principalType === 'user' && e.principalId === agent.author));
  const principals = { users: 0, groups: 0, roles: [], public: false };
  for (const e of others) {
    if (e.principalType === 'user') principals.users += 1;
    else if (e.principalType === 'group') principals.groups += 1;
    else if (e.principalType === 'role') principals.roles.push(e.principalId);
    else if (e.principalType === 'public') principals.public = true;
  }
  const ownerLevel = entries.filter((e) => typeof e.permBits === 'number' && (e.permBits & OWNER_BITS) === OWNER_BITS);
  const editors = others.filter((e) => typeof e.permBits === 'number' && (e.permBits & 2) === 2);
  const grantTimes = others.map((e) => e.grantedAt).filter(Boolean).sort();
  const grantedBy = [...new Set(others.map((e) => e.grantedBy).filter(Boolean))];
  const remote = acl.filter((e) => e.resourceType === 'remoteAgent' && e.resourceId === agent._id);
  return {
    shared: others.length > 0,
    principals,
    owner_level_principals: ownerLevel.length,
    non_author_editors: editors.length,
    group_or_role_editors: editors.filter((e) => e.principalType !== 'user').length,
    first_shared_at: grantTimes[0] || null,
    granted_by: grantedBy,
    granted_only_by_author: grantedBy.length > 0 && grantedBy.every((g) => g === agent.author),
    remote_api_grants: remote.length,
  };
}

function describeAudience(s) {
  const parts = [];
  if (s.principals.public) parts.push('everyone');
  if (s.principals.roles.length) parts.push(`role${s.principals.roles.length > 1 ? 's' : ''} ${s.principals.roles.join(', ')}`);
  if (s.principals.groups) parts.push(plural(s.principals.groups, 'group'));
  if (s.principals.users) parts.push(plural(s.principals.users, 'other user'));
  return parts.join(', ') || 'nobody else';
}

function evaluateAgent(agent, ctx) {
  const { acl, usersById, policy, usage, schedules, actionMethods, deployment } = ctx;
  const text = `${agent.description || ''}\n${agent.instructions || ''}`;
  const instr = agent.instructions || '';
  const tools = agent.tools.map((k) => parseTool(k, { actionMethods }));
  const byAccess = { read: 0, write: 0, irreversible: 0, code: 0, unknown: 0, wildcard: 0 };
  for (const t of tools) {
    if (t.wildcard) byAccess.wildcard += 1;
    else byAccess[t.access] = (byAccess[t.access] || 0) + 1;
  }
  const consequential = tools.filter(isConsequential);
  const irreversible = tools.filter(isIrreversibleLike);
  const share = sharingFor(agent, acl);
  const author = agent.author ? usersById.get(agent.author) : null;
  const u = usage[agent.id] || { conversations: 0, users: 0, last: null };
  const agentSchedules = schedules.filter((s) => s.agent_id === agent.id && s.enabled);
  const handsOff = agent.edges.length > 0 || agent.agent_ids.length > 0 || (agent.subagents && agent.subagents.enabled);
  const apiReachable = share.remote_api_grants > 0;

  // Decisions the endpoint-wide approval policy would take in a chat run.
  const decisions = new Map(tools.map((t) => [t.key, decide(policy, t)]));
  const heldInChat = (t) => ['ask', 'deny'].includes(decisions.get(t.key).decision);
  const irreversibleUnheld = irreversible.filter((t) => !heldInChat(t));
  const deniedTools = tools.filter((t) => decisions.get(t.key).decision === 'deny');

  const rights = [];
  const wrongs = [];

  // ------------------------------------------------------------------ header
  const header = [];
  header.push({
    key: 'id_version',
    label: 'Charter ID and version',
    requirement: 'MUST',
    status: 'partial',
    evidence: `Agent ID ${agent.id}; ${plural(agent.versions.length, 'stored version')}. LibreChat keeps agent versions, but no run records which version it ran under, and there is no charter to version.`,
  });
  if (agent.versions.length > 1) rights.push('Keeps a version history of its configuration.');

  const hasName = !!(agent.name && agent.name.trim());
  const hasDesc = !!(agent.description && agent.description.trim());
  header.push({
    key: 'name_description',
    label: 'Name and one-line description',
    requirement: 'MUST',
    status: hasName && hasDesc ? 'met' : 'missing',
    evidence: hasName && hasDesc ? 'Name and description are set.' : `Missing ${[!hasName && 'name', !hasDesc && 'description'].filter(Boolean).join(' and ')}.`,
  });

  const purpose = T.evidence(text, T.PURPOSE) || T.evidence(text, T.SCOPE);
  header.push({
    key: 'purpose',
    label: 'Purpose',
    requirement: 'MUST',
    status: purpose ? 'stated' : 'missing',
    evidence: purpose ? `“${purpose}”` : 'No statement of the business goal in the description or instructions.',
  });

  const success = T.evidence(text, T.SUCCESS);
  header.push({
    key: 'success_measure',
    label: 'Success measure',
    requirement: 'SHOULD',
    status: success ? 'stated' : 'missing',
    evidence: success ? `“${success}”` : 'Nothing says how the owner would judge whether the goal is met.',
  });
  header.push({
    key: 'review_date',
    label: 'Review date',
    requirement: 'SHOULD',
    status: 'missing',
    evidence: 'LibreChat has no review date for agents.',
  });
  header.push({
    key: 'state',
    label: 'State (Draft, Pending approval, Active, Suspended, Retired)',
    requirement: 'MUST',
    status: 'missing',
    evidence: 'An agent either exists and runs, or is deleted. There is no Draft, Suspended or Retired state.',
  });

  // ----------------------------------------------------------------- pillars
  const pillars = [];

  // 1 Owner
  {
    let status;
    let evidence;
    const editedByOthers = [...new Set(agent.versions.map((v) => v.by).filter((b) => b && b !== agent.author))];
    if (!agent.author) {
      status = 'missing';
      evidence = 'No author recorded.';
    } else if (!author) {
      status = 'violated';
      evidence = `The creator's account no longer exists. The spec requires the delegation to move to Suspended until someone else takes it; the agent is still usable by ${describeAudience(share)}.`;
      wrongs.push('Its creator has left, but it still runs.');
    } else {
      status = 'partial';
      evidence = `Created by ${author.name || 'a user'} (a platform identity). LibreChat records who created the agent, not who answers for it; nobody was declared accountable.`;
    }
    const notes = [];
    if (share.owner_level_principals > 1) {
      notes.push(`${share.owner_level_principals} principals hold owner-level rights; the spec requires one person.`);
      wrongs.push('Several principals hold owner rights; the spec asks for one accountable person.');
    }
    if (share.group_or_role_editors > 0) notes.push(`A group or role can edit it, which spreads accountability across a group.`);
    if (editedByOthers.length) notes.push(`Edited by ${plural(editedByOthers.length, 'person', 'people')} other than its creator.`);
    pillars.push({ n: 1, key: 'owner', label: 'Owner', status, evidence: [evidence, ...notes].join(' ') });
  }

  // 2 Escalation recipient
  {
    const sc = agent.support_contact;
    const scNamed = !!(sc && (sc.name || sc.email));
    const recip = T.evidence(instr, T.RECIPIENT);
    let status = 'missing';
    let evidence = 'No person or role receives work the agent must not finish.';
    if (scNamed) {
      status = 'stated';
      evidence = `Support contact is set (${sc.name || sc.email}). It is free text, not a platform identity, and nothing routes work to it.`;
      rights.push('Names a support contact.');
    } else if (recip) {
      status = 'stated';
      evidence = `Instructions name a recipient: “${recip}”. Nothing routes work there; it relies on the model.`;
    }
    pillars.push({ n: 2, key: 'escalation_recipient', label: 'Escalation recipient', status, evidence });
  }

  // 3 Approval authority
  {
    const required = share.shared || consequential.length > 0;
    let status;
    let evidence;
    if (!required) {
      status = 'n/a';
      evidence = 'Not shared and no write or irreversible tools: the charter may be self-declared.';
    } else {
      status = 'missing';
      const why = [];
      if (share.shared) why.push(`is shared with ${describeAudience(share)}`);
      if (consequential.length) why.push(`holds ${plural(consequential.length, 'write or irreversible tool')}`);
      evidence = `Required because it ${why.join(' and ')}. LibreChat has no approval step for agents.`;
      if (share.shared && share.granted_only_by_author) {
        evidence += ' Every share was granted by its own creator; no second person approved.';
        wrongs.push('Shared by its own creator with no second person approving.');
      }
    }
    pillars.push({ n: 3, key: 'approval_authority', label: 'Approval authority', status, evidence });
  }

  // 4 Scope
  let neverDoStated = [];
  {
    neverDoStated = T.allEvidence(instr, T.PROHIBIT);
    const willDo = T.evidence(text, T.SCOPE);
    let status;
    let evidence;
    if (neverDoStated.length === 0) {
      status = 'missing';
      evidence = 'The never-do list must not be empty. The instructions contain no prohibition.';
      if (consequential.length || share.shared) wrongs.push('Has no never-do list.');
    } else {
      status = 'stated';
      evidence = `${plural(neverDoStated.length, 'prohibition')} in the instructions (Instructed: guidance to the model only), e.g. “${neverDoStated[0]}”.`;
      rights.push('States what it must not do.');
    }
    if (!willDo) evidence += ' No will-do statement either.';
    if (deniedTools.length) evidence += ` ${plural(deniedTools.length, 'tool')} of its tools are blocked by the endpoint-wide deny list, which is enforcement, but the same list applies to every agent.`;
    pillars.push({ n: 4, key: 'scope', label: 'Scope: will do and never do', status, evidence });
  }

  // 5 Systems and permissions
  {
    let status;
    let evidence;
    if (tools.length === 0) {
      status = 'met';
      evidence = 'No tools. LibreChat may still add capability tools (Ask User, file tools, skills) at run time; the observer shows which.';
    } else {
      status = 'partial';
      const mix = Object.entries(byAccess)
        .filter(([, n]) => n)
        .map(([k, n]) => `${n} ${k}`)
        .join(', ');
      evidence = `${plural(tools.length, 'tool')} listed, which LibreChat enforces as the agent's tool set. No access class is recorded; inferred: ${mix}.`;
      rights.push('Has an explicit tool list.');
      const wild = tools.filter((t) => t.wildcard);
      if (wild.length) {
        evidence += ` ${wild.map((t) => `All tools on MCP server "${t.server}" are granted, including tools added later`).join('; ')}; the spec says anything not listed is excluded.`;
        wrongs.push('Granted every tool on an MCP server, including future ones.');
      }
    }
    if (handsOff) evidence += ' Passes work to other agents (hand-offs or subagents); that work runs under this charter unless they have their own.';
    pillars.push({ n: 5, key: 'systems', label: 'Systems and permissions', status, evidence });
  }

  // 6 Inputs and outputs
  {
    const inputs = T.evidence(instr, T.INPUTS);
    const defaultsOk = irreversibleUnheld.length === 0;
    let status;
    let evidence;
    if (inputs) {
      status = 'stated';
      evidence = `“${inputs}”`;
    } else if (defaultsOk) {
      status = 'met';
      evidence = 'No required inputs declared. The spec allows defaults here because no irreversible action runs unapproved.';
    } else {
      status = 'missing';
      evidence = 'No required inputs declared, and defaults are not allowed because irreversible actions can run without a person approving.';
    }
    pillars.push({ n: 6, key: 'inputs_outputs', label: 'Inputs and outputs', status, evidence });
  }

  // 7 Escalation rules (four minimum triggers)
  const triggers = [];
  {
    const labels = {
      out_of_scope: 'A request falls outside the scope',
      never_do_match: 'A request matches the never-do list',
      missing_required_input: 'A required input is missing',
      irreversible_action: 'About to take an irreversible action',
    };
    for (const [key, re] of Object.entries(T.TRIGGERS)) {
      const hit = T.evidence(instr, re);
      let status = hit ? 'stated' : 'missing';
      let evidence = hit ? `“${hit}”` : 'Not covered.';
      if (key === 'irreversible_action') {
        if (irreversible.length === 0) {
          status = hit ? 'stated' : 'n/a';
          evidence = hit ? evidence : 'No irreversible tools inferred.';
        } else if (irreversibleUnheld.length === 0) {
          status = 'met';
          evidence = `Every irreversible tool is held by the endpoint approval policy in chat.${apiReachable ? ' Not on the Agents API path (see conformance).' : ''}`;
        }
      }
      triggers.push({ key, label: labels[key], status, evidence });
    }
    const applicable = triggers.filter((t) => t.status !== 'n/a');
    const covered = applicable.filter((t) => ['met', 'stated'].includes(t.status)).length;
    const status = covered === applicable.length ? (applicable.some((t) => t.status === 'stated') ? 'stated' : 'met') : covered === 0 ? 'missing' : 'partial';
    pillars.push({
      n: 7,
      key: 'escalation_rules',
      label: 'Escalation rules',
      status,
      evidence: `${covered} of ${applicable.length} applicable minimum triggers covered.${covered ? ' Where covered by instruction, nothing routes the case to a named recipient: LibreChat\'s Ask User asks the person chatting, not an escalation recipient.' : ''}`,
    });
    if (covered === 0 && (share.shared || consequential.length)) wrongs.push('Has no rule for when to stop and hand off.');
  }

  // 8 Execution constraints
  {
    let status;
    const parts = [];
    if (irreversible.length === 0) {
      status = 'met';
      parts.push('No irreversible tools inferred.');
    } else if (irreversibleUnheld.length === 0) {
      status = 'met';
      parts.push(`All ${plural(irreversible.length, 'irreversible tool')} are held for a person in chat.`);
      rights.push('Irreversible tools are held for approval in chat.');
    } else {
      status = 'violated';
      parts.push(
        `${plural(irreversibleUnheld.length, 'irreversible tool')} run without a person approving: ${irreversibleUnheld
          .slice(0, 4)
          .map((t) => (t.wildcard ? `every tool on ${t.server}` : t.tool))
          .join(', ')}${irreversibleUnheld.length > 4 ? '…' : ''} (${decisions.get(irreversibleUnheld[0].key).why}).`,
      );
      wrongs.push('Can take irreversible actions with nobody approving.');
    }
    if (apiReachable && irreversible.length) {
      parts.push('It is also reachable through the Agents API, where the approval policy is not applied.');
      if (status === 'met') status = 'partial';
    }
    const limit = agent.recursion_limit ?? deployment.recursion_limit;
    parts.push(limit ? `Step limit ${limit}.` : 'No step limit set beyond LibreChat defaults.');
    parts.push(deployment.balance_enabled ? 'Spend is capped by token balances.' : 'No spend limit (balance is off).');
    if (agentSchedules.length) parts.push(`Runs on ${plural(agentSchedules.length, 'schedule')} with no person present.`);
    if (status === 'met' && !deployment.balance_enabled) status = 'partial';
    pillars.push({ n: 8, key: 'constraints', label: 'Execution constraints', status, evidence: parts.join(' ') });
  }

  // --------------------------------------------------------------- lifecycle
  const lifecycle = [];
  if (share.first_shared_at) {
    const after = agent.versions.filter((v) => v.at && v.at > share.first_shared_at);
    if (after.length) {
      const before = [...agent.versions].filter((v) => v.at && v.at <= share.first_shared_at).pop();
      const gained = before && before.tools ? after.flatMap((v) => (v.tools || []).filter((t) => !before.tools.includes(t))) : [];
      const gainedUnique = [...new Set(gained)];
      lifecycle.push({
        key: 'changed_after_sharing',
        status: 'violated',
        evidence: `Changed ${plural(after.length, 'time')} after it was first shared on ${fmtDate(share.first_shared_at)}. Each change reached ${describeAudience(share)} immediately; the spec returns a changed charter to Draft for re-approval.${gainedUnique.length ? ` Tools added after sharing: ${gainedUnique.slice(0, 5).map((k) => parseTool(k).tool).join(', ')}.` : ''}`,
      });
      wrongs.push(gainedUnique.length ? 'Gained tools after it was shared, without re-approval.' : 'Changed after it was shared, without re-approval.');
    }
  }
  if (agent.author && !author) {
    lifecycle.push({ key: 'owner_left', status: 'violated', evidence: 'Creator no longer exists; the agent was not suspended.' });
  }
  if (agentSchedules.length) {
    lifecycle.push({ key: 'background_runs', status: 'partial', evidence: `${plural(agentSchedules.length, 'active schedule')} run it with nobody watching.` });
  }
  if (apiReachable) {
    lifecycle.push({ key: 'api_reachable', status: 'partial', evidence: `Granted to ${plural(share.remote_api_grants, 'principal')} for the Agents API.` });
  }
  if (share.shared && u.last && daysBetween(u.last, ctx.now) > 90) {
    lifecycle.push({ key: 'dormant_but_shared', status: 'partial', evidence: `Still shared, but unused since ${fmtDate(u.last)}. A charter would move it to Retired.` });
  }

  // --------------------------------------------------------------- verdict
  const mustMissing = [
    ...header.filter((h) => h.requirement === 'MUST' && ['missing', 'violated'].includes(h.status)).map((h) => h.label),
    ...pillars.filter((p) => ['missing', 'violated'].includes(p.status)).map((p) => `Pillar ${p.n}: ${p.label}`),
  ];
  const path = share.shared || consequential.length ? 'approval' : 'self-declared';
  const counts = { met: 0, stated: 0, partial: 0, missing: 0, violated: 0, 'n/a': 0 };
  for (const p of pillars) counts[p.status] += 1;

  const exposure =
    (share.principals.public ? 1000 : 0) +
    share.principals.roles.length * 200 +
    share.principals.groups * 50 +
    share.principals.users * 10 +
    consequential.length * 20 +
    irreversibleUnheld.length * 60 +
    Math.min(u.conversations, 500);

  return {
    _id: agent._id,
    id: agent.id,
    name: agent.name || '(unnamed agent)',
    provider: agent.provider,
    model: agent.model,
    author: { id: agent.author, name: author ? author.name : null, exists: !!author },
    created_at: agent.createdAt,
    updated_at: agent.updatedAt,
    usage: u,
    sharing: { ...share, audience: describeAudience(share) },
    api_reachable: apiReachable,
    schedules: agentSchedules.length,
    hands_off: !!handsOff,
    tools: tools.map((t) => ({ ...t, approval: decisions.get(t.key) })),
    access_summary: byAccess,
    never_do_stated: neverDoStated,
    header,
    pillars,
    triggers,
    lifecycle,
    rights: [...new Set(rights)],
    wrongs: [...new Set(wrongs)],
    counts,
    activation: {
      path,
      complete: mustMissing.length === 0,
      missing: mustMissing,
      verdict:
        mustMissing.length === 0
          ? 'All MUST fields present; still needs a charter record and an approver.'
          : path === 'approval'
            ? 'Could not be activated: MUST fields are missing, and it needs an approval LibreChat cannot record.'
            : 'Could not be activated: MUST fields are missing. It could be self-declared once they are written.',
    },
    exposure,
  };
}

module.exports = { evaluateAgent, sharingFor };
