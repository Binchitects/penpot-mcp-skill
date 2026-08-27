# Design tokens in Penpot

## Three-layer architecture

Penpot token sets are ordered and composable. The layering that works:

| Layer | Holds | Example |
|---|---|---|
| `Global` | Raw values, no meaning | `brand-80` = `#0F6CBD` |
| `Alias/Light`, `Alias/Dark` | Semantic, theme-swappable | `color.brand.background.rest` -> `{brand-80}` |
| `Semantic` | Component-scoped | `button.primary.background.rest` -> `{color.brand.background.rest}` |

References use `{token-name}`. Chains resolve transitively, so a rebrand is a one-token
edit rather than a manual sweep.

## The activation trap

**Two alias sets active at once silently collide.** They define the same names, and
resolution follows set precedence, so `Alias/Dark` tokens will report `Alias/Light`
values in `resolvedValue`. Nothing errors. You only notice when the wrong colour appears.

Fix with themes, in the same group so they are mutually exclusive:

```js
const cat = penpot.library.local.tokens;
const light = cat.addTheme({ group: "Color scheme", name: "Light" });
const dark  = cat.addTheme({ group: "Color scheme", name: "Dark"  });
light.addSet(globalSet); light.addSet(aliasLight); light.addSet(semantic);
dark.addSet(globalSet);  dark.addSet(aliasDark);   dark.addSet(semantic);
if (aliasDark.active) aliasDark.toggleActive();
if (!light.active) light.toggleActive();
```

Note `addTheme` takes one object, not two positional arguments.

Caution: activating or deactivating a TokenSet directly disables all themes. Deactivate
stray sets BEFORE activating the theme you want, not after.

## Naming

Because names form a path tree, a leaf cannot also be a prefix. Always give state-bearing
tokens a terminal segment:

```
color.brand.background.rest      GOOD
color.brand.background.hover     GOOD
color.brand.background           BAD - blocks both of the above
```

## Creating tokens idempotently

`addToken` throws if the name exists or collides with a path. Guard it:

```js
const addToken = (set, type, name, value) => {
  if (set.tokens.find(t => t.name === name)) return "exists";
  try { set.addToken({ type, name, value }); return "created"; }
  catch (e) { return "ERR: " + e.message; }
};
```

To rename instead of recreate, assign `token.name = "new.name"` - it is writable.

## Applying tokens

```js
shape.applyToken(token, ["fill"]);
shape.applyToken(radiusToken, ["borderRadiusTopLeft","borderRadiusTopRight",
                               "borderRadiusBottomRight","borderRadiusBottomLeft"]);
```

`applyToken` TOGGLES. Applying the same token to the same property twice unbinds it.
Verify with `shape.tokens` (a map of property -> token name) rather than re-applying.

Setting a property directly (`shape.fills = [...]`) removes the binding.

Application is asynchronous - sleep ~100-500ms before reading back or exporting.
