---
name: penpot-component
description: Create a component in the connected Penpot file, optionally as a variant group, bound to design tokens rather than hardcoded values.
---

Create a component in the connected Penpot file.

Before building, read:
- `${CLAUDE_PLUGIN_ROOT}/skills/penpot-api/references/variants.md` for the variant workflow
- `${CLAUDE_PLUGIN_ROOT}/skills/penpot-api/references/tokens.md` if it needs token bindings

Load helpers (`return typeof storage.pk;`, inject
`${CLAUDE_PLUGIN_ROOT}/scripts/penpot-helpers.js` if needed).

Process:

1. **Check for precedent.** Run `storage.pk.components()` and inspect a comparable
   existing component with `storage.pk.tree(...)`. Match the file's conventions rather
   than inventing new ones. If the file has no components yet, say so - the user is
   establishing conventions, not following them, and that deserves a brief check-in.

2. **Confirm the variant matrix** if more than one axis is plausible. A full
   appearance x size x state matrix explodes combinatorially; interaction states are
   usually better as static documentation specimens than as variant components.

3. **Build main components first**, one board per variant, then group with
   `penpotUtils.createVariantContainer`. Remove the stray auto-created
   `Property N` axis afterwards - see the variants reference.

4. **Bind tokens, do not hardcode colours.** Remember `applyToken` TOGGLES: applying the
   same token to the same property twice unbinds it silently. Verify with
   `storage.pk.bindings("<name>")`.

5. **Verify visually** with `export_shape`, after a ~500ms wait. Exports can render
   stale state immediately after token application; trust `shape.fills[0].fillColor`
   over the image if they disagree.

6. Run `/penpot:sync` to update the manifest.

For an auto-hugging component (width follows its label), use the flex recipe in the
variants reference: `horizontalSizing: "auto"`, `verticalSizing: "fix"`, and a text child
with `growType: "auto-width"`.
