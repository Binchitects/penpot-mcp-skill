---
name: penpot-sync
description: Read the connected Penpot file and write a compact design-system manifest to .penpot/manifest.json so future sessions do not re-query it.
---

Refresh the cached Penpot design-system manifest.

Steps:

1. Ensure the helper library is loaded. Run this against the Penpot MCP `execute_code`
   tool: `return typeof storage.pk;`
   If it is not `"object"`, read `${CLAUDE_PLUGIN_ROOT}/scripts/penpot-helpers.js` and
   pass its entire contents to `execute_code` once.

2. Generate the manifest: `return storage.pk.manifest();`

3. Write the returned JSON to `.penpot/manifest.json` in the current project, creating
   the `.penpot/` directory if needed. Pretty-print with 2-space indent so it diffs well
   in git.

4. Report only what changed since the previous manifest, if one existed - added or
   removed pages, components, token sets, and themes. Do not print the whole manifest
   back to the user; it is on disk and they can open it.

If no Penpot file is connected, `execute_code` will fail. In that case tell the user to
connect the file via the Penpot MCP plugin in their browser, and stop.
