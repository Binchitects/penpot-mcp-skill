// penpot-kit screen extractor.
//
// Pass this to the Penpot MCP `execute_code` tool. Returns the app SCREENS -- boards that
// compose the design system rather than define it.
//
// Set `storage.screenPages` to a name prefix first (default "App /"):
//     storage.screenPages = "App /";
//
// A component is a definition; a screen is a USE. The difference matters for codegen: a
// component becomes a reusable export, a screen becomes a page that imports components and
// passes props. Extracting a screen as if it were a component would inline the whole
// design system into one file and lose every link back to it.
//
// Instances are recorded as { kind: "instance", component, props } -- NOT as their rendered
// geometry. That is the whole point: the screen says "a Primary/Medium Button goes here",
// and codegen emits <Button appearance="primary" size="medium" />. If the component later
// changes, the screen does not need to.

const PREFIX = typeof storage.screenPages === "string" ? storage.screenPages : "App /";
const MAX_DEPTH = 6;

const sv = (shape, prop, literal) => {
  const t = shape.tokens && shape.tokens[prop];
  return t ? { t: t, v: literal } : { v: literal };
};

const layoutOf = (b) => {
  if (b.flex) {
    const f = b.flex;
    return {
      kind: "flex", dir: f.dir, alignItems: f.alignItems, justifyContent: f.justifyContent,
      rowGap: f.rowGap, columnGap: f.columnGap,
      padding: { top: f.topPadding, right: f.rightPadding, bottom: f.bottomPadding, left: f.leftPadding },
      sizing: { h: f.horizontalSizing, v: f.verticalSizing }
    };
  }
  if (b.grid) {
    const g = b.grid;
    const track = (t) => ({ type: t.type, value: t.value });
    return {
      kind: "grid", rows: (g.rows || []).map(track), columns: (g.columns || []).map(track),
      rowGap: g.rowGap, columnGap: g.columnGap,
      padding: { top: g.topPadding, right: g.rightPadding, bottom: g.bottomPadding, left: g.leftPadding }
    };
  }
  return null;
};

const boxOf = (b) => ({
  width: Math.round(b.width), height: Math.round(b.height),
  radius: sv(b, "borderRadiusTopLeft", b.borderRadius),
  fill: (b.fills && b.fills.length) ? sv(b, "fill", b.fills[0].fillColor) : null,
  stroke: (b.strokes && b.strokes.length)
    ? { color: sv(b, "strokeColor", b.strokes[0].strokeColor),
        width: sv(b, "strokeWidth", b.strokes[0].strokeWidth) } : null
});

const textOf = (t) => ({
  characters: t.characters,
  fontSize: t.fontSize, fontWeight: t.fontWeight, fontFamily: t.fontFamily,
  lineHeight: t.lineHeight,
  color: sv(t, "fill", t.fills && t.fills[0] && t.fills[0].fillColor)
});

const isInstance = (s) => {
  try { return typeof s.isComponentInstance === "function" && s.isComponentInstance(); }
  catch (e) { return false; }
};

// Every text inside an instance, so codegen can pass the screen's own copy as slot props
// instead of inheriting the design-system placeholder.
const instanceTexts = (s) => {
  const out = [];
  const walk = (n) => {
    if (n.type === "text") out.push({ name: n.name, characters: n.characters });
    (n.children || []).forEach(walk);
  };
  (s.children || []).forEach(walk);
  return out;
};

const nodeOf = (s, depth) => {
  // An instance is a USE of a component. Record what it is and stop descending -- its
  // internals belong to the component, not the screen.
  if (isInstance(s)) {
    let component = null, props = null;
    try {
      const c = typeof s.component === "function" ? s.component() : null;
      if (c) { component = c.name; props = c.variantProps || null; }
    } catch (e) { /* orphaned instance */ }
    return {
      kind: "instance", name: s.name, component: component, props: props,
      texts: instanceTexts(s)
    };
  }

  if (s.type === "text") {
    return { kind: "text", name: s.name, text: textOf(s) };
  }

  const node = {
    kind: "box", name: s.name, type: s.type,
    box: boxOf(s), layout: layoutOf(s), children: []
  };
  if (depth > 0 && s.children && s.children.length) {
    node.children = s.children.map((c) => nodeOf(c, depth - 1));
  }
  return node;
};

const screens = [];
penpotUtils.getPages()
  .filter((p) => p.name.indexOf(PREFIX) === 0)
  .forEach((p) => {
    const pg = penpotUtils.getPageById(p.id);
    if (!pg || !pg.root) return;
    (pg.root.children || []).forEach((board) => {
      const root = nodeOf(board, MAX_DEPTH);
      // flat list of every component this screen depends on
      const uses = {};
      const walk = (n) => {
        if (n.kind === "instance" && n.component) {
          uses[n.component] = (uses[n.component] || 0) + 1;
        }
        (n.children || []).forEach(walk);
      };
      walk(root);
      screens.push({
        name: board.name,
        page: p.name,
        route: "/" + String(board.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        box: boxOf(board),
        layout: layoutOf(board),
        uses: uses,
        root: root
      });
    });
  });

return { version: 1, file: penpot.currentFile ? penpot.currentFile.name : null,
         prefix: PREFIX, screens: screens };
