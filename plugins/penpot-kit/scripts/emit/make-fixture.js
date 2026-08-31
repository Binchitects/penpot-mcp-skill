#!/usr/bin/env node
// Rebuilds the real Design System IR captured from Penpot, for testing the emitters
// without needing a live connection. Values here were extracted and verified against
// the live file, including the per-theme resolution pass.
//
//   node scripts/emit/make-fixture.js > .penpot/ir.json

const G = (name, type, value) => ({ set: "Global", name, type, value });

const values = [];
values.push(G("teal-100", "color", "rgb(0, 117, 5)"));

[["none",0],["20",2],["40",4],["60",6],["80",8],["100",10],["120",12],["160",16],
 ["200",20],["240",24],["280",28],["320",32],["360",36],["400",40],["480",48],
 ["520",52],["560",56]].forEach(([k, v]) => values.push(G("space-" + k, "spacing", String(v))));

[["none",0],["small",2],["medium",4],["large",8],["xlarge",12]]
  .forEach(([k, v]) => values.push(G("radius-" + k, "borderRadius", String(v))));

[["none",0],["thin",1],["thick",2],["thicker",4],["thickest",6]]
  .forEach(([k, v]) => values.push(G("stroke-" + k, "borderWidth", String(v))));

[["solid","100%"],["acrylic","70%"],["mica","40%"],["smoke","100%"]]
  .forEach(([k, v]) => values.push(G("opacity-" + k, "opacity", v)));

[["menu-icon-100",16],["menu-icon-125",20],["menu-icon-150",24],["menu-icon-200",32],
 ["menu-icon-250",40],["menu-icon-300",48],["menu-icon-400",64],["applist-icon-100",24],
 ["applist-icon-125",30],["applist-icon-150",36],["applist-icon-200",48],
 ["applist-icon-250",60],["applist-icon-300",72],["applist-icon-400",96]]
  .forEach(([k, v]) => values.push(G("size-" + k, "sizing", String(v))));

// Type + motion + elevation scales, matching the live file. Without these the linter
// cannot check typography at all -- it correctly skips any rule whose scale is undefined,
// which once made a dirty fixture look clean.
[11,12,14,16,18,20,22,24,28,32,36,45,57]
  .forEach((n) => values.push(G("font-size-" + n, "fontSizes", String(n))));
[["regular",400],["medium",500],["semibold",600],["bold",700]]
  .forEach(([k, v]) => values.push(G("font-weight-" + k, "fontWeights", String(v))));
[["tight","-0.5"],["normal","0"],["wide","0.5"]]
  .forEach(([k, v]) => values.push(G("letter-spacing-" + k, "letterSpacing", v)));
values.push(G("font-family-base", "fontFamilies", "Inter"));
[["xsmall",4],["xxlarge",28],["full",9999]]
  .forEach(([k, v]) => values.push(G("radius-" + k, "borderRadius", String(v))));

const BRAND = { 10:"#061724", 20:"#082338", 30:"#0A2E4A", 40:"#0C3B5E", 50:"#0E4775",
  60:"#0F548C", 70:"#115EA3", 80:"#0F6CBD", 90:"#2886DE", 100:"#479EF5", 110:"#62ABF5",
  120:"#77B7F7", 130:"#96C6FA", 140:"#B4D6FA", 150:"#CFE4FA", 160:"#EBF3FC" };
Object.entries(BRAND).forEach(([k, v]) => values.push(G("brand-" + k, "color", v)));

const NEUTRAL = { black:"#000000", "grey-8":"#141414", "grey-14":"#242424", "grey-16":"#292929",
  "grey-26":"#424242", "grey-33":"#545454", "grey-38":"#616161", "grey-46":"#757575",
  "grey-58":"#949494", "grey-68":"#ADADAD", "grey-74":"#BDBDBD", "grey-82":"#D1D1D1",
  "grey-88":"#E0E0E0", "grey-94":"#F0F0F0", "grey-96":"#F5F5F5", white:"#FFFFFF" };
Object.entries(NEUTRAL).forEach(([k, v]) => values.push(G(k, "color", v)));

