---
name: penpot-tokens
description: Inspect, create, or audit Penpot design tokens and themes, following the Global to Alias to Semantic layering.
---

Work with the connected file's design tokens.

Load helpers first (`return typeof storage.pk;`, inject
`${CLAUDE_PLUGIN_ROOT}/scripts/penpot-helpers.js` if needed).

Read `${CLAUDE_PLUGIN_ROOT}/skills/penpot-api/references/tokens.md` before creating or
restructuring tokens. It documents the two failure modes that are otherwise invisible:

- Token names form a PATH TREE. A leaf cannot also be a prefix, so
  `color.brand.background` blocks `color.brand.background.hover`. Give state-bearing
  tokens a terminal segment (`.rest`).
- Two alias sets active at once COLLIDE SILENTLY, and the losing set reports the winner's
  resolved values. Use mutually exclusive themes in one group.

Common operations:

- List everything: `return storage.pk.tokens();`
- Resolved values, filtered: `return storage.pk.tokenValues("^color\.brand");`
- Themes: `return storage.pk.themes();`
- Switch theme: `return storage.pk.setTheme("Dark");`
- Add idempotently: `return storage.pk.addToken("Global", "color", "brand-80", "#0F6CBD");`

When auditing, verify a shape actually carries bindings with
`storage.pk.bindings("<shape name>")` rather than trusting that its colour looks right -
a shape with a hardcoded fill and a correctly bound one are visually identical until the
theme changes.

After any structural token change, run `/penpot:sync` to refresh the manifest.
