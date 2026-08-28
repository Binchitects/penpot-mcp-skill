# penpot-kit

Bidirectional Penpot **design-to-code** and **code-to-design** for any AI coding agent,
plus the corrected API knowledge that makes working through the Penpot MCP server cheap
and reliable.

penpot-kit wraps the Penpot MCP server — it does not replace it. You still connect your
file with the Penpot MCP browser plugin as usual.

**It is not tied to any one agent harness.** The core is a zero-dependency Node CLI; Claude
Code is one adapter among several.

---

## Install

### Any harness (Cursor, Cline, Codex, OpenHands, Continue, Zed, Copilot, a custom agent, CI…)

```bash
npm i -g penpot-kit          # or use npx penpot-kit
penpot-kit rules --target all   # writes instruction files in each harness's own convention
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

Then start a **new session** — plugins register at session start.

**Requirements:** Node.js >= 18, and the Penpot MCP server with a file connected via the
Penpot MCP browser plugin. Everything else is optional.

---

## How portability works

There is exactly one thing the CLI cannot do: talk to Penpot. Penpot is reached through its
MCP server, which bridges to a browser plugin. So the work is split along that seam:

```
                 needs the live design                runs anywhere
                 ---------------------                -------------
  penpot-kit script extract  ──▶ execute_code  ──▶  .penpot/ir.json
  penpot-kit script audit    ──▶ execute_code                │
  penpot-kit script helpers  ──▶ execute_code                ▼
                                                 penpot-kit emit / drift /
                                                 push-tokens / validate
```

Every harness already knows how to do both halves: run a shell command, and call an MCP
tool. Nothing else is required — no plugin system, no extension API, no SDK.

```bash
penpot-kit script extract     # print the script; your agent passes it to execute_code
penpot-kit emit --ir .penpot/ir.json --out src/design
penpot-kit drift --ir .penpot/ir.json --out src/design   # exit 1 gates CI
penpot-kit docs gotchas       # the full corrected API reference
```

### CLI reference

| Command | Runs | Purpose |
|---|---|---|
| `emit` | locally | Generate CSS vars, DTCG, Tailwind, React from an IR |
| `drift` | locally | Report design/code divergence; **exit 1** when stale |
| `push-tokens` | locally | Plan token changes from code back into the design |
| `plan-icons` | locally | Scan an SVG directory into an import plan |
| `validate` | locally | Validate generated `.tsx` |
| `doctor` | locally | Self-check payload, parsing, SES trap |
| `script <name>` | prints | `helpers`, `extract`, `audit`, `apply-tokens`, `import-icons` |
| `docs <name>` | prints | `gotchas`, `tokens`, `variants`, `api`, `codegen` |
| `rules --target` | locally | Write harness instruction files |

---

## Claude Code commands

Slash-command equivalents of the CLI, for the Claude Code adapter. Every one of these maps
to a `penpot-kit` CLI command that works in any harness.

| Command | What it does |
|---|---|
| `/penpot:inspect` | Compact picture of the connected file — pages with content, components, token sets, active theme |
| `/penpot:sync` | Cache the design system to `.penpot/manifest.json` so future sessions don't re-query |
| `/penpot:audit` | Lint for silent design-system defects |
| `/penpot:tokens` | Inspect, create, or restructure design tokens and themes |
| `/penpot:component` | Build a component, token-bound, with correct variant handling |
| `/penpot:codegen` | Generate CSS variables, DTCG tokens, Tailwind config and React components |
| `/penpot:drift` | Compare design against generated code; exits non-zero when stale |
| `/penpot:push-tokens` | Push token changes from code into Penpot via a reviewable plan |
| `/penpot:import-icons` | Import an SVG icon set from the repo into Penpot as components |

---

## The problem it solves

Designing in Penpot through MCP is expensive by default, and the cost is not the design
work. Measured across one real session:

| Cost | Approx. tokens | Cause |
|---|---|---|
| Mandatory `high_level_overview` | ~6,000 | Re-read every session, unconditionally |
| Raw result dumps | ~6,000 | `getPages()` on 71 pages to answer "which have content?" |
| API discovery round-trips | ~4,000 | Finding out how the API actually behaves |
| Re-deriving file state | recurring | Nothing persists between sessions |

### Measured reduction

Five common questions, naive idiom vs helper, against a real 71-page file
(characters of JSON returned):

| Question | Naive | Helper | Ratio |
|---|---|---|---|
| Which pages have content? | 4,585 | 46 | **100x** |
| Components and variant axes | 956 | 91 | 10x |
| Token set overview | 11,273 | 71 | **159x** |
| Resolved button primary colours | 569 | 200 | 3x |
| Token bindings on a shape | 676 | 331 | 2x |
| **Total** | **18,059** | **739** | **24x** |

Plugin overhead per `claude plugin details`: **~300 tokens always-on**; the `penpot-api`
skill costs ~1.3k only when it fires, against ~6,000 for the bundled overview read
unconditionally every session.

---

## Design to code

```
Penpot ──extract──▶ .penpot/ir.json ──emit──▶ tokens.css / tokens.json / tailwind.cjs / *.tsx
                          │
                          ├──drift──▶ report (never writes)
                          │
