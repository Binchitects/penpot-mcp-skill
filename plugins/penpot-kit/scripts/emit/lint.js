#!/usr/bin/env node
// penpot-kit design-system consistency linter.
//
//   node scripts/emit/lint.js --ir .penpot/ir.json [--config .penpot/lint.json] [--json]
//                             [--max-warnings N]
//
// Runs entirely OFFLINE against an extracted IR. No Penpot connection required, so it
// works in CI and in any harness.
//
// The audit (penpot-audit.js) asks "is this design internally valid?" -- token collisions,
// path violations, variant errors. This asks a different and harder question:
//
//     "is this design system CONSISTENT with itself?"
//
// A design can be perfectly valid and still drift: one component padded 13px while the
// scale says 12, one label at weight 550, one grey typed by hand instead of taken from the
// ramp. None of that errors anywhere. It just slowly stops being a system.

"use strict";

const fs = require("fs");

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const num = (v) => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

// ---------------------------------------------------------------- scales from tokens

function buildScales(ir) {
  const byType = {};
  for (const t of ir.tokens.values) {
    (byType[t.type] = byType[t.type] || []).push(t);
  }
  const scale = (type) => {
    const out = new Set();
    (byType[type] || []).forEach((t) => {
      const n = num(t.value);
      if (n !== null) out.add(n);
    });
    return out;
  };

  // Every colour a token can resolve to, in ANY theme. A literal that matches one of these
  // is on-palette but unbound; a literal that matches none is off-palette entirely.
  const palette = new Set();
  Object.values(ir.tokens.resolvedByTheme || {}).forEach((m) =>
    Object.values(m).forEach((v) => {
      if (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v)) palette.add(v.toUpperCase());
    }));
  (byType.color || []).forEach((t) => {
    if (typeof t.value === "string" && /^#[0-9a-f]{6}$/i.test(t.value)) {
      palette.add(t.value.toUpperCase());
    }
  });

  return {
    spacing: scale("spacing"),
    radius: scale("borderRadius"),
    stroke: scale("borderWidth"),
    fontSize: scale("fontSizes"),
    fontWeight: scale("fontWeights"),
    palette
  };
}

// ---------------------------------------------------------------- rules

const DEFAULT_CONFIG = {
  ignore: [],                 // rule ids to skip
  allowFontFamilies: null,    // null = infer the dominant family and flag the rest
  allowLineHeights: null,
  // radius-full is a sentinel, not a scale value; heights are component decisions.
  ignoreRadiusValues: [9999],
  maxOffScale: 0
};

// Older IRs -- and any single-label component -- carry `text` (singular) with no `texts`
// array. Reading only `texts` silently skipped every such variant, so the linter reported
// a clean system while checking none of it. Normalise before any rule runs.
function textsOf(v) {
  if (v.texts && v.texts.length) return v.texts;
  if (v.text) return [{ name: "Label", text: v.text }];
  return [];
}

