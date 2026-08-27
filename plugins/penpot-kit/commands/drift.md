---
name: penpot-drift
description: Compare the Penpot design against generated code and report divergence without writing anything.
---

Report drift between the connected Penpot design and the generated code on disk.

1. Extract a fresh IR (see `/penpot:codegen` step 1) to a temporary path, or reuse
   `.penpot/ir.json` if it was synced in this session.

2. Run:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/emit/drift.js" --ir .penpot/ir.json --out <outDir> --baseline .penpot/ir.prev.json
   ```

It reports two independent things:

- **Staleness** — does the generated code match what the current design implies? Exits
  non-zero when stale, so it can gate CI.
- **Design diff** — what changed in the design since the last recorded baseline.

This command NEVER writes. That is deliberate: an automatic sync in either direction
destroys real work silently, in whichever direction nobody was looking.

When reporting, distinguish the two clearly. "Code is stale, regenerate" is a different
situation from "someone changed the design's brand colour" — even though a single token
edit produces both.

If drift is large, check whether the token CHAIN broke rather than listing every symptom.
One changed Global token should produce ONE finding; if it produces twenty, some semantic
token has been flattened to a literal somewhere and lost its reference.
