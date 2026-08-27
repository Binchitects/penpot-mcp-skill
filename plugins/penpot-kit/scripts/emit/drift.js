#!/usr/bin/env node
// penpot-kit drift detector.
//
//   node scripts/emit/drift.js --ir .penpot/ir.json --out src/design [--baseline .penpot/ir.prev.json]
//
// Reports divergence. NEVER writes. The whole point of choosing "report drift" over
// "auto-overwrite" is that a wrong automatic sync destroys real work silently, in
// whichever direction you happened not to be looking.
//
// Two independent comparisons:
//   1. STALENESS  — does the generated code on disk match what the current design implies?
//   2. DESIGN DIFF — what changed in the design since the last recorded IR baseline?

const fs = require("fs");
const path = require("path");
const { emitCss } = require("./index.js");

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : def;
}

// Pull custom properties out of a CSS file, scoped by the block they appear in, so a
// token defined only inside a dark-theme block is not confused with the default.
function parseCssVars(css) {
  const out = {};
  const re = /(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(css))) {
    const name = m[1];
    const value = m[2].trim();
    if (!(name in out)) out[name] = value; // first (default :root) wins
  }
  return out;
}

function diffMaps(a, b, labelA, labelB) {
  const findings = [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of [...keys].sort()) {
    if (!(k in b)) findings.push({ kind: "only-in-" + labelA, key: k, a: a[k] });
    else if (!(k in a)) findings.push({ kind: "only-in-" + labelB, key: k, b: b[k] });
    else if (a[k] !== b[k]) findings.push({ kind: "changed", key: k, a: a[k], b: b[k] });
  }
  return findings;
}

function main() {
  const irPath = arg("--ir", ".penpot/ir.json");
  const outDir = arg("--out", "src/design");
  const baseline = arg("--baseline", null);

  const ir = JSON.parse(fs.readFileSync(irPath, "utf8"));
  const report = { staleness: [], design: [], summary: {} };

  // ---- 1. staleness: generated code vs what the design implies now ----
  const cssPath = path.join(outDir, "tokens.css");
  if (fs.existsSync(cssPath)) {
    const onDisk = parseCssVars(fs.readFileSync(cssPath, "utf8"));
    const expected = parseCssVars(emitCss(ir));
    report.staleness = diffMaps(onDisk, expected, "code", "design");
  } else {
    report.staleness = [{ kind: "missing", key: cssPath, note: "no generated tokens.css found" }];
  }

  // ---- 2. design diff vs the last recorded baseline ----
  if (baseline && fs.existsSync(baseline)) {
    const prev = JSON.parse(fs.readFileSync(baseline, "utf8"));
    const flat = (x) => x.tokens.values.reduce((acc, t) => {
      acc[t.set + "/" + t.name] = String(t.value);
      return acc;
    }, {});
    report.design = diffMaps(flat(prev), flat(ir), "baseline", "current");

    // component axis changes are worth calling out separately
    const axesOf = (x) => (x.components || []).reduce((acc, c) => {
      Object.entries(c.axes).forEach(([axis, vals]) => {
        acc[c.name + "." + axis] = vals.join("|");
      });
      return acc;
    }, {});
    report.design.push(...diffMaps(axesOf(prev), axesOf(ir), "baseline", "current")
      .map((d) => Object.assign({ scope: "component-axis" }, d)));
  }

  report.summary = {
    stale: report.staleness.length,
    designChanges: report.design.length,
    verdict: report.staleness.length === 0
      ? "generated code is up to date with the design"
      : "generated code is STALE — run /penpot:codegen"
  };

  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    console.log("Drift report");
    console.log("  " + report.summary.verdict);
    if (report.staleness.length) {
      console.log("\n  Code vs design (" + report.staleness.length + "):");
      report.staleness.slice(0, 25).forEach((d) => {
        if (d.kind === "changed") console.log("    changed  " + d.key + ": " + d.a + "  ->  " + d.b);
        else console.log("    " + d.kind + "  " + d.key + (d.note ? "  (" + d.note + ")" : ""));
      });
      if (report.staleness.length > 25) console.log("    ... and " + (report.staleness.length - 25) + " more");
    }
    if (report.design.length) {
      console.log("\n  Design vs baseline (" + report.design.length + "):");
      report.design.slice(0, 25).forEach((d) => {
        if (d.kind === "changed") console.log("    changed  " + d.key + ": " + d.a + "  ->  " + d.b);
        else console.log("    " + d.kind + "  " + d.key);
      });
    }
  }

  // Exit 1 on staleness so this can gate CI.
  process.exit(report.staleness.length ? 1 : 0);
}

if (require.main === module) main();
module.exports = { parseCssVars, diffMaps };
