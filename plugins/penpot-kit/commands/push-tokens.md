---
name: penpot-push-tokens
description: Push design token changes from code back into the connected Penpot file, via an explicit reviewable plan.
---

Push token changes from code into Penpot. Tokens only — components are never pushed.

1. **Plan.** Run:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/emit/push-tokens.js" --tokens <tokens.json> --ir .penpot/ir.json --out .penpot/plan.json
   ```

   `<tokens.json>` is a W3C DTCG file, normally the one `/penpot:codegen` emitted.

2. **Show the plan to the user and get confirmation before applying.** This writes to
   their design. Summarise adds and updates; do not apply silently.

3. **Apply.** First set the plan in the plugin context:

   ```js
   storage.plan = <contents of .penpot/plan.json>;
   return storage.plan.summary;
   ```

   Then pass `${CLAUDE_PLUGIN_ROOT}/scripts/penpot-apply-tokens.js` to `execute_code`.

4. Run `/penpot:sync` afterwards so the manifest and IR reflect the new state.

## What is refused, and why

**Alias-layer tokens are skipped.** The same name exists in both `Alias/Light` and
`Alias/Dark` with different values, so a single flat token file cannot express which set
is meant. The planner refuses rather than guessing. Edit those in Penpot, or split the
token file per theme.

**Nothing is ever deleted.** A token present in the design but absent from code is
reported, not removed. Absence in one file is not evidence of intent.

**Components are not pushed.** Use `/penpot:drift` to see how they diverge.
