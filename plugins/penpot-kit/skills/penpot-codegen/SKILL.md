---
name: penpot-codegen
description: Use when moving between Penpot designs and code in either direction - generating CSS variables, W3C DTCG tokens, Tailwind config, React components or app screens from a Penpot design, detecting drift between design and code, pushing token changes from code back into Penpot, or importing an SVG icon set. Also covers the known limitations of generated output.
---

# Penpot design-to-code and code-to-design

Bidirectional, but deliberately asymmetric. Tokens round-trip; components do not.

**Before promising anything about generated components, read
`references/limitations.md`.** The pipeline is sound and the output is a first draft, not
shippable code. Saying otherwise sets the user up to discover it themselves.

## The two halves

Only one thing needs Penpot: reading the design. Everything else is local Node.

```
needs the live design                  runs anywhere
---------------------                  -------------
penpot-kit script helpers  ─┐
penpot-kit script extract   ├─▶ execute_code ─▶ .penpot/ir.json ─┐
penpot-kit script screens   │                   .penpot/screens.json
penpot-kit script audit    ─┘                                    │
                                                                 ▼
                                          penpot-kit lint / emit / screens /
                                          scaffold / drift / validate
```

## Never use generateStyle for codegen

`penpot.generateStyle` is an inspection tool. For a button it emits:

```css
.primary-8c8ed4da172a { position: absolute; left: 109px; background: #0f6cbdFF; }
```

Canvas coordinates, hash-suffixed class names, and — fatally — **the token binding is
destroyed**. Codegen reads structured properties plus `shape.tokens` instead.

## Extraction has traps

**An INACTIVE token set reports the ACTIVE set's `resolvedValue`.** Extracting all themes
in one pass yields a silently wrong dark theme. Activate each theme in turn, collect, then
restore. The shipped extractor does this; never bypass the loop.

**Structure must come from every variant, not one.** A state axis usually restyles
something INSIDE a component — a Field's border lives on its control, a Tablist's
underline on its indicator. Capturing structure from one variant bakes that variant's
appearance onto every descendant.

**Look a variant up by ALL axes, not one.** A Switch with `State=On` has two variants
(`Disabled=No` and `Yes`); matching on one axis returns whichever comes first.

## What the emitters guarantee

- **Determinism.** Same IR in, same bytes out. This is what makes drift detection
  meaningful — model-written CSS would differ every run and drift would fire on noise.
- **The token chain survives.** Only the alias layer is re-declared per theme; Global and
  Semantic keep their `{reference}` and emit as `var()`, so semantic tokens re-theme
  automatically. Changing one Global token produces ONE drift finding, not twenty.
- **Variant axes become the API.** `Appearance × Size` becomes a typed prop signature.
  Axes valued `Yes/No`, `True/False` or `Off/On` become **boolean** props.
- **Structure renders as structure.** Nested boxes become nested divs; a Nav is four rows,
  not eight stacked spans.
- **Per-variant descendant overrides.** Only the properties that differ are emitted:
  `.field--error .field__control { border: ... }`.

## Screens

A component is a DEFINITION; a screen is a USE. Screens live on pages prefixed `App /`
and are extracted separately.

An instance is recorded as **what it is**, not its rendered geometry:

```
{ component: "Button", props: { Appearance: "Primary" } }
  ->  <Button appearance="primary">Sign in</Button>
```

So a screen follows its components automatically. Screens own layout; components own
appearance.

Build screens from real component **instances** in Penpot (`component.instance()`), not
copies. Override copy inside the instance without detaching — the link survives.

## Code to design

Tokens only, via a reviewable plan. What is refused, and why:

- **Components are never pushed.** Code carries behaviour, a11y and state with no
  representation in the design; "syncing back" could only mean overwriting.
- **Alias-layer tokens are skipped.** The same name exists in both theme sets, so a flat
  file cannot say which is meant.
- **Nothing is ever deleted.** Absence in one file is not evidence of intent.
- **Icons are the exception** — pure geometry, no behaviour, so they import cleanly.

## Consistency

`penpot-kit lint` runs offline against the IR and derives its scales from the tokens
themselves. It catches what the audit cannot: off-scale spacing/radius/type, font and
line-height drift, unbound vs off-palette colour, axis naming drift, and
**dangling-token** — a component bound to a token nothing declares, which CSS resolves to
nothing and renders invisible with no error anywhere.

Run it before generating. A design that lints clean generates predictably.

## Verifying output

Generating is not the same as working. Three checks, in order:

1. `penpot-kit validate <outDir>` — rejects invalid identifiers and broken emits.
2. `tsc --noEmit` — catches prop collisions with DOM attributes.
3. **Render it.** `penpot-kit scaffold` builds a gallery that renders every component at
   every axis value. Most defects in this pipeline have been invisible-rendering bugs —
   an empty Badge, a zero-width Switch, a colourless Avatar — that compiled cleanly and
   looked like success.
