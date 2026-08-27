// penpot-kit IR extractor.
// Pass this whole file to the Penpot MCP `execute_code` tool. Returns a normalized
// intermediate representation of the design system, suitable for deterministic codegen.
//
// CRITICAL DESIGN RULE: every style value is emitted as either
//   { t: "<token.name>", v: "<resolved>" }   when token-bound
//   { v: "<literal>" }                       when hardcoded
// `penpot.generateStyle` throws the binding away and emits raw hex. That is precisely
// what makes its output unusable as production code, so we never use it.

const cat = penpot.library.local.tokens;

// Resolve a style property to token-or-literal form.
const sv = (shape, prop, literal) => {
  const t = shape.tokens && shape.tokens[prop];
  return t ? { t: t, v: literal } : { v: literal };
};

const layoutOf = b => {
  const f = b.flex;
  if (!f) return null;
  return {
    kind: "flex",
    dir: f.dir,
    alignItems: f.alignItems,
    justifyContent: f.justifyContent,
    rowGap: f.rowGap, columnGap: f.columnGap,
    padding: { top: f.topPadding, right: f.rightPadding, bottom: f.bottomPadding, left: f.leftPadding },
    sizing: { h: f.horizontalSizing, v: f.verticalSizing }
  };
};

const textOf = t => t ? {
  characters: t.characters,
  fontFamily: t.fontFamily,
  fontId: t.fontId,
  fontWeight: t.fontWeight,
  fontSize: t.fontSize,
  lineHeight: t.lineHeight,
  letterSpacing: t.letterSpacing,
  align: t.align,
  color: sv(t, "fill", t.fills && t.fills[0] && t.fills[0].fillColor)
} : null;

const boxOf = b => ({
  height: Math.round(b.height),
  width: Math.round(b.width),
  radius: sv(b, "borderRadiusTopLeft", b.borderRadius),
  fill: (b.fills && b.fills.length) ? sv(b, "fill", b.fills[0].fillColor) : null,
  stroke: (b.strokes && b.strokes.length)
    ? { color: sv(b, "strokeColor", b.strokes[0].strokeColor),
        width: sv(b, "strokeWidth", b.strokes[0].strokeWidth) }
    : null,
  paddingLeft:  b.flex ? sv(b, "paddingLeft",  b.flex.leftPadding)  : null,
  paddingRight: b.flex ? sv(b, "paddingRight", b.flex.rightPadding) : null
});

// ---- tokens ----
// CRITICAL: an INACTIVE token set reports the ACTIVE set's resolvedValue. Extracting all
// themes in one pass therefore yields a silently WRONG dark theme. We must activate each
// theme in turn and collect resolved values per theme, then restore the original.
const originalTheme = cat.themes.filter(t => t.active).map(t => t.name)[0];

const byTheme = {};
for (const th of cat.themes) {
  if (!th.active) th.toggleActive();
  await new Promise(r => setTimeout(r, 400));
  const map = {};
  cat.sets.filter(s => s.active).forEach(s =>
    s.tokens.forEach(t => { map[t.name] = t.resolvedValue; }));
  byTheme[th.name] = map;
}
const restore = cat.themes.find(t => t.name === originalTheme);
if (restore && !restore.active) restore.toggleActive();
await new Promise(r => setTimeout(r, 400));

const tokens = {
  sets: cat.sets.map(s => ({ name: s.name, active: s.active })),
  themes: cat.themes.map(t => ({
    group: t.group, name: t.name, active: t.active,
    sets: t.activeSets.map(s => s.name)
  })),
  // Declarations: the authored value (may be a {reference}). Theme-independent.
  values: cat.sets.flatMap(s => s.tokens.map(t => ({
    set: s.name, name: t.name, type: t.type, value: t.value
  }))),
  // Resolved values PER THEME. This is what codegen must use for colours.
  resolvedByTheme: byTheme
};

// ---- components ----
const components = [];
penpotUtils.getPages().forEach(p => {
  const pg = penpotUtils.getPageById(p.id);
  if (!pg || !pg.root) return;
  penpotUtils.findShapes(s =>
    typeof s.isVariantContainer === "function" && s.isVariantContainer(), pg.root
  ).forEach(c => {
    const v = c.variants;
    const axes = {};
    v.properties.forEach(prop => { axes[prop] = v.currentValues(prop); });

    const variants = c.children.map(child => {
      // find this child's variant property values
      const comp = v.variantComponents().find(vc => {
        try { const mi = vc.mainInstance(); return mi && mi.id === child.id; } catch (e) { return false; }
      });
      return {
        props: comp ? comp.variantProps : null,
        box: boxOf(child),
        layout: layoutOf(child),
        text: textOf((child.children || []).find(x => x.type === "text"))
      };
    });

    components.push({ name: c.name, page: p.name, axes, variants });
  });
});

return { version: 1, file: penpot.currentFile ? penpot.currentFile.name : null, tokens, components };