// Alias layers: same names, different references per theme.
const ALIAS = {
  "color.brand.background.rest":        ["{brand-80}", "{brand-70}"],
  "color.brand.background.hover":       ["{brand-70}", "{brand-60}"],
  "color.brand.background.pressed":     ["{brand-40}", "{brand-40}"],
  "color.neutral.foreground.1":         ["{grey-14}", "{white}"],
  "color.neutral.foreground.2":         ["{grey-26}", "{grey-88}"],
  "color.neutral.foreground.disabled":  ["{grey-74}", "{grey-38}"],
  "color.neutral.foreground.onBrand":   ["{white}", "{white}"],
  "color.neutral.background.1":         ["{white}", "{grey-16}"],
  "color.neutral.background.hover":     ["{grey-96}", "{grey-26}"],
  "color.neutral.background.pressed":   ["{grey-88}", "{grey-33}"],
  "color.neutral.background.disabled":  ["{grey-94}", "{grey-8}"],
  "color.neutral.stroke.1":             ["{grey-82}", "{grey-46}"],
  "color.neutral.stroke.disabled":      ["{grey-88}", "{grey-26}"],
  "color.subtle.background.hover":      ["{grey-96}", "{grey-26}"],
  "color.subtle.background.pressed":    ["{grey-88}", "{grey-33}"]
};
Object.entries(ALIAS).forEach(([name, [l, d]]) => {
  values.push({ set: "Alias/Light", name, type: "color", value: l });
  values.push({ set: "Alias/Dark", name, type: "color", value: d });
});

const SEMANTIC = {
  "button.primary.background.rest":     "{color.brand.background.rest}",
  "button.primary.background.hover":    "{color.brand.background.hover}",
  "button.primary.background.pressed":  "{color.brand.background.pressed}",
  "button.primary.foreground":          "{color.neutral.foreground.onBrand}",
  "button.secondary.background.rest":   "{color.neutral.background.1}",
  "button.secondary.background.hover":  "{color.neutral.background.hover}",
  "button.secondary.background.pressed":"{color.neutral.background.pressed}",
  "button.secondary.foreground":        "{color.neutral.foreground.1}",
  "button.secondary.stroke":            "{color.neutral.stroke.1}",
  "button.outline.foreground":          "{color.neutral.foreground.1}",
  "button.outline.stroke":              "{color.neutral.stroke.1}",
  "button.subtle.foreground":           "{color.neutral.foreground.2}",
  "button.subtle.background.hover":     "{color.subtle.background.hover}",
  "button.subtle.background.pressed":   "{color.subtle.background.pressed}",
  "button.disabled.background":         "{color.neutral.background.disabled}",
  "button.disabled.foreground":         "{color.neutral.foreground.disabled}",
  "button.disabled.stroke":             "{color.neutral.stroke.disabled}"
};
Object.entries(SEMANTIC).forEach(([name, value]) =>
  values.push({ set: "Semantic", name, type: "color", value }));

// Per-theme resolved colours, captured by activating each theme in turn.
const LIGHT = {
  "color.brand.background.rest":"#0F6CBD","color.brand.background.hover":"#115EA3",
  "color.brand.background.pressed":"#0C3B5E","color.neutral.foreground.1":"#242424",
  "color.neutral.foreground.2":"#424242","color.neutral.foreground.disabled":"#BDBDBD",
  "color.neutral.foreground.onBrand":"#FFFFFF","color.neutral.background.1":"#FFFFFF",
  "color.neutral.background.hover":"#F5F5F5","color.neutral.background.pressed":"#E0E0E0",
  "color.neutral.background.disabled":"#F0F0F0","color.neutral.stroke.1":"#D1D1D1",
  "color.neutral.stroke.disabled":"#E0E0E0","color.subtle.background.hover":"#F5F5F5",
  "color.subtle.background.pressed":"#E0E0E0","button.primary.background.rest":"#0F6CBD",
  "button.primary.background.hover":"#115EA3","button.primary.background.pressed":"#0C3B5E",
  "button.primary.foreground":"#FFFFFF","button.secondary.background.rest":"#FFFFFF",
  "button.secondary.background.hover":"#F5F5F5","button.secondary.background.pressed":"#E0E0E0",
  "button.secondary.foreground":"#242424","button.secondary.stroke":"#D1D1D1",
  "button.outline.foreground":"#242424","button.outline.stroke":"#D1D1D1",
  "button.subtle.foreground":"#424242","button.subtle.background.hover":"#F5F5F5",
  "button.subtle.background.pressed":"#E0E0E0","button.disabled.background":"#F0F0F0",
  "button.disabled.foreground":"#BDBDBD","button.disabled.stroke":"#E0E0E0"
};
const DARK = {
  "color.brand.background.rest":"#115EA3","color.brand.background.hover":"#0F548C",
  "color.brand.background.pressed":"#0C3B5E","color.neutral.foreground.1":"#FFFFFF",
  "color.neutral.foreground.2":"#E0E0E0","color.neutral.foreground.disabled":"#616161",
  "color.neutral.foreground.onBrand":"#FFFFFF","color.neutral.background.1":"#292929",
  "color.neutral.background.hover":"#424242","color.neutral.background.pressed":"#545454",
  "color.neutral.background.disabled":"#141414","color.neutral.stroke.1":"#757575",
  "color.neutral.stroke.disabled":"#424242","color.subtle.background.hover":"#424242",
  "color.subtle.background.pressed":"#545454","button.primary.background.rest":"#115EA3",
  "button.primary.background.hover":"#0F548C","button.primary.background.pressed":"#0C3B5E",
  "button.primary.foreground":"#FFFFFF","button.secondary.background.rest":"#292929",
  "button.secondary.background.hover":"#424242","button.secondary.background.pressed":"#545454",
  "button.secondary.foreground":"#FFFFFF","button.secondary.stroke":"#757575",
  "button.outline.foreground":"#FFFFFF","button.outline.stroke":"#757575",
  "button.subtle.foreground":"#E0E0E0","button.subtle.background.hover":"#424242",
  "button.subtle.background.pressed":"#545454","button.disabled.background":"#141414",
  "button.disabled.foreground":"#616161","button.disabled.stroke":"#424242"
};
// Non-themed tokens resolve identically in both themes.
const staticResolved = {};
values.filter(v => v.set === "Global").forEach(v => {
  staticResolved[v.name] = /^-?\d+$/.test(v.value) ? Number(v.value) : v.value;
});
const Light = Object.assign({}, staticResolved, LIGHT);
const Dark = Object.assign({}, staticResolved, DARK);

