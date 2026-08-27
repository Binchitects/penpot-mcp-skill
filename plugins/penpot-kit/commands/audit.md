---
name: penpot-audit
description: Lint the connected Penpot file for silent design-system defects - token collisions, path violations, theme-fragile hardcoded fills, stray variant axes, and colour tokens whose name disagrees with their hue.
---

Run a hardening pass over the connected Penpot file.

Load helpers if needed (`return typeof storage.pk;`, else inject
`${CLAUDE_PLUGIN_ROOT}/scripts/penpot-helpers.js`), then pass the contents of
`${CLAUDE_PLUGIN_ROOT}/scripts/penpot-audit.js` to `execute_code`.

It checks five invariants, each derived from a failure mode that is invisible in the
Penpot UI:

| Rule | Severity | Catches |
|---|---|---|
| `token-collision` | ERROR | Same token name in two active sets — they shadow each other and report the winner's value |
| `path-collision` | ERROR | A token name that is both a leaf and a prefix |
| `variant-error` | ERROR | Two variants sharing one combination of property values |
| `stray-variant-prop` | WARN | Auto-generated `Property N` axis left by `createVariantFromComponents` |
| `name-hue-mismatch` | WARN | A colour token named `teal` whose hue is actually green |
| `hardcoded-fill` | INFO | A visible fill with no token binding — looks correct until the theme changes |

Report findings grouped by severity. For `hardcoded-fill`, report the count plus a few
examples rather than every instance; on a large file it is usually a long tail, and the
ratio matters more than the list.

Treat INFO findings as advisory. A cover page or a scratch sketch does not need token
bindings; a component does. Say which is which rather than flagging everything equally.
