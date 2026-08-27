// Component fixtures mirroring the real Design System file, used to test the emitters
// without a live Penpot connection. Structures here were verified against the live file:
//
//   Card   -> grid layout, 3 rows x 1 col, 3 text nodes (Title/Body/Action)
//   Input  -> flex column, 3 text nodes, one NESTED inside a Field board (depth 3)
//   Switch -> NO layout, NO text at all (track + ellipse thumb)
//   Badge  -> flex, 2 axes, radius-full
//   Avatar -> flex, single axis
//
// Switch is the important one: it used to crash the React emitter, which dereferenced
// .text.fontFamily unconditionally.

const T = (t, v) => ({ t, v });
const txt = (chars, size, weight, colorTok, colorVal) => ({
  characters: chars, fontFamily: "Inter", fontId: "gfont-inter",
  fontWeight: String(weight), fontSize: String(size),
  lineHeight: "1.2", letterSpacing: "0", align: "left",
  color: T(colorTok, colorVal)
});
const flex = (dir, pad, gap) => ({
  kind: "flex", dir, alignItems: "center", justifyContent: "center",
  rowGap: gap || 0, columnGap: gap || 0,
  padding: { top: 0, right: pad, bottom: 0, left: pad },
  sizing: { h: "auto", v: "fix" }
});

// ---------- Badge ----------
const BADGE_APP = {
  Brand:   ["color.primary.base", "#0F6CBD", "color.on.primary.base", "#FFFFFF"],
  Danger:  ["color.error.base", "#B3261E", "color.on.error.base", "#FFFFFF"],
  Success: ["color.success.base", "#0F7B3C", "color.on.primary.base", "#FFFFFF"],
  Warning: ["color.warning.base", "#9A6100", "color.on.primary.base", "#FFFFFF"]
};
const BADGE_SIZE = { Small: [16, 8, 11], Medium: [20, 10, 12] };
const badgeVariants = [];
Object.keys(BADGE_APP).forEach((a) => Object.keys(BADGE_SIZE).forEach((s) => {
  const [h, pad, fs] = BADGE_SIZE[s];
  const [bgT, bgV, fgT, fgV] = BADGE_APP[a];
  const label = txt("99", fs, 600, fgT, fgV);
  badgeVariants.push({
    props: { Appearance: a, Size: s },
    box: { height: h, width: 40, opacity: 1, radius: T("radius-full", 9999),
           fill: T(bgT, bgV), stroke: null, shadow: null,
           paddingLeft: T("space-" + (pad * 10), pad), paddingRight: T("space-" + (pad * 10), pad) },
    layout: flex("row", pad, 0),
    text: label,
    texts: [{ name: "Label", text: label }]
  });
}));

// ---------- Avatar ----------
const AV = { ExtraSmall: [24, 11], Small: [32, 12], Medium: [40, 14], Large: [48, 16] };
const avatarVariants = Object.keys(AV).map((k) => {
  const [d, fs] = AV[k];
  const label = txt("AG", fs, 600, "color.on.primary.container", "#082338");
  return {
    props: { Size: k },
    box: { height: d, width: d, opacity: 1, radius: T("radius-full", 9999),
           fill: T("color.primary.container", "#CFE4FA"), stroke: null, shadow: null,
           paddingLeft: null, paddingRight: null },
    layout: flex("row", 0, 0),
    text: label,
    texts: [{ name: "Label", text: label }]
  };
});

// ---------- Switch : no layout, NO TEXT ----------
const switchVariants = [];
[["Off", false], ["On", true]].forEach(([st, on]) =>
  [["No", false], ["Yes", true]].forEach(([dis, d]) => {
    switchVariants.push({
      props: { State: st, Disabled: dis },
      box: { height: 32, width: 52, opacity: d ? 0.6 : 1,
             radius: T("radius-full", 9999),
             fill: d ? T("color.surface.variant", "#F5F5F5")
                     : (on ? T("color.primary.base", "#0F6CBD") : T("color.outline.base", "#79747E")),
             stroke: null, shadow: null, paddingLeft: null, paddingRight: null },
      layout: null,
      text: null,
      texts: []
    });
  }));