function lint(ir, config) {
  const S = buildScales(ir);
  // Every token name the system actually declares. A component may be BOUND to a token
  // that no longer exists -- rename a token, or extract components against a different
  // token set, and the binding survives while the target does not. CSS resolves a missing
  // custom property to nothing, so the component renders completely invisible with no
  // error anywhere. This is the single most silent failure in the whole pipeline.
  const known = new Set(ir.tokens.values.map((t) => t.name));
  const findings = [];
  const add = (sev, rule, where, msg) => findings.push({ sev, rule, where, msg });

  const comps = ir.components || [];
  if (!comps.length) add("WARN", "no-components", "-", "IR contains no components to lint");

  // --- collect global distributions first, so drift rules can find the majority ---
  const families = {}, lineHeights = {}, weights = {};
  const axisNames = {};
  comps.forEach((c) => {
    (c.variants || []).forEach((v) => {
      textsOf(v).forEach((t) => {
        const x = t.text || {};
        if (x.fontFamily) families[x.fontFamily] = (families[x.fontFamily] || 0) + 1;
        if (x.lineHeight) lineHeights[x.lineHeight] = (lineHeights[x.lineHeight] || 0) + 1;
        if (x.fontWeight) weights[x.fontWeight] = (weights[x.fontWeight] || 0) + 1;
      });
    });
    Object.keys(c.axes || {}).forEach((a) => { axisNames[a] = (axisNames[a] || 0) + 1; });
  });

  const dominant = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1])[0];
  const domFamily = dominant(families);
  const domLineHeight = dominant(lineHeights);

  // --- per-component rules ---
  for (const c of comps) {
    const where = c.page + "/" + c.name;

    // R1 axis naming: axes should be PascalCase nouns, values PascalCase.
    Object.entries(c.axes || {}).forEach(([axis, vals]) => {
      if (!/^[A-Z][A-Za-z0-9 ]*$/.test(axis)) {
        add("WARN", "axis-naming", where, 'axis "' + axis + '" should be PascalCase');
      }
      vals.forEach((v) => {
        if (!/^[A-Z]/.test(String(v))) {
          add("WARN", "axis-value-naming", where, 'value "' + v + '" in axis "' + axis + '" should be capitalised');
        }
      });
    });

    for (const v of c.variants || []) {
      const tag = where + (v.props ? " [" + Object.values(v.props).join("/") + "]" : "");
      const box = v.box || {};
      const L = v.layout || {};

      // R2 spacing off the scale
      const pads = L.padding || {};
      ["top", "right", "bottom", "left"].forEach((side) => {
        const n = num(pads[side]);
        if (n !== null && n !== 0 && S.spacing.size && !S.spacing.has(n)) {
          add("WARN", "off-scale-spacing", tag, "padding-" + side + " " + n + "px is not on the spacing scale");
        }
      });
      [["rowGap", L.rowGap], ["columnGap", L.columnGap]].forEach(([k, raw]) => {
        const n = num(raw);
        if (n !== null && n !== 0 && S.spacing.size && !S.spacing.has(n)) {
          add("WARN", "off-scale-spacing", tag, k + " " + n + "px is not on the spacing scale");
        }
      });

      // R3 radius off the scale
      const r = num(box.radius && box.radius.v);
      if (r !== null && r !== 0 && S.radius.size &&
          !S.radius.has(r) && config.ignoreRadiusValues.indexOf(r) === -1) {
        add("WARN", "off-scale-radius", tag, "border-radius " + r + "px is not on the radius scale");
      }

      // R4 stroke width off the scale
      const sw = num(box.stroke && box.stroke.width && box.stroke.width.v);
      if (sw !== null && sw !== 0 && S.stroke.size && !S.stroke.has(sw)) {
        add("WARN", "off-scale-stroke", tag, "stroke-width " + sw + "px is not on the stroke scale");
      }

      // R5/R6 typography off the scale
      textsOf(v).forEach((t) => {
        const x = t.text || {};
        const fs2 = num(x.fontSize);
        if (fs2 !== null && S.fontSize.size && !S.fontSize.has(fs2)) {
          add("WARN", "off-scale-font-size", tag, t.name + " font-size " + fs2 + " is not on the type scale");
        }
        const fw = num(x.fontWeight);
        if (fw !== null && S.fontWeight.size && !S.fontWeight.has(fw)) {
          add("WARN", "off-scale-font-weight", tag, t.name + " font-weight " + fw + " is not on the weight scale");
        }
        if (domFamily && x.fontFamily && x.fontFamily !== domFamily[0]) {
          add("WARN", "font-family-drift", tag,
            t.name + ' uses "' + x.fontFamily + '" while the system uses "' + domFamily[0] + '"');
        }
        if (domLineHeight && x.lineHeight && String(x.lineHeight) !== String(domLineHeight[0])) {
          add("INFO", "line-height-drift", tag,
            t.name + " line-height " + x.lineHeight + " differs from the dominant " + domLineHeight[0]);
        }
        // R7 unbound text colour
        if (x.color && !x.color.t) {
          const lit = String(x.color.v || "").toUpperCase();
          const onPalette = S.palette.has(lit);
          add(onPalette ? "WARN" : "ERROR", onPalette ? "unbound-color" : "off-palette-color", tag,
            t.name + " colour " + lit + (onPalette
              ? " matches a token value but is not bound to one"
              : " is not in the palette at all"));
        }
      });

      // R8 unbound surface colours
      [["fill", box.fill], ["stroke", box.stroke && box.stroke.color]].forEach(([what, sv]) => {
        if (!sv) return;
        if (sv.t) return;
        const lit = String(sv.v || "").toUpperCase();
        if (!/^#[0-9A-F]{6}$/.test(lit)) return;
        const onPalette = S.palette.has(lit);
        add(onPalette ? "WARN" : "ERROR", onPalette ? "unbound-color" : "off-palette-color", tag,
          what + " " + lit + (onPalette
            ? " matches a token value but is not bound to one"
            : " is not in the palette at all"));
      });

      // R9 dangling token bindings
      const checkBinding = (sv, what) => {
        if (sv && sv.t && !known.has(sv.t)) {
          add("ERROR", "dangling-token", tag,
            what + ' is bound to "' + sv.t + '", which no token declares — CSS will resolve ' +
            "it to nothing and the element renders invisible");
        }
      };
      checkBinding(box.fill, "fill");
      checkBinding(box.radius, "border-radius");
      checkBinding(box.paddingLeft, "padding-left");
      checkBinding(box.paddingRight, "padding-right");
      if (box.stroke) {
        checkBinding(box.stroke.color, "stroke colour");
        checkBinding(box.stroke.width, "stroke width");
      }
      textsOf(v).forEach((t) => checkBinding((t.text || {}).color, t.name + " colour"));

      // R10 a component with no layout cannot respond to content
      if (!v.layout && textsOf(v).length > 1) {
        add("WARN", "no-layout", tag, "has " + textsOf(v).length + " text nodes but no layout system");
      }
    }
  }

  // R10 axis vocabulary drift: near-duplicate axis names across the system.
  const names = Object.keys(axisNames);
  names.forEach((a) => {
    names.forEach((b) => {
      if (a >= b) return;
      if (a.toLowerCase() === b.toLowerCase()) {
        add("WARN", "axis-vocabulary", "-", 'axes "' + a + '" and "' + b + '" differ only by case');
      }
    });
  });

  return findings.filter((f) => config.ignore.indexOf(f.rule) === -1);
}

