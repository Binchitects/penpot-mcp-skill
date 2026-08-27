---
name: penpot-codegen
description: Use when moving between Penpot designs and code in either direction - generating CSS variables, W3C DTCG tokens, Tailwind config or React components from a Penpot design, detecting drift between design and code, or pushing token changes from code back into Penpot.
---

# Penpot design-to-code and code-to-design

Bidirectional, but deliberately asymmetric. Tokens round-trip; components do not.

## Never use generateStyle for code generation

`penpot.generateStyle` and `penpot.generateMarkup` are INSPECTION tools. Their output is
unusable as production code:

- `position: absolute; left: 109px` — the shape's canvas coordinates
- `.primary-8c8ed4da172a` — hash-suffixed class names that change when a shape is recreated
- `background: #0f6cbdFF` — **the token binding is destroyed**
- `<div class="frame">` — Penpot's internal rich-text DOM, never a `<button>`

Codegen reads STRUCTURED properties plus `shape.tokens`, and emits code that references
tokens. That difference is the entire value.

## Pipeline

```
Penpot ──extract──▶ .penpot/ir.json ──emit──▶ css / dtcg / tailwind / tsx
                          │
                          ├──drift──▶ report (never writes)
                          │
code tokens ──plan──▶ .penpot/plan.json ──apply──▶ Penpot
```

Codegen runs in **Node**, not through the model. Same IR in, same bytes out. Generating
code by having the model write it costs tokens on every regeneration and drifts run to run.

## Extraction has a trap you must respect

An INACTIVE token set reports the ACTIVE set's `resolvedValue`. Extracting all themes in
one pass therefore produces a silently WRONG dark theme — plausible-looking CSS that is
simply incorrect.

`scripts/penpot-extract.js` handles this by activating each theme in turn, collecting
resolved values per theme, then restoring the original. Never bypass that loop.

## Layering in generated CSS

Only the **alias layer** is re-declared per theme. Global and Semantic tokens keep their
authored `{reference}` and emit as `var()`:

```css
--button-primary-background-rest: var(--color-brand-background-rest);   /* semantic: chain kept */
:root[data-theme="dark"] { --color-brand-background-rest: #115EA3; }    /* alias: switch point */
```

Semantic tokens therefore re-theme automatically. Flattening them to hex would work
visually and destroy the architecture — a rebrand would stop being a one-token edit.

## Variant axes are the component API

A variant group with `Appearance` x `Size` is already a TypeScript signature. The emitter
turns axes into prop unions directly; no inference required.

Default prop values come from `.penpot/connect.json` if present, else the first value of
each axis. The first value is often wrong (a `Size` axis usually wants Medium, not Small) —
set defaults explicitly in `connect.json`.

## Commands

- `/penpot:codegen` — extract IR, emit code
- `/penpot:drift` — compare design against generated code; exits non-zero when stale
- `/penpot:push-tokens` — plan and apply token changes from code into Penpot

## What does not round-trip

Components are reported as drift, never pushed from code. Code carries behaviour, a11y
semantics, event handlers and state with no representation in the design; "syncing back"
could only ever mean overwriting. Say so plainly rather than implying full symmetry.

Alias-layer tokens are also refused on push: the same name exists in both Light and Dark
sets, so a single flat token file cannot say which is meant. Edit those in Penpot, or
split the token file per theme.