// ---------- Card : GRID, 3 text nodes ----------
const CARD = {
  Elevated: ["color.surface.container", "#F0F0F0", true, false],
  Filled:   ["color.surface.variant", "#F5F5F5", false, false],
  Outlined: ["color.surface.base", "#FFFFFF", false, true]
};
const cardVariants = Object.keys(CARD).map((k) => {
  const [bgT, bgV, elev, outlined] = CARD[k];
  const title  = txt("Card title", 16, 600, "color.on.surface.base", "#242424");
  const body   = txt("Supporting text that explains the card.", 14, 400, "color.on.surface.variant", "#616161");
  const action = txt("ACTION", 14, 600, "color.primary.base", "#0F6CBD");
  return {
    props: { Variant: k },
    box: { height: 176, width: 280, opacity: 1, radius: T("radius-large", 8),
           fill: T(bgT, bgV),
           stroke: outlined ? { color: T("color.outline.variant", "#CAC4D0"), width: T("stroke-thin", 1) } : null,
           shadow: elev ? { offsetX: 0, offsetY: 1, blur: 3, spread: 0, color: "#000000" } : null,
           paddingLeft: null, paddingRight: null },
    layout: { kind: "grid",
              rows: [{ type: "auto" }, { type: "auto" }, { type: "auto" }],
              columns: [{ type: "flex", value: 1 }],
              rowGap: 12, columnGap: 0,
              padding: { top: 16, right: 16, bottom: 16, left: 16 } },
    text: title,
    texts: [{ name: "Title", text: title }, { name: "Body", text: body }, { name: "Action", text: action }]
  };
});

// ---------- Input : flex column, 3 text nodes, one nested ----------
const ST = {
  Rest:     ["color.outline.base", "#79747E", "color.on.surface.variant", "#616161", 1],
  Focused:  ["color.primary.base", "#0F6CBD", "color.primary.base", "#0F6CBD", 2],
  Error:    ["color.error.base", "#B3261E", "color.error.base", "#B3261E", 2],
  Disabled: ["color.outline.variant", "#CAC4D0", "color.on.surface.variant", "#BDBDBD", 1]
};
const inputVariants = Object.keys(ST).map((k) => {
  const [, , helpT, helpV] = ST[k];
  const label = txt("Email address", 12, 500, "color.on.surface.variant", "#616161");
  const ph = txt(k === "Disabled" ? "Unavailable" : "you@example.com", 14, 400,
                 "color.on.surface.variant", k === "Disabled" ? "#BDBDBD" : "#616161");
  const help = txt(k === "Error" ? "Enter a valid email" : "We never share this.", 11, 400, helpT, helpV);
  return {
    props: { State: k },
    box: { height: 76, width: 220, opacity: k === "Disabled" ? 0.6 : 1,
           radius: T("radius-xsmall", 4), fill: null, stroke: null, shadow: null,
           paddingLeft: null, paddingRight: null },
    layout: { kind: "flex", dir: "column", alignItems: "start", justifyContent: "start",
              rowGap: 4, columnGap: 0,
              padding: { top: 0, right: 0, bottom: 0, left: 0 },
              sizing: { h: "fix", v: "auto" } },
    text: label,
    texts: [{ name: "FieldLabel", text: label },
            { name: "Placeholder", text: ph },
            { name: "HelperText", text: help }]
  };
});

module.exports = [
  { name: "Badge", page: "Badge", connect: null,
    axes: { Appearance: Object.keys(BADGE_APP), Size: Object.keys(BADGE_SIZE) },
    variants: badgeVariants },
  { name: "Avatar", page: "Avatar", connect: null,
    axes: { Size: Object.keys(AV) }, variants: avatarVariants },
  { name: "Switch", page: "Switch", connect: null,
    axes: { State: ["Off", "On"], Disabled: ["No", "Yes"] }, variants: switchVariants },
  { name: "Card", page: "Card", connect: null,
    axes: { Variant: Object.keys(CARD) }, variants: cardVariants },
  { name: "Input", page: "Input", connect: null,
    axes: { State: Object.keys(ST) }, variants: inputVariants }
];