// ---------------------------------------------------------------- cli

function main() {
  const irPath = arg("--ir", ".penpot/ir.json");
  const cfgPath = arg("--config", ".penpot/lint.json");
  const maxWarn = parseInt(arg("--max-warnings", "-1"), 10);

  if (!fs.existsSync(irPath)) {
    console.error("penpot-kit lint: no IR at " + irPath + " (run an extract first)");
    process.exit(2);
  }
  const ir = JSON.parse(fs.readFileSync(irPath, "utf8"));
  const config = Object.assign({}, DEFAULT_CONFIG,
    fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, "utf8")) : {});

  const findings = lint(ir, config);
  const errors = findings.filter((f) => f.sev === "ERROR");
  const warnings = findings.filter((f) => f.sev === "WARN");

  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify({ findings, summary: {
      errors: errors.length, warnings: warnings.length, total: findings.length } }, null, 2) + "\n");
  } else {
    const byRule = {};
    findings.forEach((f) => { (byRule[f.rule] = byRule[f.rule] || []).push(f); });

    console.log("penpot-kit lint — " + (ir.components || []).length + " components, " +
      ir.tokens.values.length + " tokens\n");

    if (!findings.length) {
      console.log("  No consistency problems found.");
    } else {
      Object.keys(byRule).sort().forEach((rule) => {
        const list = byRule[rule];
        console.log("  " + list[0].sev + "  " + rule + "  (" + list.length + ")");
        list.slice(0, 5).forEach((f) => console.log("      " + f.where + ": " + f.msg));
        if (list.length > 5) console.log("      ... and " + (list.length - 5) + " more");
      });
    }
    console.log("\n  " + errors.length + " error(s), " + warnings.length + " warning(s)");
  }

  if (errors.length) process.exit(1);
  if (maxWarn >= 0 && warnings.length > maxWarn) process.exit(1);
  process.exit(0);
}

if (require.main === module) main();
module.exports = { lint, buildScales, DEFAULT_CONFIG };
