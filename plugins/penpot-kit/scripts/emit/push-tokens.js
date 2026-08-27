#!/usr/bin/env node
// penpot-kit code -> design token planner.
//
//   node scripts/emit/push-tokens.js --tokens src/design/tokens.json --ir .penpot/ir.json \
//        [--set Global] [--out .penpot/plan.json]
//
// Reads W3C DTCG tokens from code, diffs them against the design's current IR, and writes
// a PLAN. It never talks to Penpot itself — applying the plan is a separate, explicit step
// (scripts/penpot-apply-tokens.js), so you always see what will change before it changes.
//
// Tokens are the only thing that round-trips safely: flat, named, declarative data with no
// behaviour attached. Components carry event handlers, a11y semantics and state that have
// no representation in the design, so they are reported as drift, never pushed.

const fs = require("fs");

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : def;
}

// DTCG nests tokens as objects; leaves carry $value/$type. Flatten back to dotted names.
function flattenDtcg(node, prefix, out) {
  out = out || {};
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith("$")) continue;
    if (v && typeof v === "object" && "$value" in v) {
      out[prefix ? prefix + "." + k : k] = { value: v.$value, type: v.$type };
    } else if (v && typeof v === "object") {
      flattenDtcg(v, prefix ? prefix + "." + k : k, out);
    }
  }
  return out;
}

// Map DTCG $type back to a Penpot token type. Dimension is ambiguous, so fall back to the
// design's existing type for that name when we have it.
const PENPOT_TYPE = {
  color: "color", number: "opacity", fontWeight: "fontWeights",
  fontFamily: "fontFamilies", typography: "typography"
};

function main() {
  const tokensPath = arg("--tokens", "src/design/tokens.json");
  const irPath = arg("--ir", ".penpot/ir.json");
  const outPath = arg("--out", ".penpot/plan.json");
  const defaultSet = arg("--set", "Global");

  const code = flattenDtcg(JSON.parse(fs.readFileSync(tokensPath, "utf8")), "");
  const ir = JSON.parse(fs.readFileSync(irPath, "utf8"));

  // Index the design side by name. A name may exist in several sets (the alias layer).
  const design = {};
  for (const t of ir.tokens.values) {
    (design[t.name] = design[t.name] || []).push(t);
  }

  const plan = { generated: new Date().toISOString(), source: tokensPath, ops: [], skipped: [] };

  for (const [name, tok] of Object.entries(code)) {
    const existing = design[name];
    // Strip a px suffix that emitDtcg added, so we compare like with like.
    const raw = typeof tok.value === "string" ? tok.value.replace(/px$/, "") : tok.value;

    if (!existing) {
      plan.ops.push({
        op: "add", set: defaultSet, name,
        type: PENPOT_TYPE[tok.type] || "dimension",
        value: String(raw)
      });
      continue;
    }

    if (existing.length > 1) {
      // Alias-layer token: the same name lives in Light and Dark with different values.
      // A single flat file cannot say which set is meant, so refuse rather than guess.
      plan.skipped.push({
        name,
        reason: "declared in " + existing.length + " sets (" +
                existing.map((e) => e.set).join(", ") +
                ") — ambiguous target, edit in Penpot or split the token file per theme"
      });
      continue;
    }

    const cur = existing[0];
    if (String(cur.value) !== String(raw)) {
      plan.ops.push({
        op: "update", set: cur.set, name,
        type: cur.type, from: String(cur.value), value: String(raw)
      });
    }
  }

  // Tokens in the design that code has dropped. Report, never delete.
  for (const name of Object.keys(design)) {
    if (!(name in code)) {
      plan.skipped.push({ name, reason: "present in design, absent from code — not deleted" });
    }
  }

  plan.summary = {
    add: plan.ops.filter((o) => o.op === "add").length,
    update: plan.ops.filter((o) => o.op === "update").length,
    skipped: plan.skipped.length
  };

  fs.mkdirSync(require("path").dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(plan, null, 2) + "\n");

  console.log("Token push plan -> " + outPath);
  console.log("  add:     " + plan.summary.add);
  console.log("  update:  " + plan.summary.update);
  console.log("  skipped: " + plan.summary.skipped);
  plan.ops.slice(0, 15).forEach((o) =>
    console.log("    " + o.op + "  " + o.set + "/" + o.name +
      (o.from ? "  " + o.from + " -> " + o.value : "  = " + o.value)));
  if (plan.ops.length > 15) console.log("    ... and " + (plan.ops.length - 15) + " more");
  if (!plan.ops.length) console.log("  design already matches code");
}

if (require.main === module) main();
module.exports = { flattenDtcg };
