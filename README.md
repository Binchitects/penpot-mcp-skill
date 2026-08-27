# penpot-kit

Bidirectional Penpot design-to-code and code-to-design for Claude Code, plus the corrected
API knowledge that makes working through the Penpot MCP server cheap and reliable.

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

**Commands** — `/penpot:sync`, `/penpot:inspect`, `/penpot:tokens`, `/penpot:component`,
`/penpot:audit`.

**`scripts/penpot-audit.js`** — a hardening pass that turns the gotchas into machine-checkable
invariants: token collisions, leaf-as-prefix violations, stray variant axes, variant errors,
theme-fragile hardcoded fills, and colour tokens whose name disagrees with their hue.

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
/penpot:audit        # lint for silent design-system defects
```

Commit `.penpot/manifest.json` to your repo. That is the persistence.

## Design to code, code to design

```
Penpot ──extract──▶ .penpot/ir.json ──emit──▶ css / dtcg / tailwind / tsx
                          │
                          ├──drift──▶ report (never writes)
                          │
code tokens ──plan──▶ .penpot/plan.json ──apply──▶ Penpot
```

Codegen runs in **Node**, never through the model: same IR in, same bytes out.

### Why not Penpot's own generateStyle

`penpot.generateStyle` is an inspection tool. For a button it emits:

```css
.primary-8c8ed4da172a { position: absolute; left: 109px; background: #0f6cbdFF; }
```

Canvas coordinates, hash-suffixed class names, and — fatally — **the token binding is
destroyed**. penpot-kit reads structured properties plus `shape.tokens` instead, and emits:

```css
.button--primary { background: var(--button-primary-background-rest); }
```

### Variant axes become the component API

A variant group with `Appearance` x `Size` is already a TypeScript signature:

```tsx
export type ButtonAppearance = "primary" | "secondary" | "outline" | "subtle";
export type ButtonSize = "small" | "medium" | "large";
```

### The token chain survives into CSS

Only the alias layer is re-declared per theme. Semantic tokens keep their reference, so
they re-theme automatically and a rebrand stays a one-token edit:

```css
--button-primary-background-rest: var(--color-brand-background-rest);  /* semantic */
:root[data-theme="dark"] { --color-brand-background-rest: #115EA3; }   /* alias */
```

### Asymmetric on purpose

Tokens round-trip. Components do not — code carries behaviour, a11y and state with no
representation in the design, so components are reported as drift and never overwritten
from code. Alias-layer tokens are also refused on push, because the same name exists in
both theme sets and a flat file cannot say which is meant.

## Measured

Against a real 71-page file, five common questions asked the naive way vs through the
helpers (characters of JSON returned):

| Question | Naive | Helper | Ratio |
|---|---|---|---|
| Which pages have content? | 4,585 | 46 | 100x |
| Components and their variant axes | 956 | 91 | 10x |
| Token set overview | 11,273 | 71 | 159x |
| Resolved button primary colours | 569 | 200 | 3x |
| Token bindings on a shape | 676 | 331 | 2x |
| **Total** | **18,059** | **739** | **24x** |

Plugin overhead, per `claude plugin details`: **~245 tokens always-on**, with the
`penpot-api` skill costing ~1.3k only when it actually fires — against ~6,000 for the
bundled overview read unconditionally every session.

## Evals

Six regression cases live in `plugins/penpot-kit/evals/`, one per documented failure mode.
They require no live Penpot connection — each asks the model to write code, not execute it.

```
claude plugin eval penpot-kit@penpot-kit --ablation with-without
```

Not yet executed: `claude plugin eval` is in early access. See `evals/README.md`.

## Requirements

- Claude Code
- The Penpot MCP server, with a file connected via the Penpot MCP plugin

## Licence

MIT
