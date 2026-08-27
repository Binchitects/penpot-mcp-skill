# Penpot Plugin API gotchas

Each item below was hit in practice. Ordered by how much time it costs when unknown.

## 1. applyToken toggles (silent)

Applying the same token to the same property twice REMOVES the binding. No error.

```js
shape.applyToken(t, ["fill"]);  // bound
shape.applyToken(t, ["fill"]);  // UNBOUND - looks identical
```

Check `shape.tokens` before re-applying. Symptom: a shape keeps its colour but stops
responding to theme changes.

## 2. Token names are a path tree

```
addToken({name: "color.brand.background"})        // ok
addToken({name: "color.brand.background.hover"})  // THROWS
// "A token already exists at the path ... or at a prefix thereof"
```

Siblings are fine. Only leaf-as-prefix collides.

## 3. addTheme signature is wrong in the bundled docs

```js
cat.addTheme("Color scheme", "Light");                   // THROWS: Value not valid
cat.addTheme({ group: "Color scheme", name: "Light" });  // correct
```

## 4. Simultaneously active alias sets collide silently

Two sets defining the same names resolve by precedence. `resolvedValue` on the losing set
reports the winner's value. Use mutually exclusive themes in one group.

## 5. Font lookup is fuzzy

```js
penpot.fonts.findByName("Roboto")     // -> Roboto Mono
penpot.fonts.findByName("Inter")      // -> Inter Tight
penpot.fonts.findByName("Noto Sans")  // -> Noto Sans Ogham
```

Match exactly instead:

```js
(penpot.fonts.all || []).filter(f => f.name.toLowerCase() === name.toLowerCase())[0]
```

Segoe UI is not available (0 matches across ~1900 fonts).

## 6. Read-only geometry

`width`, `height`, `parentX`, `parentY`, `boardX`, `boardY`, `bounds` are read-only.
Use `resize(w, h)` and `penpotUtils.setParentXY(shape, x, y)`.

## 7. resize clobbers text growType

`resize` sets a Text growType to `"fixed"`. Restore `"auto-width"` / `"auto-height"`
afterwards. Auto-sizing is not immediate - sleep ~100ms before reading the new bounds.

## 8. Fills and strokes are replace-only

```js
shape.fills[0].fillColor = "#FF0000";                      // no effect
shape.fills = [{ fillColor: "#FF0000", fillOpacity: 1 }];  // correct
```

## 9. Prototype introspection returns nothing

Penpot API objects are proxies. `Object.getOwnPropertyNames(Object.getPrototypeOf(obj))`
returns an empty array. Probe with `typeof obj.method` instead, or use `penpot_api_info`.

## 10. Exports lag behind mutations

`export_shape` can render pre-change state immediately after a token application. Sleep
~500ms, and treat `shape.fills[0].fillColor` as the source of truth over a render.

## 11. remove() on a component descendant hides instead of deletes

If the shape descends from a board that is a component, `remove()` makes it invisible
rather than removing it. Call `detach()` first when you need real removal.

## 12. Opaque error message

`[PENPOT PLUGIN] Value not valid. Code: :error` almost always means argument SHAPE
mismatch (object vs positional, wrong key names). Check `penpot_api_info` for the exact
member rather than guessing twice.

## 13. SES rejects a dynamic-import-looking sequence ANYWHERE in the source

Penpot runs under SES. Its censor scans RAW SOURCE TEXT, so the word `import` followed by
an opening parenthesis rejects the entire script with SES_IMPORT_REJECTED -- even inside a
string literal or a comment. A checkpoint label reading "before icon import (3 icons)" is
enough to kill a whole script.

`scripts/check-syntax.js` enforces this.

## 14. createComponent WRAPS its shape in a new board

After `lib.createComponent([shape])`, your original reference is a CHILD of the new
component board, not the main instance. Two consequences:

- A later `createShapeFromSvg` or `createBoard` can land INSIDE that board. Create every
  shape first, then componentise in a second pass.
- Passing the original reference to `createVariantContainer` fails with an opaque
  `[object ShapeProxy]` error. Pass `component.mainInstance()` instead.

## 15. Grid layouts start empty and addRow needs a value for flex

A fresh `addGridLayout()` has **0 rows and 0 columns**.

```js
grid.addRow("auto");     // ok
grid.addRow("flex");     // THROWS: :addRow-val
grid.addRow("flex", 1);  // ok
```

Appending to a cell that does not exist does not error -- Penpot silently creates a track
in the wrong direction, so a 3-row card ends up 2x2 with content in the wrong places.

## 16. Shadow tokens need TokenShadowValueString[]

Not an object, not a JSON string. An ARRAY whose fields are STRINGS:

```js
set.addToken({ type: "shadow", name: "elevation.level1",
  value: [{ color: "#000000", inset: "false", offsetX: "0",
            offsetY: "1", spread: "0", blur: "3" }] });
```

## 17. Grid children come back in creation order

`shape.children` for a grid is in creation order, not visual order, so a card built
title/body/action can extract as action/body/title. Sort by `layoutCell.row` then
`.column` before generating code.

## 18. Permission scopes exist

`penpot.currentUser` and `penpot.activeUsers` fail with
`Permission user:read is not granted` on a connection without that scope. Anything
depending on user identity -- comment authorship, presence -- may be unavailable.

## 19. findCommentThreads is async

`page.findCommentThreads()` returns a Promise. Calling `.slice()` on it fails with
"threads.slice is not a function".

## 20. penpot.openPage is asynchronous

```js
penpot.openPage(other);
penpot.currentPage.name;   // still the PREVIOUS page
await new Promise(r => setTimeout(r, 400));
penpot.currentPage.name;   // now correct
```

Creating shapes without waiting puts them on the wrong page. Nothing errors -- the shapes
exist, just somewhere else -- and reading `page.root.children` before the switch settles
returns the old page's contents, which makes cleanup code silently no-op.

Always `await` ~400-500ms after `openPage` before creating or reading.
