#!/usr/bin/env node
// penpot-kit icon import planner (code -> design).
//
//   node scripts/emit/plan-icons.js --dir src/icons [--out .penpot/icons.json] [--page Icon] [--limit 200]
//
// Icons are the one component-shaped thing that round-trips losslessly from code into a
// design: they are pure geometry with no behaviour, no state and no a11y semantics. That
// is why this exists while general component push does not.
//
// Emits a plan. Importing is a separate explicit step (scripts/penpot-import-icons.js).

const fs = require("fs");
const path = require("path");

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : def;
}

const kebab = (s) => String(s)
  .replace(/\.svg$/i, "")
  .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
  .replace(/[\s_]+/g, "-")
  .toLowerCase();

function walk(dir, acc) {
  acc = acc || [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.svg$/i.test(entry.name)) acc.push(full);
  }
  return acc;
}

function main() {
  const dir = arg("--dir", "src/icons");
  const outPath = arg("--out", ".penpot/icons.json");
  const page = arg("--page", "Icon");
  const limit = parseInt(arg("--limit", "200"), 10);

  if (!fs.existsSync(dir)) {
    console.error("No such directory: " + dir);
    process.exit(2);
  }

  const files = walk(dir).sort();
  const icons = [];
  const skipped = [];

  for (const f of files.slice(0, limit)) {
    const svg = fs.readFileSync(f, "utf8").trim();

    // Reject anything that is not a self-contained static SVG. Scripts and external
    // references would either fail on import or drag remote dependencies into the design.
    if (!/^<svg[\s>]/i.test(svg)) { skipped.push({ file: f, reason: "does not start with <svg" }); continue; }
    if (/<script/i.test(svg)) { skipped.push({ file: f, reason: "contains <script>" }); continue; }
    if (/xlink:href\s*=\s*["']https?:/i.test(svg) || /<image[^>]+https?:/i.test(svg)) {
      skipped.push({ file: f, reason: "references a remote asset" });
      continue;
    }

    icons.push({
      name: kebab(path.basename(f)),
      source: path.relative(process.cwd(), f).replace(/\\/g, "/"),
      svg: svg
    });
  }

  const plan = {
    generated: new Date().toISOString(),
    page: page,
    dir: dir,
    count: icons.length,
    icons: icons,
    skipped: skipped
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(plan, null, 2) + "\n");

  console.log("Icon import plan -> " + outPath);
  console.log("  found:   " + files.length + " svg files in " + dir);
  console.log("  planned: " + icons.length + " -> page '" + page + "'");
  console.log("  skipped: " + skipped.length);
  skipped.slice(0, 10).forEach((s) => console.log("    " + s.file + "  (" + s.reason + ")"));
  if (files.length > limit) {
    console.log("  NOTE: limited to " + limit + " of " + files.length + "; raise with --limit");
  }
}

if (require.main === module) main();
module.exports = { kebab, walk };
