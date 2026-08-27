// penpot-kit IR extractor.
// Pass this whole file to the Penpot MCP `execute_code` tool. Returns a normalized
// intermediate representation of the design system, suitable for deterministic codegen.
//
// CRITICAL DESIGN RULE: every style value is emitted as either
//   { t: "<token.name>", v: "<resolved>" }   when token-bound
//   { v: "<literal>" }                       when hardcoded
// `penpot.generateStyle` throws the binding away and emits raw hex, which is exactly what
// makes its output unusable as production code. We never use it.

const cat = penpot.library.local.tokens;
const MAX_DEPTH = 4;

// Resolve a style property to token-or-literal form.
const sv = (shape, prop, literal) => {
  const t = shape.tokens && shape.tokens[prop];
  return t ? { t: t, v: literal } : { v: literal };
};

// Handles BOTH layout systems. Returning null for grid (an earlier bug) silently dropped
// the entire layout of every grid-based component -- the generated CSS looked plausible
// and positioned nothing.
const layoutOf = (b) => {
  if (b.flex) {
    const f = b.flex;
    return {
      kind: "flex",
      dir: f.dir,
      alignItems: f.alignItems,
      justifyContent: f.justifyContent,
      rowGap: f.rowGap, columnGap: f.columnGap,
      padding: { top: f.topPadding, right: f.rightPadding, bottom: f.bottomPadding, left: f.leftPadding },
      sizing: { h: f.horizontalSizing, v: f.verticalSizing }
    };
  }
  if (b.grid) {
    const g = b.grid;
    const track = (t) => ({ type: t.type, value: t.value });
    return {
      kind: "grid",
      rows: (g.rows || []).map(track),
      columns: (g.columns || []).map(track),
      rowGap: g.rowGap, columnGap: g.columnGap,
      padding: { top: g.topPadding, right: g.rightPadding, bottom: g.bottomPadding, left: g.leftPadding },
      sizing: { h: g.horizontalSizing, v: g.verticalSizing }
    };
  }
  return null;
};

const textOf = (t) => ({
  characters: t.characters,
  fontFamily: t.fontFamily,
  fontId: t.fontId,
  fontWeight: t.fontWeight,
  fontSize: t.fontSize,
  lineHeight: t.lineHeight,
  letterSpacing: t.letterSpacing,
  align: t.align,
  color: sv(t, "fill", t.fills && t.fills[0] && t.fills[0].fillColor)
});

const boxOf = (b) => ({
  height: Math.round(b.height),
  width: Math.round(b.width),
  opacity: b.opacity,
  radius: sv(b, "borderRadiusTopLeft", b.borderRadius),
  fill: (b.fills && b.fills.length) ? sv(b, "fill", b.fills[0].fillColor) : null,
  stroke: (b.strokes && b.strokes.length)
    ? { color: sv(b, "strokeColor", b.strokes[0].strokeColor),
        width: sv(b, "strokeWidth", b.strokes[0].strokeWidth) }
    : null,
  shadow: (b.shadows && b.shadows.length)
    ? { offsetX: b.shadows[0].offsetX, offsetY: b.shadows[0].offsetY,
        blur: b.shadows[0].blur, spread: b.shadows[0].spread,
        color: b.shadows[0].color, opacity: b.shadows[0].opacity }
    : null,
  paddingLeft: b.flex ? sv(b, "paddingLeft", b.flex.leftPadding) : null,
  paddingRight: b.flex ? sv(b, "paddingRight", b.flex.rightPadding) : null
});

