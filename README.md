# penpot-kit

Token-efficient, persistent Penpot design workflows for Claude Code.

This plugin wraps the [Penpot MCP server](https://penpot.app) — it does **not** replace or
re-implement it. You still connect your file with the Penpot MCP plugin as usual. What
this adds is the knowledge and caching layer that stops every session paying to
rediscover the same things.

## The problem

Designing in Penpot through MCP is expensive by default, and the cost is not the design
work. Measured across a single real session (building one Fluent-style button component
with a design-token foundation):

| Cost | Approx. tokens | Cause |
|---|---|---|
| Mandatory `high_level_overview` | ~6,000 | Re-read every session, unconditionally |
| Raw result dumps | ~6,000 | `getPages()` on 73 pages to answer "which have content?" |
| API discovery round-trips | ~4,000 | Finding out how the API actually behaves |
| Re-deriving file state | recurring | Nothing persists between sessions |

The third row is the worst, because it is spent rediscovering things that are **stably
true** and either undocumented or documented **incorrectly**.

## What it ships

**`penpot-api` skill** — a condensed, corrected replacement for the bundled overview,
including signatures the official docs get wrong and behaviours that fail silently.

**`scripts/penpot-helpers.js`** — a helper library injected into the Penpot plugin context
**once per session** and cached in `storage`. Every helper returns a projection, never a
raw object. `pk.pages()` answers "which pages have content?" in ~40 tokens instead of
~2,500.

**`.penpot/manifest.json`** — a cached description of your design system, written into
your repo by `/penpot:sync`. Survives sessions, diffs in git, read instead of re-queried.

**Commands** — `/penpot:sync`, `/penpot:inspect`, `/penpot:tokens`, `/penpot:component`.

**A deliberately quiet hook** — `SessionStart` emits *one line* if a manifest exists, and
nothing at all otherwise. Injecting the manifest on every session would recreate the
problem in a new place.

## Corrections it carries

The bundled Penpot MCP docs are wrong or silent about these. Each was hit in practice:

- `addTheme(group, name)` is **wrong** — it is `addTheme({ group, name })`
- `applyToken` **toggles**: applying the same token to the same property twice silently
  *unbinds* it
- Token names form a **path tree** — `color.brand.background` blocks
  `color.brand.background.hover`
- `penpot.fonts.findByName` is **fuzzy**: `"Roboto"` returns *Roboto Mono*, `"Inter"`
  returns *Inter Tight*
- Two active alias token sets **collide silently**, reporting each other's resolved values
- `createVariantContainer` leaves a stray `Property N` axis you must `removeProperty`
- `token.name` is writable; `token.remove()` and `variants.removeProperty()` exist but
  are undocumented

Full annotated list with reproduction notes:
`plugins/penpot-kit/skills/penpot-api/references/gotchas.md`

## Install

```
/plugin marketplace add Binchitects/penpot-mcp-skill
/plugin install penpot-kit@penpot-kit
```

## Use

Connect your Penpot file with the Penpot MCP plugin, then:

```
/penpot:inspect      # compact picture of the file
/penpot:sync         # cache the design system to .penpot/manifest.json
/penpot:component    # build a component, token-bound, with variant handling
/penpot:tokens       # inspect or extend the token layers
```

Commit `.penpot/manifest.json` to your repo. That is the persistence.

## Requirements

- Claude Code
- The Penpot MCP server, with a file connected via the Penpot MCP plugin

## Licence

MIT
