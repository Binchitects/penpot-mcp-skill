# Variant components

## Preferred path

Build main components first, then group them:

```js
const lib = penpot.library.local;
const comps = boards.map(b => lib.createComponent([b]));

const container = penpotUtils.createVariantContainer([
  { shape: comps[0].mainInstance(), properties: { Appearance: "Primary",   Size: "Small"  } },
  { shape: comps[1].mainInstance(), properties: { Appearance: "Secondary", Size: "Medium" } },
]);
```

## Remove the stray property

`createVariantContainer` is built on `createVariantFromComponents`, which ALWAYS creates
one property called `Property 1`. After setting your own axes you are left with a
spurious extra axis (e.g. `Property 3` with `Value 1` on every component).

Always clean up:

```js
const v = container.variants;
const i = v.properties.findIndex(p => /^Property \d+$/.test(p));
if (i >= 0) v.removeProperty(i);
```

Then verify:

```js
v.properties.map(p => ({ p, values: v.currentValues(p) }));
v.variantComponents().map(c => c.variantError).filter(Boolean);  // must be empty
```

## Naming

`component.name = "Button / Primary / Small"` is interpreted as a PATH: Penpot groups on
`/` and `component.name` returns only the leaf (`"Small"`). Expected, not a bug.

## Counting

After grouping, `penpot.library.local.components.length` counts a whole variant group as
ONE component, not twelve. Do not read a drop in that number as lost work.

## Auto-hugging component recipe

A component whose width follows its label:

```js
const b = penpot.createBoard();
b.resize(96, 32);
const f = b.addFlexLayout();
f.dir = "row"; f.alignItems = "center"; f.justifyContent = "center";
f.horizontalPadding = 12; f.verticalPadding = 0;
f.horizontalSizing = "auto";   // hug content
f.verticalSizing = "fix";      // hold height

const t = penpot.createText("Button");
t.growType = "auto-width";
t.fontFamily = "Inter"; t.fontId = "gfont-inter";
t.fontWeight = "600"; t.fontSize = "14";
b.appendChild(t);
```

`layoutChild.minWidth` on the text will NOT enforce a minimum width - there is no
reliable min-width for an auto-width text child.
