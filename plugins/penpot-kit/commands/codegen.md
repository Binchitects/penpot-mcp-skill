---
name: penpot-codegen
description: Generate CSS variables, W3C DTCG tokens, Tailwind config and React components from the connected Penpot design.
---

Generate code from the connected Penpot design.

1. **Extract the IR.** Pass the contents of `${CLAUDE_PLUGIN_ROOT}/scripts/penpot-extract.js`
   to `execute_code`. It activates each theme in turn to collect correct per-theme resolved
   values, then restores the original theme.

   Write the returned JSON to `.penpot/ir.json` (2-space indent, it should diff well).

   If a previous `.penpot/ir.json` exists, copy it to `.penpot/ir.prev.json` first so
   `/penpot:drift` has a baseline.

2. **Emit.** Run:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/emit/index.js" --ir .penpot/ir.json --out <outDir> --targets <targets>
   ```

   Targets: `css`, `dtcg`, `tailwind`, `react` (comma-separated, default all).
   Ask for `<outDir>` if the project has no obvious design directory; `src/design` is a
   reasonable default.

3. **Report** what was written and the byte counts. Do not paste generated files back at
   the user — they are on disk.

Codegen is deterministic Node. Do NOT hand-write or "improve" the output: same IR must
always produce the same bytes, or drift detection becomes meaningless.

Generated files carry a "do not edit by hand" banner. If the user wants different output,
change the emitter, not the artifact.
