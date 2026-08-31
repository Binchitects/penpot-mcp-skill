# penpot-kit

Penpot **design-to-code** and **code-to-design** for any AI coding agent, plus the
corrected API knowledge that makes working through the Penpot MCP server cheap and
reliable.

penpot-kit wraps the Penpot MCP server — it does not replace it. You still connect your
file with the Penpot MCP browser plugin as usual.

**Not tied to any one agent harness.** The core is a zero-dependency Node CLI; Claude Code
is one adapter among several.

> **Read [`Limitations`](#limitations) before shipping generated components.** Token and
> structure extraction are reliable. Generated components and screens are a **first
> draft** — they compile and render, but they use numbered props for repeated structure,
> bake in fixed widths, emit no semantic HTML, and have no interaction states.

---

## Install

### Any harness (Cursor, Cline, Codex, OpenHands, Continue, Zed, Copilot, CI…)

```bash
npm i -g github:Binchitects/penpot-mcp-skill
```

Per-project, or with no install at all:

```bash
npm i -D github:Binchitects/penpot-mcp-skill
npx github:Binchitects/penpot-mcp-skill doctor
```

Then set up your harness and verify:

```bash
penpot-kit rules --target all   # instruction files in each harness's own convention
penpot-kit doctor               # self-check
```

`rules` appends to existing files rather than clobbering them, and is idempotent.

| Harness | File written |
|---|---|
| Codex, Amp, Jules, OpenHands | `AGENTS.md` |
| Cursor | `.cursor/rules/penpot-kit.mdc` |
| Cline / Roo Code | `.clinerules` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Windsurf | `.windsurfrules` |
| Zed | `.rules` |

### Claude Code

```
/plugin marketplace add Binchitects/penpot-mcp-skill
/plugin install penpot-kit@penpot-kit
```

Start a **new session** afterwards — plugins register at session start.

**Requirements:** Node >= 18, and the Penpot MCP server with a file connected via the
Penpot MCP browser plugin. Zero npm dependencies.

---

## How portability works

Exactly one thing needs Penpot: reading the design. Everything else is local Node.

```
        needs the live design                         runs anywhere
        ---------------------                         -------------
  penpot-kit script helpers  ─┐
  penpot-kit script extract   ├─▶ execute_code ─▶ .penpot/ir.json ─┐
  penpot-kit script screens   │                   .penpot/screens.json
  penpot-kit script audit    ─┘                                    │
                                                                   ▼
                                     lint · emit · screens · scaffold · drift · validate
```

Every harness already knows how to run a shell command and call an MCP tool. Nothing else
is required — no plugin system, no extension API, no SDK.

---

## CLI reference

| Command | Runs | Purpose |
|---|---|---|
| `emit --ir --out [--targets] [--connect]` | local | CSS vars, W3C DTCG, Tailwind, React+TS |
| `screens --screens --ir --out [--components]` | local | React pages from extracted screens |
| `scaffold --ir --out [--screens] [--name]` | local | Buildable Vite app + component gallery |
| `lint --ir [--config] [--max-warnings]` | local | Design-system **consistency** check |
| `drift --ir --out [--baseline] [--json]` | local | Design/code divergence; **exit 1** when stale |
| `push-tokens --tokens --ir [--out]` | local | Plan token changes back into the design |
| `plan-icons --dir [--out] [--page]` | local | Scan an SVG directory into an import plan |
| `validate <outDir>` | local | Validate generated `.tsx` |
| `fixture` | local | Emit a test IR with no Penpot connection |
| `doctor` | local | Self-check payload, parsing, SES trap |
| `script <name>` | prints | `helpers`, `extract`, `screens`, `audit`, `apply-tokens`, `import-icons` |
| `docs <name>` | prints | `gotchas`, `limitations`, `tokens`, `variants`, `api`, `codegen` |
| `rules --target <t> [--out]` | local | Harness instruction files |

### Typical run

```bash
penpot-kit script helpers   # paste into execute_code, once per session
penpot-kit script extract   # paste; save the result to .penpot/ir.json
penpot-kit lint    --ir .penpot/ir.json
penpot-kit emit    --ir .penpot/ir.json --out src/design
penpot-kit validate src/design
penpot-kit drift   --ir .penpot/ir.json --out src/design   # exit 1 gates CI
```

### Claude Code slash commands

Every one maps to a CLI command that works in any harness:
`/penpot:inspect` · `/penpot:sync` · `/penpot:audit` · `/penpot:tokens` ·
`/penpot:component` · `/penpot:codegen` · `/penpot:drift` · `/penpot:push-tokens` ·
`/penpot:import-icons`

---

## The problem it solves

Designing through MCP is expensive by default, and the cost is not the design work.
Measured on a real 71-page file — five common questions, naive idiom vs helper
(characters of JSON returned):

| Question | Naive | Helper | Ratio |
|---|---|---|---|
| Which pages have content? | 4,585 | 46 | **100×** |
| Components and variant axes | 956 | 91 | 10× |
| Token set overview | 11,273 | 71 | **159×** |
| Resolved button primary colours | 569 | 200 | 3× |
| Token bindings on a shape | 676 | 331 | 2× |
| **Total** | **18,059** | **739** | **24×** |

Structural queries compress hardest; queries that genuinely need per-item data only
compress 2–3×, which is the honest ceiling.

Plugin overhead: **~300 tokens always-on**, against ~6,000 for the bundled overview read
unconditionally every session.

---

## Design to code

### Why not Penpot's own generateStyle

It is an inspection tool. For a button it emits:

```css
.primary-8c8ed4da172a { position: absolute; left: 109px; background: #0f6cbdFF; }
```

Canvas coordinates, hash-suffixed class names, and — fatally — **the token binding is
destroyed**. penpot-kit reads structured properties plus `shape.tokens`:

```css
.button--primary { background: var(--button-primary-background-rest); }
```

### Variant axes become the component API

```tsx
export type ButtonAppearance = "primary" | "secondary" | "outline" | "subtle";
export type ButtonSize = "small" | "medium" | "large";
```

Axes valued `Yes/No`, `True/False` or `Off/On` become **boolean** props.

### The token chain survives into CSS

Only the alias layer is re-declared per theme; Global and Semantic keep their reference:

```css
--button-primary-background-rest: var(--color-brand-background-rest);  /* semantic */
:root[data-theme="dark"] { --color-brand-background-rest: #115EA3; }   /* alias */
```

Semantic tokens therefore re-theme automatically. Changing one Global token produces
**one** drift finding, not twenty.

### Structure renders as structure

Nested boxes become nested divs, so a Nav is four rows rather than eight stacked spans,
and a Field keeps the bordered control its value sits in. Per-variant differences are
emitted **scoped to the descendant that actually changed**:

```css
.field__control                { border: var(--stroke-thin)  solid var(--color-outline-base); }
.field--error   .field__control { border: var(--stroke-thick) solid var(--color-error-base); }
```

### Screens

A component is a DEFINITION; a screen is a USE. Screens live on pages prefixed `App /`.
An instance is recorded as **what it is**, not its geometry:

```
{ component: "Button", props: { Appearance: "Primary" } }
  ->  <Button appearance="primary">Sign in</Button>
```

So screens follow their components automatically. Build them from real component
instances in Penpot, not copies; override copy inside the instance without detaching.

---

## Code to design

Tokens only, through a reviewable plan.

```bash
penpot-kit push-tokens --tokens src/design/tokens.json --ir .penpot/ir.json
# review .penpot/plan.json, then apply
```

**What is refused, and why:**

- **Components are never pushed.** Code carries behaviour, a11y and state with no
  representation in the design; "syncing back" could only mean overwriting.
- **Alias-layer tokens are skipped.** The same name exists in `Alias/Light` and
  `Alias/Dark`, so a flat file cannot say which is meant.
- **Nothing is ever deleted.** Absence in one file is not evidence of intent.

**Icons are the exception** — pure geometry, no behaviour. `plan-icons` scans an SVG
directory and rejects anything with `<script>` or a remote reference; the importer tags
each icon with its source path.

---

## Consistency

`penpot-kit lint` derives its scales from your tokens, so it adapts to any system.

| Rule | Catches |
|---|---|
| `dangling-token` | Bound to a token nothing declares — CSS resolves it to nothing and the element renders **invisible**, with no error anywhere |
| `off-scale-*` | spacing, radius, stroke, font-size, font-weight off the scale |
| `font-family-drift` / `line-height-drift` | One component quietly using something else |
| `unbound-color` / `off-palette-color` | A literal that matches a token but is not bound, vs one that is not in the palette at all |
| `axis-naming` / `axis-vocabulary` | `State` vs `state`, uncapitalised values |
| `no-layout` | Multiple text nodes with no layout system |

## Hardening

`/penpot:audit` (or `script audit`) turns the documented gotchas into machine-checkable
invariants: token collisions, leaf-as-prefix path violations, variant errors, stray
`Property N` axes, duplicate component names, theme-fragile hardcoded fills, and colour
tokens whose name disagrees with their hue.

Two validators guard the plugin itself:

- `check-syntax.js` — parses `execute_code` scripts as an async function body (`node
  --check` is wrong for them) **and** rejects the SES import trap.
- `emit/validate-output.js` — rejects generated `.tsx` with invalid identifiers, empty
  interfaces, or unresolved placeholders.

---

## Corrections this plugin carries

The bundled Penpot MCP docs are wrong or silent about all of these. Each was hit in
practice. Full annotated list: `penpot-kit docs gotchas` (22 entries).

| Gotcha | Detail |
|---|---|
| `addTheme` signature | Docs say `addTheme(group, name)`. It is **`addTheme({ group, name })`** |
| `applyToken` **toggles** | Applying the same token to the same property twice silently *unbinds* it |
| Token names are a **path tree** | `color.brand.background` blocks `color.brand.background.hover` |
| Inactive sets **lie** | They report the *active* set's `resolvedValue` — a single-pass extract yields a silently wrong dark theme |
| Font lookup is **fuzzy** | `findByName("Roboto")` returns *Roboto Mono* |
| **SES import trap** | The literal text `import` followed by `(` — even in a string or comment — rejects the whole script |
| `createComponent` **wraps** | Your reference becomes a child. Create all shapes, then componentise, then use `mainInstance()` |
| `openPage` is **async** | And you may only modify the **current** page. Reads work everywhere; writes throw |
| Grid starts **empty** | 0 rows, 0 columns; `addRow("flex")` throws without a value |
| Shadow tokens | Must be `TokenShadowValueString[]` with **string** fields |
| `remove()` on a main instance | Hides rather than deletes; `detach()` first |
| Component names are **not unique** | Web and Android both have `Avatar`; codegen must disambiguate |

---

## Limitations

Stated in full in `penpot-kit docs limitations`. The short version:

| Problem | Reality |
|---|---|
| **Numbered props** | A four-row Nav generates `glyph4?: ReactNode`. Repetition means a **list**; it should emit an `items` prop. Not implemented. |
| **Fixed widths** | `width: 220px` baked into Field and Select from the canvas artboard. |
| **No semantic HTML** | Screens are all `<div>`/`<span>`. No `<form>`, `<input>`, `<label>`, `<nav>`, `<ul>`. Only names ending in "button" get a `<button>`. |
| **No interaction states** | No `:hover`, `:focus-visible`, `:active`, no `aria-*`. Hover/pressed colours ARE extracted as tokens but nothing wires them to a selector. |
| **Screens mirror the canvas** | Board hierarchy becomes div hierarchy — faithful, structurally useless. |
| **Global CSS** | BEM-ish names, but no modules or scoping. |
| **Output inherits the design** | A weak design system produces weak components, cleanly. Polished-looking output can disguise that. |

**What IS reliable:** token extraction and the CSS variable chain, determinism, structure
fidelity including per-variant descendant overrides, typed variant props, and the
lint/audit checks.

Use penpot-kit for **tokens and structure**. Treat component and screen output as a first
draft a human finishes.

---

## Scripts reference

Sent to `execute_code` (run inside Penpot):

| Script | Purpose |
|---|---|
| `penpot-helpers.js` | Installs `pk` into `storage` — projections, safe writes, code connect |
| `penpot-extract.js` | Builds the IR, iterating themes for correct per-theme values |
| `penpot-screens.js` | Extracts app screens as component instances |
| `penpot-audit.js` | The hardening pass |
| `penpot-apply-tokens.js` | Applies a token plan, checkpointed and undo-grouped |
| `penpot-import-icons.js` | Imports an SVG icon set as components |

Run in Node (never sent to Penpot):

| Script | Purpose |
|---|---|
| `emit/index.js` | CSS vars, DTCG, Tailwind, React |
| `emit/react.js` | React/TS emitter — structure, slots, boolean axes, descendant overrides |
| `emit/screens.js` | Screens to routed React pages |
| `emit/lint.js` | Consistency linter |
| `emit/drift.js` | Staleness and design-diff reporting |
| `emit/scaffold.js` | Vite app + gallery |
| `emit/push-tokens.js` | Code-to-design token planner |
| `emit/plan-icons.js` | SVG directory scanner |
| `emit/validate-output.js` | Generated `.tsx` validator |
| `check-syntax.js` | Validates `execute_code` scripts correctly |

## Safe writes

Every write to a shared design goes through a **named version checkpoint**
(`file.saveVersion`) and a **single undo block** — so a 30-op token push is one ctrl+Z for
whoever else is in the file, not thirty.

```js
await storage.pk.checkpoint("before token push");
await storage.pk.tx("token push", () => { /* mutations */ });
```

## Code connect

Penpot stores metadata **on a shape, inside the .penpot file**, so the design-to-code
mapping travels with the design and needs no repo access:

```js
storage.pk.connectSet("Button", { name: "Button", path: "src/design/Button.tsx" });
```

In-file metadata takes precedence over a repo-side `.penpot/connect.json`, which still
supplies default prop values.

## Evals

Six regression cases in `plugins/penpot-kit/evals/`, one per documented failure mode. They
need no live connection.

```bash
claude plugin eval penpot-kit@penpot-kit --ablation with-without
```

**Not yet executed** — `claude plugin eval` is in early access. See `evals/README.md`.

## Licence

MIT
