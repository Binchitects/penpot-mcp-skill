---
name: penpot-import-icons
description: Import an SVG icon set from the repository into the connected Penpot file as components.
---

Import icons from code into the design. Icons are the one component-shaped thing that
round-trips losslessly: pure geometry, no behaviour, no state, no a11y semantics.

1. **Plan.** Run:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/emit/plan-icons.js" --dir <svgDir> --out .penpot/icons.json --page Icon
   ```

   The planner rejects any file that does not start with `<svg`, contains `<script>`, or
   references a remote asset. Report what it skipped and why.

2. **Confirm with the user before importing.** This writes to their design.

3. **Apply.** Ensure helpers are loaded, set the plan, then run the importer:

   ```js
   storage.iconPlan = <contents of .penpot/icons.json>;
   return storage.iconPlan.icons.length;
   ```

   Then pass `${CLAUDE_PLUGIN_ROOT}/scripts/penpot-import-icons.js` to `execute_code`.

4. Run `/penpot:sync` afterwards.

## Notes

The target page must already exist; the importer will not create pages.

Each icon is tagged with its source path via plugin data, so the design records that its
source of truth is the repo.

The importer creates every shape FIRST and componentises afterwards. `createComponent`
wraps its shape in a new board, so interleaving the two nests the whole icon set inside
the first component — a failure that looks like "only one icon imported".

Writes are wrapped in a version checkpoint and a single undo block.