// ---- the Button component ----
const SIZES = { Small: { h: 24, w: 55, pad: "space-80", padV: 8, fs: "12" },
                Medium: { h: 32, w: 69, pad: "space-120", padV: 12, fs: "14" },
                Large: { h: 40, w: 83, pad: "space-160", padV: 16, fs: "16" } };
const APPS = {
  Primary:   { fill: ["button.primary.background.rest", "#0f6cbd"], stroke: null,
               fg: ["button.primary.foreground", "#ffffff"] },
  Secondary: { fill: ["button.secondary.background.rest", "#ffffff"],
               stroke: ["button.secondary.stroke", "#d1d1d1"],
               fg: ["button.secondary.foreground", "#242424"] },
  Outline:   { fill: null, stroke: ["button.outline.stroke", "#d1d1d1"],
               fg: ["button.outline.foreground", "#242424"] },
  Subtle:    { fill: null, stroke: null, fg: ["button.subtle.foreground", "#424242"] }
};

const variants = [];
for (const a of Object.keys(APPS)) {
  for (const s of Object.keys(SIZES)) {
    const S = SIZES[s], A = APPS[a];
    variants.push({
      props: { Appearance: a, Size: s },
      box: {
        height: S.h, width: S.w,
        radius: { t: "radius-medium", v: 4 },
        fill: A.fill ? { t: A.fill[0], v: A.fill[1] } : null,
        stroke: A.stroke
          ? { color: { t: A.stroke[0], v: A.stroke[1] }, width: { t: "stroke-thin", v: 1 } }
          : null,
        paddingLeft: { t: S.pad, v: S.padV },
        paddingRight: { t: S.pad, v: S.padV }
      },
      layout: {
        kind: "flex", dir: "row", alignItems: "center", justifyContent: "center",
        rowGap: 0, columnGap: 0,
        padding: { top: 0, right: S.padV, bottom: 0, left: S.padV },
        sizing: { h: "auto", v: "fix" }
      },
      text: {
        characters: "Button", fontFamily: "Inter", fontId: "gfont-inter",
        fontWeight: "600", fontSize: S.fs, lineHeight: "1.2", letterSpacing: "0",
        align: "left", color: { t: A.fg[0], v: A.fg[1] }
      }
    });
  }
}

const ir = {
  version: 1,
  file: "Design System",
  tokens: {
    sets: [
      { name: "Global", active: true }, { name: "Alias/Dark", active: false },
      { name: "Alias/Light", active: true }, { name: "Semantic", active: true }
    ],
    themes: [
      { group: "Color scheme", name: "Light", active: true, sets: ["Global", "Alias/Light", "Semantic"] },
      { group: "Color scheme", name: "Dark", active: false, sets: ["Global", "Alias/Dark", "Semantic"] }
    ],
    values,
    resolvedByTheme: { Light, Dark }
  },
  components: [
    { name: "Button", page: "Button", connect: null,
      axes: { Appearance: ["Primary", "Secondary", "Outline", "Subtle"],
              Size: ["Small", "Medium", "Large"] },
      variants }
  ].concat(require("./fixture-components.js"))
};

process.stdout.write(JSON.stringify(ir, null, 2) + "\n");
