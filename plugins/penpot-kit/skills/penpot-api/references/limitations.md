# Limitations

What penpot-kit does badly today, stated plainly. Read this before trusting generated
output in a real product.

The pipeline is sound: extraction is faithful, codegen is deterministic, drift detection
works, and the whole thing compiles. The **output quality** is another matter. Generated
components are a starting point that a human must finish, not something to ship.

---

## 1. Repeated structure — FIXED in 3.7.0

A Nav with four rows used to generate `glyph`, `label`, `glyph2`, `label2`, `glyph3`...
That was the worst thing the emitter did: not an API anyone would write, no `key`, no way
to render a fifth row.

It now detects a run of two or more sibling subtrees with the same SHAPE (same names,
same types, recursively) and emits a list:

```tsx
export interface NavItem {
  glyph?: ReactNode;
  label?: ReactNode;
  selected?: boolean;
}

<Nav items={[{ glyph: "*", label: "Dashboard" }, ...]} />
```

The item TYPE is named from the design's own node (`NavItem`, `TablistTab`) and the prop
is its plural (`items`, `tabs`). Defaults come from what the designer actually drew, so
the component renders correctly with no props at all.

**Per-item state comes with it.** A rule like `.nav--selected .nav__item` highlighted
EVERY row. Where an axis difference lands inside a list item it now becomes a per-item
boolean plus an item-scoped class:

```css
.nav__item--selected            { background: var(--color-primary-container); }
.nav__item--selected .nav__label { color: var(--color-primary-base); font-weight: 600; }
```

### What it still does not catch

Detection requires the repeated nodes to be **structurally identical siblings**. A
Breadcrumb drawn as `Item1 / Sep1 / Item2 / Sep2 / Current` has five differently-named
children, so it stays five slots — correctly, since nothing in the file says those are a
list. The design has to express repetition as repetition.

## 2. Fixed pixel widths are baked in

```css
.field { width: 220px; }
.select { width: 220px; }
```

Whatever width the component happened to have on the canvas becomes a hard width in CSS.
That is right for a Switch (52px is the design) and wrong for a Field, which should fill
its container.

The emitter uses Penpot's `horizontalSizing` to decide, but a designer setting a fixed
width on a canvas artboard is not the same statement as "this component is 220px wide
everywhere". There is no signal in the file distinguishing the two.

**Workaround:** set `horizontalSizing: "auto"` on components that should hug, and expect
to strip widths from container-filling components by hand.

## 3. No semantic HTML

Screens generate `<div>` and `<span>`, nothing else. A generated sign-in screen has:

- no `<form>`
- no `<input>` -- the field value is a `<span>`
- no `<label for>`
- no `<nav>`, `<main>`, `<ul>`, `<li>`

Only a component whose NAME ends in "button" gets a `<button>`. Everything else is a div.

This is not a small cosmetic gap. It means generated screens are **not usable as-is**:
they are not keyboard operable, not screen-reader navigable, and not form-submittable.

Penpot has no notion of semantic role, so the information genuinely is not in the design
file. The fix is an explicit mapping -- via `connect` metadata on the shape, naming the
element and role a component should render as.

## 4. No interaction states

Generated CSS has no `:hover`, `:focus-visible`, `:active`, or `:disabled` rules, and no
`aria-*` attributes anywhere.

The design system DOES define hover and pressed colours as tokens
(`button.primary.background.hover`), and they are extracted correctly -- they simply are
not wired to any selector, because a Penpot variant is a static state, not a CSS
pseudo-class. Nothing in the file says "this variant is the hover state".

The convention that would fix it: name interaction variants `Hover` / `Pressed` /
`Focused` on a `State` axis, and have the emitter map those axis values to pseudo-classes
rather than modifier classes.

## 5. Screens mirror the canvas, not the page

Screen markup reproduces the board hierarchy exactly: every Penpot board becomes a div
with the board's name as a class. That is faithful and structurally useless -- a
`.tasks-screen__main` div is not a `<main>`, and grouping that made sense on a canvas
often is not the grouping a page wants.

## 6. Component quality depends entirely on the design

penpot-kit generates what it is given. The design system in this repo's example was built
quickly to exercise the pipeline: several components (Carousel, Tree, Drawer, Toolbar)
are visual stubs with no real interaction design, most have no defined interaction
states, and list-like components hardcode their rows.

Generated code inherits every one of those decisions. **A weak design system produces
weak components, cleanly.** That is worth stating because the output looking polished can
disguise it.

## 7. Styling is global

Class names are BEM-ish (`.field__control`) but plain global CSS. No CSS Modules, no
scoping, no `@layer`. Two design systems in one app will collide.

---

## What IS reliable

To be fair to the parts that work:

- **Token extraction and the CSS variable chain.** Per-theme resolution is correct,
  the Global -> Alias -> Semantic chain survives into CSS, and theme switching works.
- **Determinism.** Same IR in, same bytes out, which is what makes drift detection
  meaningful.
- **Structure fidelity.** The node tree renders faithfully, including nesting and
  per-variant descendant overrides.
- **Typed variant props.** Axis unions and boolean axes are genuinely useful.
- **The linter and audit.** These catch real problems and are worth running on any file.

Use penpot-kit for **tokens and structure extraction**, and treat the component and screen
output as a first draft.
