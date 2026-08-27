---
name: penpot-inspect
description: Compact overview of the connected Penpot file - pages with content, components, token sets, and active theme - without dumping raw objects.
---

Give the user a short, readable picture of the connected Penpot file.

1. Ensure helpers are loaded (`return typeof storage.pk;`, and if not `"object"`, inject
   `${CLAUDE_PLUGIN_ROOT}/scripts/penpot-helpers.js`).

2. Run `return storage.pk.summary();`

3. If the user named a page, board, or component, follow up with
   `return storage.pk.tree("<name>", 3);` for its structure, or
   `return storage.pk.bindings("<name>");` to see which token bindings it carries.

Present the result as a short table or list. Do not paste raw JSON at the user.

Never call `penpotUtils.getPages()` or dump full shape objects to answer this - that is
the exact cost this command exists to avoid.
