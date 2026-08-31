# Limitations

What penpot-kit does badly today, stated plainly. Read this before trusting generated
output in a real product.

The pipeline is sound: extraction is faithful, codegen is deterministic, drift detection
works, and the whole thing compiles. The **output quality** is another matter. Generated
components are a starting point that a human must finish, not something to ship.

---

## 1. Repeated structure becomes numbered props

A Nav with four rows generates:

```tsx
glyph?: ReactNode;  label?: ReactNode;
glyph2?: ReactNode; label2?: ReactNode;
glyph3?: ReactNode; label3?: ReactNode;
glyph4?: ReactNode; label4?: ReactNode;
```

This is the worst thing the emitter does. It is not an API anyone would write. Repetition
in a design means a **list**, and a list should be data:

```tsx
<Nav items={[{ icon: "home", label: "Dashboard", href: "/" }, ...]} />
```

The emitter cannot currently tell "four rows because the designer drew four" from "four
distinct slots". Detecting a repeated subtree (same shape, same child names) and emitting
an `items` prop with a single row component is the correct fix, and it is not implemented.

**Workaround:** treat list-like components as scaffolding. Take the CSS, rewrite the
component by hand.

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
