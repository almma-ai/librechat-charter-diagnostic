/*
 * SECURITY REVIEW: loaded by bin/charter-diagnose.js; never run directly.
 * Claim, to verify against the code below (procedure: AGENTS.md):
 * Pure functions: no network, database, files, processes or dynamic code.
 */
'use strict';

/**
 * Text evidence detection for agent instructions and descriptions.
 *
 * The first four patterns are carried over unchanged from
 * almma-ai/agent-governance-check CODEBOOK v1.0, so results stay comparable.
 * The trigger patterns are new: they look for each of the four minimum
 * escalation triggers in SPEC.md v0.1.1.
 *
 * Every pattern is English-only and keyword-based. A match means "the words
 * are there", not "the agent understands them". Findings built on these
 * patterns are always labelled "stated in instructions" and never count as
 * enforced. See docs/CHECKS.md, "Known weaknesses".
 */

const ESCALATE =
  /escalat|ask (the )?(user|human|me)|check with|confirm with|defer to|if (you are |you'?re )?(unsure|uncertain)|do not (guess|assume)|human review|approval|sign[- ]?off|hand (it )?off|flag (it|this|for)/i;
const PROHIBIT =
  /\bnever\b|\bdo not\b|\bdon'?t\b|must not|shall not|under no circumstance|refuse|avoid|out of scope|not permitted|prohibited/i;
const SCOPE =
  /\byou (are|act as|will)\b|\brole\b|\bscope\b|\btask\b|\bonly\b|\bobjective\b|\bpurpose\b/i;

/** Sentences that state what the agent is for. */
const PURPOSE = /\b(purpose|goal|objective|your (job|role|task) is|you help|you (are|act as) (an?|the)\b|in order to|so that)\b/i;
/** Success measures: something the owner could check later. */
const SUCCESS = /\b(success|measured by|kpi|metric|target|goal is met|we judge|resolution rate|accuracy of)\b/i;
/** A named person, team or role to hand work to. */
const RECIPIENT =
  /\b(escalat\w* to|hand (it )?off to|forward (it )?to|refer (them|the user|it) to|contact|reach out to|notify|route (it )?to)\s+(?:the\s+|our\s+|a\s+|an\s+)?([A-Z][\w.-]+|[\w.+-]+@[\w-]+\.[\w.]+|(?:\w+\s){0,2}(team|desk|manager|lead|owner|officer|supervisor|admin|support|department|counsel))/i;

/** SPEC §Minimum escalation triggers, one pattern each. */
const TRIGGERS = {
  out_of_scope:
    /(out of scope|outside (of )?(your|the|this) (scope|role|remit)|not related to|unrelated|off[- ]topic|beyond (your|the) scope|only (answer|help|respond|discuss)|if (the user|someone|they) asks? (about|for) (anything|something) (else|other))/i,
  never_do_match:
    /((if|when) (asked|requested|the user asks|someone asks) to [^.]{0,80}(refuse|decline|do not|don'?t|never)|refuse (to|any|all|requests)|decline (to|any|all|requests)|politely decline)/i,
  missing_required_input:
    /((if|when) [^.]{0,60}(missing|unclear|ambiguous|incomplete|not provided|unknown|you don'?t have)|ask (the user )?(for|clarifying)|do not (guess|assume)|never (guess|assume|make up|invent)|clarif(y|ying question))/i,
  irreversible_action:
    /((before|prior to) (you )?(send|delet|submit|publish|book|pay|charg|transfer|execut|commit|post|cancel|confirm)\w*[^.]{0,60}(confirm|approv|ask|check|permission)|(confirm|approval|approve|permission|sign[- ]?off)[^.]{0,60}(before|prior to) (you )?(send|delet|submit|publish|book|pay|charg|transfer|execut|commit|post|cancel)|never (send|delete|submit|publish|pay|charge|transfer|execute|cancel)\w* (anything |any \w+ )?without)/i,
};

/** Rough required-input statements (pillar 6). */
const INPUTS = /\b(required (input|field|information)s?|you (must|need to) (receive|be given|have)|the user must provide|requires? (the|a|an) [\w ]{1,30} (to|before))\b/i;

function splitSentences(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** First sentence matching the pattern, trimmed for display. */
function evidence(text, pattern, max = 160) {
  const hit = splitSentences(text).find((s) => pattern.test(s));
  if (!hit) return null;
  return hit.length > max ? `${hit.slice(0, max - 1)}…` : hit;
}

/** All sentences matching the pattern, capped. Used to seed never-do drafts. */
function allEvidence(text, pattern, limit = 8, max = 200) {
  return splitSentences(text)
    .filter((s) => pattern.test(s))
    .slice(0, limit)
    .map((s) => (s.length > max ? `${s.slice(0, max - 1)}…` : s));
}

module.exports = {
  ESCALATE,
  PROHIBIT,
  SCOPE,
  PURPOSE,
  SUCCESS,
  RECIPIENT,
  TRIGGERS,
  INPUTS,
  splitSentences,
  evidence,
  allEvidence,
};
