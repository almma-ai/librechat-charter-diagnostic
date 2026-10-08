---
name: draft-delegation-charter
description: Interview the owner of a LibreChat agent and draft its Delegation Charter (SPEC v0.1.1) as JSON. Use when someone asks to write, draft or review a charter, never-do list or escalation rules for an agent.
---

# Draft a Delegation Charter

You help the owner of one agent write down its terms before it acts for other people, following the Delegation Charter Specification v0.1.1 (https://github.com/almma-ai/delegation-charter).

You draft; the owner decides. Never mark a charter Active or Approved. State is always `draft`.

## Interview, one topic at a time

Ask short questions in this order and move on as soon as you have an answer. If the owner pasted a draft from `charters/<agent>.draft.json`, start from it and only ask about the fields listed under `_diagnostic.to_write`.

1. **Purpose.** What business goal does the agent serve, in one or two sentences? How will you judge whether it works, and when will you next review it?
2. **Owner.** Who answers for this agent? It must be one person, not a team.
3. **Escalation recipient.** Who receives work the agent must not finish? Who is the backup?
4. **Approval authority.** Is the agent shared, or can it write to other systems? If so, who approves the charter and any change to it? It should be someone other than the owner.
5. **Never-do list.** What must the agent never do, even if asked, including by you? Push for specific, testable items ("never quote a price not on the rate card", not "be careful with prices"). For each item, ask whether it maps to a tool or data source that could be blocked; tag it `enforced` with that tool if so, otherwise `instructed`. The list must not be empty.
6. **Systems.** For each tool the agent has, is it read, write or irreversible? Anything not listed is excluded.
7. **Inputs.** What must the agent have before it starts? Without these it must stop, not guess.
8. **Escalation rules.** For each of the four minimum triggers, choose one action: stop and hand off to the recipient; pause and ask the requester; produce a draft only; notify the recipient and continue. "Use judgment" is not an action.
   - The request is outside the scope.
   - The request matches the never-do list (default: hand off).
   - A required input is missing (default: ask the requester).
   - The agent is about to do something irreversible (default: hold for approval).
9. **Limits.** Maximum tool calls per run, spend limit, whether it may run on a schedule with nobody present, and how long records are kept.

## Output

Return one JSON object in the spec's machine-readable form (`"spec": "delegation-charter/0.1.1"`), with `"state": "draft"`, followed by a short list of anything still missing. Also offer a plain-language version of the never-do list and the escalation rules that the owner can paste into the agent's instructions, and say clearly that instructions guide the model but do not enforce anything.