code tokens ──plan──▶ .penpot/plan.json ──apply──▶ Penpot
```

Codegen runs in **Node**, never through the model: same IR in, same bytes out. That
determinism is what makes drift detection meaningful — model-written CSS would differ
slightly every run and the drift report would fire constantly on noise.

### Why not Penpot's own generateStyle

`penpot.generateStyle` is an inspection tool. For a button it emits:

```css
.primary-8c8ed4da172a { position: absolute; left: 109px; background: #0f6cbdFF; }
```

Canvas coordinates, hash-suffixed class names, and — fatally — **the token binding is
destroyed**. penpot-kit reads structured properties plus `shape.tokens` instead:

```css
.button--primary { background: var(--button-primary-background-rest); }
```

### Variant axes become the component API

A variant group with `Appearance` x `Size` is already a TypeScript signature:

```tsx
export type ButtonAppearance = "primary" | "secondary" | "outline" | "subtle";
export type ButtonSize = "small" | "medium" | "large";
```

Axes whose values are `Yes/No`, `True/False` or `Off/On` become **boolean** props, not
string unions — `disabled="yes"` is not an API anyone wants to call.

### Multi-part components get named slots

A component with several text nodes exposes each as a slot prop, so callers supply their
own copy rather than inheriting the designer's placeholder:

```tsx
<Input state="error" fieldLabel="Email" helperText="Enter a valid email" />
```

### The token chain survives into CSS

Only the **alias layer** is re-declared per theme. Global and Semantic tokens keep their
authored reference and emit as `var()`:

```css
--button-primary-background-rest: var(--color-brand-background-rest);  /* semantic */
:root[data-theme="dark"] { --color-brand-background-rest: #115EA3; }   /* alias */
```

Semantic tokens therefore re-theme automatically. Proof it works: changing one Global
token produces **one** drift finding, not twenty.

### Grid and flex

Both layout systems are extracted. A grid-based component emits real CSS Grid:

```css
.card { display: grid; grid-template-rows: auto auto auto; grid-template-columns: 1fr; }
```

---

## Code to design

Deliberately **asymmetric**. Tokens round-trip; components do not.

```
node scripts/emit/push-tokens.js --tokens src/design/tokens.json --ir .penpot/ir.json
# review .penpot/plan.json, then apply via /penpot:push-tokens
```

**What is refused, and why:**

- **Components are never pushed.** Code carries behaviour, a11y semantics, event handlers
  and state with no representation in the design. "Syncing back" could only mean
  overwriting. Use `/penpot:drift` to see divergence instead.
- **Alias-layer tokens are skipped.** The same name exists in `Alias/Light` and
  `Alias/Dark` with different values, so a flat token file cannot say which is meant.
- **Nothing is ever deleted.** A token present in the design but absent from code is
  reported, not removed.

### Icons are the exception

Icons *do* round-trip from code into the design — they are pure geometry with no
behaviour. `/penpot:import-icons` reads a directory of SVGs and creates Penpot components,
each tagged with its source path. Files containing `<script>` or remote references are
rejected.

---

## Code connect

Penpot can store arbitrary metadata **on a shape, inside the .penpot file**. penpot-kit
uses that for the design-to-code mapping, so it travels with the design and every teammate
sees it — no repo access required.

```js
storage.pk.connectSet("Button", { path: "src/design/Button.tsx", export: "Button" });
storage.pk.connectAll();   // every mapped shape in the file
```

Generated components carry the link in their header:

```tsx
// Design source: Button / Button  <->  src/design/Button.tsx
```

In-file metadata takes precedence over a repo-side `.penpot/connect.json`, which is still
supported for default prop values:

```json
{ "components": { "Button": { "defaults": { "Size": "Medium" } } } }
```

Without it, defaults fall back to the first value of each axis — usually wrong for a Size
axis, which reads `Small|Medium|Large`.

---

## Safe writes

Every write to a shared design goes through two layers:

- **A named version checkpoint** (`file.saveVersion`) before anything destructive, giving a
  labelled rollback point independent of the undo stack.
- **A single undo block** (`history.undoBlockBegin/Finish`), so a 30-op token push is ONE
  ctrl+Z for whoever else is in the file rather than thirty.

```js
await storage.pk.checkpoint("before token push");
await storage.pk.tx("token push", () => { /* mutations */ });
```

Undo granularity is a correctness issue, not polish. A tool that writes to a shared design
without grouping quietly degrades someone else's ability to back out.

---

## Hardening

`/penpot:audit` turns the documented gotchas into machine-checkable invariants:

| Rule | Severity | Catches |
|---|---|---|
| `token-collision` | ERROR | Same token name in two active sets — they shadow each other |
| `path-collision` | ERROR | A token name that is both a leaf and a prefix |
| `variant-error` | ERROR | Two variants sharing one property combination |
| `stray-variant-prop` | WARN | Auto-generated `Property N` axis left behind |
| `name-hue-mismatch` | WARN | A colour named `teal` whose hue is actually green |
| `duplicate-component` | WARN | Orphaned library entries after detach/recomponentise |
| `hardcoded-fill` | INFO | A visible fill with no token binding |

Two further validators guard the plugin itself:

- `scripts/check-syntax.js` — parses `execute_code` scripts as an async function body
  (`node --check` is wrong for them) **and** rejects the SES import trap below.
- `scripts/emit/validate-output.js` — rejects generated `.tsx` containing invalid
  identifiers, empty interfaces, or unresolved placeholders.

---

## Corrections this plugin carries

The bundled Penpot MCP docs are wrong or silent about all of these. Each was hit in
practice; full annotated list in
`plugins/penpot-kit/skills/penpot-api/references/gotchas.md`.

| Gotcha | Detail |
|---|---|
| `addTheme` signature | Docs say `addTheme(group, name)`. It is **`addTheme({ group, name })`** |
| `applyToken` **toggles** | Applying the same token to the same property twice silently *unbinds* it |
| Token names are a **path tree** | `color.brand.background` blocks `color.brand.background.hover` |
| Inactive sets **lie** | An inactive set reports the *active* set's `resolvedValue` — a single-pass extract yields a silently wrong dark theme |
| Font lookup is **fuzzy** | `findByName("Roboto")` returns *Roboto Mono*; `"Inter"` returns *Inter Tight* |
| **SES import trap** | The sandbox scans raw source; the literal text `import` followed by `(` — even inside a string or comment — rejects the whole script |
| `createComponent` **wraps** | It wraps the shape in a new board, so your original reference becomes a child. Create all shapes first, then componentise, then use `mainInstance()` |
| Stray variant axis | `createVariantContainer` always leaves a `Property N` axis to remove |
| `addRow("flex")` throws | Grid tracks need a value: `addRow("flex", 1)`. A fresh grid starts at **0 rows, 0 columns** |
| Shadow token format | Must be `TokenShadowValueString[]` — an array whose fields are **strings** |
| `remove()` on a main instance | Hides rather than deletes. `detach()` first |
| Permission scopes | `penpot.currentUser` / `activeUsers` need `user:read`, which may not be granted |
| Prototype introspection | API objects are proxies; `getOwnPropertyNames` returns `[]`. Probe with `typeof` |

---

## Scripts reference

Sent to `execute_code` (run inside Penpot):

| Script | Purpose |
|---|---|
| `penpot-helpers.js` | Installs `pk` into `storage` — projections, safe writes, code connect |
| `penpot-extract.js` | Builds the IR, iterating themes for correct per-theme values |
| `penpot-audit.js` | The hardening pass |
| `penpot-apply-tokens.js` | Applies a token push plan, checkpointed and undo-grouped |
| `penpot-import-icons.js` | Imports an SVG icon set as components |

Run in Node (never sent to Penpot):

| Script | Purpose |
|---|---|
| `emit/index.js` | The four emitters — CSS, DTCG, Tailwind, React |
| `emit/react.js` | React/TS emitter (structure-aware: grid, slots, boolean axes, no-text) |
| `emit/drift.js` | Staleness and design-diff reporting |
| `emit/push-tokens.js` | Code-to-design token planner |
| `emit/plan-icons.js` | Scans an SVG directory into an import plan |
| `emit/validate-output.js` | Validates generated `.tsx` |
| `emit/make-fixture.js` | Rebuilds a test IR without a live connection |
| `check-syntax.js` | Validates `execute_code` scripts correctly |

---

## Evals

Six regression cases in `plugins/penpot-kit/evals/`, one per documented failure mode. They
need no live Penpot connection — each asks the model to write code, not execute it.

```
claude plugin eval penpot-kit@penpot-kit --ablation with-without
```

Run with `--ablation`: a case that passes with *and* without the plugin is measuring
general competence, not this skill.

**Not yet executed** — `claude plugin eval` is in early access. See `evals/README.md`.

---

## Licence

MIT
