// penpot-kit hardening pass.
// Pass this whole file to the Penpot MCP `execute_code` tool. Returns findings only.
//
// Every rule here encodes a failure mode that is INVISIBLE in the Penpot UI: the design
// looks correct and only breaks later, on a theme switch or a rebrand.

const cat = penpot.library.local.tokens;
const findings = [];
const F = (sev, rule, msg) => findings.push(sev + " [" + rule + "] " + msg);

// R1 - the same token name defined in two ACTIVE sets. They shadow each other and the
// loser silently reports the winner's resolvedValue.
const seen = {};
cat.sets.filter(s => s.active).forEach(s =>
  s.tokens.forEach(t => { (seen[t.name] = seen[t.name] || []).push(s.name); }));
Object.entries(seen).filter(([, v]) => v.length > 1).slice(0, 10)
  .forEach(([n, v]) => F("ERROR", "token-collision", n + " defined in active sets: " + v.join(", ")));

// R2 - a token name that is both a leaf and a prefix. Blocks future sibling tokens.
const allNames = cat.sets.flatMap(s => s.tokens.map(t => t.name));
allNames.forEach(n => {
  if (allNames.some(m => m !== n && m.startsWith(n + ".")))
    F("ERROR", "path-collision", n + " is both a leaf and a prefix");
});

// R3 - a colour token whose NAME disagrees with its actual HUE.
const hue = hex => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const v = parseInt(m[1], 16), r = (v >> 16 & 255) / 255, g = (v >> 8 & 255) / 255, b = (v & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return null;
  let h;
  if (mx === r) h = 60 * (((g - b) / d) % 6);
  else if (mx === g) h = 60 * ((b - r) / d + 2);
  else h = 60 * ((r - g) / d + 4);
  return (h + 360) % 360;
};
const EXPECT = {
  red: [345, 15], orange: [20, 45], yellow: [50, 70], green: [80, 160],
  teal: [165, 195], cyan: [175, 195], blue: [200, 250], purple: [260, 290],
  magenta: [295, 325], pink: [320, 345]
};
cat.sets.forEach(s => s.tokens.filter(t => t.type === "color").forEach(t => {
  const word = Object.keys(EXPECT).find(w => t.name.toLowerCase().includes(w));
  if (!word) return;
  const h = hue(t.resolvedValue);
  if (h === null) return;
  const [lo, hi] = EXPECT[word];
  const ok = lo <= hi ? (h >= lo && h <= hi) : (h >= lo || h <= hi);
  if (!ok) F("WARN", "name-hue-mismatch",
    s.name + "/" + t.name + " = " + t.resolvedValue + " (hue " + Math.round(h) + "deg) is not " + word);
}));

// R4 - variant containers: stray auto-generated axes, and duplicate property combinations.
penpotUtils.getPages().forEach(p => {
  const pg = penpotUtils.getPageById(p.id);
  if (!pg || !pg.root) return;
  penpotUtils.findShapes(s =>
    typeof s.isVariantContainer === "function" && s.isVariantContainer(), pg.root
  ).forEach(c => {
    const v = c.variants;
    v.properties.filter(x => /^Property \d+$/.test(x)).forEach(x =>
      F("WARN", "stray-variant-prop", p.name + "/" + c.name + " has auto-generated axis '" + x + "'"));
    v.variantComponents().map(x => x.variantError).filter(Boolean).forEach(e =>
      F("ERROR", "variant-error", p.name + "/" + c.name + ": " + e));
  });
});

// R5 - theme-fragile shapes: a visible fill carrying no token binding.
let fragile = 0, checked = 0;
penpotUtils.getPages().forEach(p => {
  const pg = penpotUtils.getPageById(p.id);
  if (!pg || !pg.root || !(pg.root.children || []).length) return;
  penpotUtils.findShapes(s => (s.fills || []).length > 0, pg.root).forEach(s => {
    checked++;
    if (!(s.tokens && s.tokens.fill)) {
      fragile++;
      if (fragile <= 8) F("INFO", "hardcoded-fill",
        p.name + "/" + s.name + " fill " + s.fills[0].fillColor + " is not token-bound");
    }
  });
});

return {
  findings,
  summary: {
    total: findings.length,
    errors: findings.filter(f => f.startsWith("ERROR")).length,
    warnings: findings.filter(f => f.startsWith("WARN")).length,
    shapesWithFills: checked,
    notTokenBound: fragile
  }
};