// Recursive node capture.
//
// An earlier version stored a single `text` field taken from the first direct text child.
// That silently discarded every other text node: an Input with label + placeholder +
// helper text emitted only the label, and a Switch (no text at all) produced text: null,
// which then crashed the React emitter. Capture the whole tree instead and let emitters
// decide what they need.
const nodeOf = (s, depth) => {
  const node = {
    name: s.name,
    type: s.type,
    box: boxOf(s),
    layout: layoutOf(s),
    text: s.type === "text" ? textOf(s) : null,
    cell: s.layoutCell
      ? { row: s.layoutCell.row, column: s.layoutCell.column,
          rowSpan: s.layoutCell.rowSpan, columnSpan: s.layoutCell.columnSpan }
      : null,
    children: []
  };
  if (depth > 0 && s.children && s.children.length) {
    let kids = s.children.slice();
    // In a grid the children array is in creation order, not visual order, so a card
    // built title/body/action can extract as action/body/title and generate JSX with the
    // parts in the wrong sequence. Sort by cell so document order matches what is drawn.
    if (s.grid) {
      kids.sort((a, b) => {
        const ac = a.layoutCell || {}, bc = b.layoutCell || {};
        return (ac.row || 0) - (bc.row || 0) || (ac.column || 0) - (bc.column || 0);
      });
    }
    node.children = kids.map((c) => nodeOf(c, depth - 1));
  }
  return node;
};

// Convenience: every text node in a subtree, in document order.
const collectText = (node, acc) => {
  acc = acc || [];
  if (node.text) acc.push({ name: node.name, text: node.text });
  (node.children || []).forEach((c) => collectText(c, acc));
  return acc;
};

// ---- tokens ----
// CRITICAL: an INACTIVE token set reports the ACTIVE set's resolvedValue. Extracting all
// themes in one pass therefore yields a silently WRONG dark theme. Activate each theme in
// turn, collect resolved values per theme, then restore the original.
const originalTheme = cat.themes.filter((t) => t.active).map((t) => t.name)[0];

const byTheme = {};
for (const th of cat.themes) {
  if (!th.active) th.toggleActive();
  await new Promise((r) => setTimeout(r, 400));
  const map = {};
  cat.sets.filter((s) => s.active).forEach((s) =>
    s.tokens.forEach((t) => { map[t.name] = t.resolvedValue; }));
  byTheme[th.name] = map;
}
const restore = cat.themes.find((t) => t.name === originalTheme);
if (restore && !restore.active) restore.toggleActive();
await new Promise((r) => setTimeout(r, 400));

const tokens = {
  sets: cat.sets.map((s) => ({ name: s.name, active: s.active })),
  themes: cat.themes.map((t) => ({
    group: t.group, name: t.name, active: t.active,
    sets: t.activeSets.map((s) => s.name)
  })),
  // Declarations: the authored value (may be a {reference}). Theme-independent.
  values: cat.sets.flatMap((s) => s.tokens.map((t) => ({
    set: s.name, name: t.name, type: t.type,
    value: typeof t.value === "object" ? JSON.stringify(t.value) : t.value
  }))),
  // Resolved values PER THEME. This is what codegen must use for colours.
  resolvedByTheme: byTheme
};

// ---- components ----
const components = [];
penpotUtils.getPages().forEach((p) => {
  const pg = penpotUtils.getPageById(p.id);
  if (!pg || !pg.root) return;
  penpotUtils.findShapes((s) =>
    typeof s.isVariantContainer === "function" && s.isVariantContainer(), pg.root
  ).forEach((c) => {
    const v = c.variants;
    const axes = {};
    v.properties.forEach((prop) => { axes[prop] = v.currentValues(prop); });
    const vcs = v.variantComponents();

    const variants = c.children.map((child) => {
      const comp = vcs.find((vc) => {
        try { const mi = vc.mainInstance(); return mi && mi.id === child.id; }
        catch (e) { return false; }
      });
      const root = nodeOf(child, MAX_DEPTH);
      const texts = collectText(root);
      return {
        props: comp ? comp.variantProps : null,
        box: root.box,
        layout: root.layout,
        // `text` stays for the common single-label case, but is now nullable BY DESIGN.
        // Emitters must guard it; components like Switch legitimately have no text.
        text: texts.length ? texts[0].text : null,
        texts: texts,
        root: root
      };
    });

    let connect = null;
    try {
      const raw = c.getPluginData("penpotKit.codeConnect");
      if (raw) connect = JSON.parse(raw);
    } catch (e) { connect = null; }

    components.push({ name: c.name, page: p.name, axes, variants, connect });
  });
});

return { version: 2, file: penpot.currentFile ? penpot.currentFile.name : null, tokens, components };
