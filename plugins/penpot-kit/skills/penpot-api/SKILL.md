---
name: penpot-api
description: Use when working with Penpot designs through the Penpot MCP server - creating or editing components, design tokens, variants, boards, text, or layouts, and when inspecting or auditing a Penpot file. Provides corrected API signatures (several bundled MCP docs are wrong), documented gotchas that fail silently, and compact query patterns that avoid large result dumps.
---

# Penpot API — corrected reference and efficient workflow

Working with Penpot through MCP is expensive by default. The cost is not the design
work — it is re-derivation: re-reading a ~6k-token overview, dumping hundreds of raw
objects to answer small questions, and rediscovering API behaviour that is undocumented
or documented incorrectly.

This skill removes that cost. Follow it in order.

## 1. Session startup

**Do not call `high_level_overview` first.** This skill covers the same ground, corrected
and condensed. Call it only if you hit something genuinely not covered here.

Then, in this order:

1. **If `.penpot/manifest.json` exists in the project, read it.** It describes the file's
   pages, tokens, components, and conventions as of the last `/penpot:sync`. This is
   cheaper than querying Penpot and survives across sessions.
2. **Inject the helper library once**, by passing the contents of
   `${CLAUDE_PLUGIN_ROOT}/scripts/penpot-helpers.js` to `execute_code`. It installs `pk`
   into `storage` and returns a single short string. Every later query is then one line.
3. If the manifest is stale or absent, run `pk.summary()` and regenerate it with
   `/penpot:sync`.

## 2. Query discipline

The single biggest avoidable cost is returning raw objects.

`penpotUtils.getPages()` on a 73-page file returns ~2,500 tokens of names and UUIDs to
answer "which pages have content?". `pk.pages()` answers it in ~40.

Rules:

- **Return projections, never whole shapes.** Map to the two or three fields you need.
- **Never return a shape, page, or token object directly.** They serialise enormously.
- **Filter inside `execute_code`, not in your head.** Send the predicate, not the corpus.
- **Never `console.log` what you also return** — you are charged for both.
- Store intermediate results in `storage`, not in returned output.

Use `pk.*` helpers (see `scripts/penpot-helpers.js`) rather than rewriting these.

## 3. Corrected signatures

The bundled MCP overview contains at least one signature that is simply wrong, and
omits several methods that exist.

| Call | Bundled doc says | Actually |
|---|---|---|
| `tokens.addTheme` | `addTheme(group, name)` | **`addTheme({ group, name })`** — positional args throw `Value not valid` |
| `variants.removeProperty` | not mentioned | **exists**: `removeProperty(pos)` |
| `token.remove()` | not mentioned | **exists** |
| `token.name` | implied read-only | **writable** — assign to rename in place |
| `tokenSet.remove()` | not mentioned | **exists** |

When a call fails with the opaque `[PENPOT PLUGIN] Value not valid. Code: :error`,
suspect an argument-shape mismatch and check `penpot_api_info` for that exact member
before guessing again.

## 4. Gotchas that fail silently

These are the expensive ones — they look like success.

**`applyToken` toggles.** Applying the *same* token to the *same* property a second time
**removes** the binding. There is no error. If you re-apply defensively "to be safe", you
silently unbind it. Read `shape.tokens` to verify state before re-applying.

**Token names are a path tree.** A name cannot be both a leaf and a prefix.
`color.brand.background` blocks `color.brand.background.hover`. Sibling leaves are fine
(`...background.1`, `...background.hover` coexist). Design names as
`namespace.thing.variant` with a terminal segment — use `.rest` rather than a bare name.

**Font lookup is fuzzy and wrong.** `penpot.fonts.findByName("Roboto")` returns
**Roboto Mono**; `"Inter"` returns **Inter Tight**; `"Noto Sans"` returns
**Noto Sans Ogham**. Always match exactly against `penpot.fonts.all`. Segoe UI is not
available in Penpot — Inter is the closest substitute with a true 600 weight.

**Width and height are read-only.** Use `resize(w, h)`. `resize` on a `Text` also forces
`growType` to `"fixed"` — set it back to `"auto-width"` afterwards if you want hugging.

**`layoutChild.minWidth` does not constrain an auto-width text.** There is no reliable
way to enforce a component min-width whose content is an auto-width text child. Buttons
will hug below their spec minimum. Accept it or use a fixed-width wrapper.

**Fills and strokes arrays are immutable in place.** Replace the whole array;
mutating `shape.fills[0].fillColor` does nothing.

**Exports can lag behind token changes.** After applying tokens, wait ~500ms before
`export_shape`, and trust `shape.fills[0].fillColor` over a stale render.

**Token application is asynchronous.** Sleep ~100-500ms before reading back resolved
values or exporting.

**You can only modify the CURRENT page.** Reads work across pages; writes throw
`Cannot modify a page that is not the current page`. A loop that reads every page and
writes to each will read fine and fail every write.

**`penpot.openPage` is asynchronous.** `penpot.currentPage` is still the OLD page
immediately after the call, so shapes created without waiting land on the wrong page and
cleanup code reads the wrong children. Await ~400-500ms.

**`createComponent` wraps its shape in a new board.** Your original reference becomes a
CHILD. Create every shape first, componentise in a second pass, and pass
`component.mainInstance()` to `createVariantContainer` -- passing the original fails with
an opaque `[object ShapeProxy]` error.

## 5. Reference files

Read these only when the task calls for them:

- `references/tokens.md` — three-layer token architecture, themes, the activation trap
- `references/variants.md` — creating variant components correctly
- `references/gotchas.md` — the full annotated list with reproduction notes
- `references/limitations.md` — what generated output does BADLY. Read before telling
  anyone the components are ready to ship; they are a first draft.

## 6. Working conventions

- Prefer `penpotUtils` helpers over hand-rolled tree walks.
- Add flex layout to a container that already has children with
  `penpotUtils.addFlexLayout(container, dir)`, **not** `board.addFlexLayout()` — the
  latter reorders existing children arbitrarily.
- Add background shapes before foreground ones; z-order follows `children` order.
- Colour hex strings must be uppercase (`#FF5533`).
- After any structural change worth remembering, re-run `/penpot:sync` so the manifest
  stays true.
