# Checks

Every check, the clause of the [Delegation Charter Specification v0.1.1](https://github.com/almma-ai/delegation-charter/blob/main/SPEC.md) it tests, and how it is decided on LibreChat v0.8.8. Source: `lib/agents.js` (per agent) and `lib/conformance.js` (per deployment).

## Status vocabulary

| Status | Meaning |
| --- | --- |
| Met | A structured record the platform keeps satisfies the clause. |
| Instructed only | The term is written in the agent's instructions or description. It guides the model; it is not a charter field and nothing outside the model enforces it. |
| Partial | Part of the clause is satisfied. |
| Missing | Nothing satisfies the clause. |
| Contradicted | The platform state contradicts the clause (for example, the owner left and the agent still runs). |
| Not required | The clause does not apply to this agent. |

## Per agent: header

| Check | Spec | Decided by |
| --- | --- | --- |
| Charter ID and version | MUST | Always Partial: LibreChat keeps `versions[]` but no run records which version it ran under. |
| Name and description | MUST | Both fields non-empty. |
| Purpose | MUST | A purpose or role sentence in description or instructions (pattern `PURPOSE`, then `SCOPE`) → Instructed only. |
| Success measure | SHOULD | Pattern `SUCCESS` → Instructed only. |
| Review date | SHOULD | Always Missing: no field exists. |
| State | MUST | Always Missing: agents have no Draft, Suspended or Retired state. |

## Per agent: the eight pillars

| # | Pillar | Decided by |
| --- | --- | --- |
| 1 | Owner | Creator exists as a user → Partial (creator on record, nobody declared accountable). Creator deleted → Contradicted (spec requires Suspended). Notes: more than one owner-level ACL grant; a group or role with edit rights; versions edited by someone other than the creator (`versions[].updatedBy`). |
| 2 | Escalation recipient | Non-empty `support_contact` or a named recipient in instructions (pattern `RECIPIENT`) → Instructed only. Otherwise Missing. |
| 3 | Approval authority | Required when the agent is shared (any ACL grant beyond its creator) or holds write, irreversible, code or whole-server MCP tools. Required → Missing (LibreChat has no approval step), noting shares granted only by the creator. Not required → Not required (may be self-declared). |
| 4 | Scope | Prohibitions in instructions (pattern `PROHIBIT`, from agent-governance-check) → Instructed only. None → Missing (the never-do list must not be empty). Tools blocked by the endpoint deny list are noted as enforcement that applies to every agent alike. |
| 5 | Systems and permissions | No tools → Met. Tools → Partial: listed and enforced as the tool set, but no access class recorded; the inferred mix is shown. Whole-server MCP grants (`sys__all__sys_mcp_<server>`) are reported as wrong. Hand-offs and subagents are noted. |
| 6 | Inputs and outputs | Required inputs stated (pattern `INPUTS`) → Instructed only. Otherwise Met by default when no irreversible tool runs unapproved (the spec allows defaults), else Missing. |
| 7 | Escalation rules | The four minimum triggers, each by pattern (`TRIGGERS.*`). The irreversible-action trigger is Met when every irreversible tool is held by the approval policy, and Not required when the agent has none. Status over applicable triggers: all → Instructed only (or Met), none → Missing, some → Partial. |
| 8 | Execution constraints | Any irreversible-like tool (irreversible, code, whole-server MCP) not held by the approval policy in chat → Contradicted. Otherwise Met, lowered to Partial when there is no spend limit or when the agent is reachable through the Agents API (where approval policy does not apply). Step limit and schedules are noted. |

## Per agent: lifecycle

| Check | Decided by |
| --- | --- |
| Changed after sharing | A stored version newer than the first share grant (`aclentries.grantedAt`). Tools present in later versions but not in the version current at first share are listed. |
| Owner left | `author` does not resolve to a user. |
| Background runs | Enabled schedules for the agent. |
| Agents API | `remoteAgent` ACL grants for the agent. |
| Dormant but shared | Shared, last conversation more than 90 days ago. |

## Access classes

LibreChat does not record whether a tool reads, writes or cannot be undone, so the class is inferred and labelled as such:

1. Known LibreChat tools (web_search, file_search, execute_code, memory, …) have fixed classes.
2. OpenAPI actions use the HTTP method of the operation in the stored spec: GET read, POST/PUT/PATCH write, DELETE irreversible. Unknown methods count as write.
3. Everything else uses the first verb in the tool name: `list_deleted_items` is read, `delete_item` is irreversible. Verbs are listed in `lib/tools.js`. Nouns that double as verbs (post, order, email, message) are left out so `get_post` is not misread.

Code execution and whole-server MCP grants are treated as irreversible-like for pillar 8.

## Approval simulation

`lib/policy.js` applies `endpoints.agents.toolApproval` to each tool the way LibreChat's SDK folds it: deny, then ask, then allow, then the mode (`bypass` allows, `dontAsk` denies, `default` asks). Globs are anchored. MCP tools are matched under both `<tool>_mcp_<server>` and `mcp:<server>:<tool>`.

Per the v0.8.8 source (`packages/api/src/agents/run.ts`), this policy and programmatic approval hooks are attached only to runs whose caller can pause (the chat UI). OpenAI-compatible Agents API and Responses API runs take the no-approval path. Plugin hooks are registered for every run.

## Deployment: conformance

| Level | Clause | Decided by | Closes with |
| --- | --- | --- | --- |
| 1 | Capture every MUST field | No charter fields on the agent schema → Not supported. | plugin (store), core (builder UI) |
| 1 | Refuse to approve an incomplete charter | No approval step → Not supported. | plugin |
| 1 | Keep every charter version | Versions kept, but deleting an agent deletes its history; deleted agents with traffic are counted → Partial. | core |
| 1 | Show users the terms | Description and support contact only → Partial. | core |
| 2 | Deny unlisted tools at the tool boundary | Tool list enforced; whole-server MCP grants → Partial. | config |
| 2 | Enforce never-do items outside the model | Tool approval on with deny rules or hooks → Partial (endpoint-wide only); else Not configured. | plugin |
| 2 | Route escalations to the named recipient | Ask User asks the requester → Not supported. | core |
| 2 | Hold irreversible actions | Approval off → Not configured; on with unheld irreversible tools → Partial; all held → Configured. API path noted. | config, plugin |
| 2 | Approval authority approves sharing | Sharing is a role permission → Not supported. Roles with SHARE and SHARE_PUBLIC listed. | core |
| 2 | Return to Draft on change | Edits apply immediately; agents changed after sharing counted → Not supported. | plugin |
| 2 | Hook runtime (prerequisite) | `DEPLOYMENT_PLUGIN_HOOKS` unset → Not configured; set but no `bash` on the host → Broken (command hooks fail open); else Configured. | config |
| 3 | Link records to charter version | Audit log holds only grant and permission actions; observer records exist → Partial; else Not supported. | plugin |
| 3 | Flag drift | Observer present → Partial with unlisted tool calls counted; else Not supported. | plugin |
| 3 | Prompt owner at review date | Not supported. | plugin |
| 3 | Independent read | Audit log present → Partial (no agent activity in it); else Not supported. | plugin |

A level is reached only when every clause in it passes (Supported or Configured), and each level includes the one before.

## Observer records

`hooks/record.js` writes one JSON line per event to `$PLUGIN_DATA/observations/<UTC date>.jsonl`:

```json
{"v":1,"ts":"2026-09-30T14:02:11.412Z","event":"PreToolUse","run":"run_…","session":"3f9a…(sha256/16)","agent":"agent_…","tool":"send_email_mcp_gmail","call":"b71c…(sha256/16)","input_keys":["body","to"],"input_bytes":212}
```

Never stored: prompt text, tool argument values, tool output, user IDs, raw conversation or tool-call IDs. Files older than `CHARTER_DIAG_RETENTION_DAYS` (default 30) are deleted at the start of a run. Set `CHARTER_DIAG_DISABLE=true` to stop recording without uninstalling.

## Known weaknesses

- **English-only text patterns.** Instructions in other languages read as missing, overstating gaps. A keyword in an unrelated sentence reads as present, understating them. Both are why text findings are never shown as Met.
- **Inferred access classes** can be wrong; confirm them in the draft charters.
- **Version history is a lower bound**; deleted agents cannot be tested.
- **Probe grading is keyword-based**; every reply is kept for a person to read, and anything unclear is marked "Read reply".
