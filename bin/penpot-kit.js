#!/usr/bin/env node
//
// penpot-kit CLI — the harness-agnostic core.
//
// Nothing here knows about Claude Code, Cursor, Cline or any other agent runtime. It is
// plain Node with zero dependencies, so it works anywhere Node runs: an agent shell, a CI
// job, a Makefile, or a human terminal.
//
// The one thing this CLI CANNOT do is talk to Penpot. Penpot is reached through its MCP
// server, which bridges to a browser plugin. So the split is:
//
//   * Anything that needs the live design  -> `penpot-kit script <name>` prints a script
//     for the host agent to pass to the Penpot MCP `execute_code` tool.
//   * Everything else (codegen, drift, planning, validation) -> runs right here.
//
// That boundary is what makes the tool portable: every harness already knows how to run a
// shell command and how to call an MCP tool.

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PAYLOAD = path.join(ROOT, "plugins", "penpot-kit");
const SCRIPTS = path.join(PAYLOAD, "scripts");
const DOCS = path.join(PAYLOAD, "skills", "penpot-api", "references");
const SKILLS = path.join(PAYLOAD, "skills");

const VERSION = (() => {
  try { return require(path.join(ROOT, "package.json")).version; }
  catch (e) { return "0.0.0"; }
})();

// Scripts meant for the Penpot MCP `execute_code` tool. These run INSIDE Penpot, not here.
const PENPOT_SCRIPTS = {
  helpers: "penpot-helpers.js",
  extract: "penpot-extract.js",
  audit: "penpot-audit.js",
  "apply-tokens": "penpot-apply-tokens.js",
  "import-icons": "penpot-import-icons.js",
  screens: "penpot-screens.js"
};

const DOC_FILES = {
  gotchas: path.join(DOCS, "gotchas.md"),
  tokens: path.join(DOCS, "tokens.md"),
  variants: path.join(DOCS, "variants.md"),
  api: path.join(SKILLS, "penpot-api", "SKILL.md"),
  codegen: path.join(SKILLS, "penpot-codegen", "SKILL.md")
};

function die(msg, code) {
  console.error("penpot-kit: " + msg);
  process.exit(code === undefined ? 2 : code);
}

// Delegate to one of the emit scripts.
//
// These run as a CHILD PROCESS rather than via require(). Each of them guards its entry
// point with `if (require.main === module)`, so requiring them from here would load the
// module and never run it -- the command would exit 0 having done nothing at all.
// Spawning also gives us their exit codes for free, which `drift` depends on for CI.
function delegate(rel, argv) {
  const target = path.join(SCRIPTS, rel);
  if (!fs.existsSync(target)) die("missing internal script: " + rel);
  const r = require("child_process").spawnSync(
    process.execPath, [target].concat(argv), { stdio: "inherit" }
  );
  if (r.error) die(r.error.message);
  process.exit(r.status === null ? 1 : r.status);
}

function usage() {
  console.log(`penpot-kit ${VERSION} — Penpot design-to-code, harness-agnostic

RUNS LOCALLY (no Penpot connection needed)
  emit          --ir <file> --out <dir> [--targets css,dtcg,tailwind,react] [--connect <file>]
                Generate code from an extracted IR. Deterministic: same IR, same bytes.
  drift         --ir <file> --out <dir> [--baseline <file>] [--json]
                Report divergence between design and generated code. Exits 1 when stale.
  lint          --ir <file> [--config .penpot/lint.json] [--max-warnings N] [--json]
                Check the design system for CONSISTENCY: off-scale spacing/radius/type,
                unbound or off-palette colours, naming drift. Exits 1 on errors.
  push-tokens   --tokens <dtcg.json> --ir <file> [--out .penpot/plan.json] [--set Global]
                Plan token changes from code back into the design. Writes a plan, applies nothing.
  plan-icons    --dir <svgDir> [--out .penpot/icons.json] [--page Icon] [--limit N]
                Scan an SVG directory into an import plan.
  validate      <outDir>
                Validate generated .tsx for invalid identifiers and broken emits.
  screens       --screens <file> --ir <file> --out <dir> [--components ../design]
                Emit React pages from extracted screens. Component instances become
                component CALLS, so screens follow the design system automatically.
  scaffold      --ir <file> --out <dir> [--name <app>]
                Generate a buildable Vite + React + TS app whose gallery renders every
                component at every axis value. If it compiles, the system is coherent.
  doctor        Self-check: payload present, scripts parse, SES trap clear.

NEEDS THE PENPOT MCP SERVER (prints a script for your agent to run)
  script <name>   Print a script to pass to the Penpot MCP 'execute_code' tool.
                  names: ${Object.keys(PENPOT_SCRIPTS).join(", ")}
  docs <name>     Print reference documentation.
                  names: ${Object.keys(DOC_FILES).join(", ")}

SET UP YOUR HARNESS
  rules --target <agents|cursor|cline|copilot|windsurf|zed|codex|all> [--out .]
                Write instruction files in the target harness's own convention.

EXAMPLES
  npx penpot-kit script extract | pbcopy        # then paste into execute_code
  npx penpot-kit emit --ir .penpot/ir.json --out src/design
  npx penpot-kit drift --ir .penpot/ir.json --out src/design   # exit 1 gates CI
  npx penpot-kit rules --target agents
`);
}

// ---------------------------------------------------------------- rules generation

function ruleBody() {
  // Deliberately short. A harness instruction file competes for context with everything
  // else the agent is doing, so it states the workflow and the traps, and points at
  // `penpot-kit docs` for the long-form reference rather than inlining it.
  return `# Penpot design system (penpot-kit)

Use these steps for any work involving the Penpot design file. They exist because the
Penpot Plugin API has several documented behaviours that fail SILENTLY.

## Workflow

1. If \`.penpot/manifest.json\` exists, READ IT FIRST. It describes the design system and is
   far cheaper than re-querying Penpot.
2. To run anything against the live design, get the script and pass its full contents to
   the Penpot MCP \`execute_code\` tool:
   - \`npx penpot-kit script helpers\` — installs \`pk\` into \`storage\` (run once per session)
   - \`npx penpot-kit script extract\` — builds the IR; save the result to \`.penpot/ir.json\`
   - \`npx penpot-kit script audit\` — lints the design for silent defects
3. Generate code locally (deterministic, never hand-written):
   \`npx penpot-kit emit --ir .penpot/ir.json --out src/design\`
4. Check for staleness: \`npx penpot-kit drift --ir .penpot/ir.json --out src/design\`

## Query discipline

Never return raw Penpot objects from \`execute_code\`. On a 71-page file, returning
\`penpotUtils.getPages()\` costs ~4,600 characters to answer a question whose real answer is
~46. Filter INSIDE the executed code and return a projection. Use the \`pk.*\` helpers.

## Traps that fail silently

- \`applyToken\` **toggles**: applying the same token to the same property twice UNBINDS it.
- Token names form a **path tree**: \`color.brand.background\` blocks \`color.brand.background.hover\`.
- An **inactive token set reports the ACTIVE set's** \`resolvedValue\`. Extracting all themes
  in one pass yields a silently wrong dark theme; activate each theme in turn.
- \`penpot.fonts.findByName\` is **fuzzy**: \`"Roboto"\` returns *Roboto Mono*. Match exactly
  against \`penpot.fonts.all\`.
- \`addTheme\` takes **one object**: \`addTheme({ group, name })\`, not two positional arguments.
- \`penpot.openPage\` is **async**, and you may only modify the **current** page. Await ~400ms
  after switching, or shapes land on the wrong page and writes throw.
- \`createComponent\` **wraps** its shape in a new board. Create all shapes first, componentise
  second, and pass \`component.mainInstance()\` to \`createVariantContainer\`.
- Never write the word \`import\` immediately followed by \`(\` anywhere in a script sent to
  \`execute_code\` — including inside a string or comment. Penpot runs under SES and rejects
  the whole script.

Full reference: \`npx penpot-kit docs gotchas\`
`;
}

const RULE_TARGETS = {
  agents:   { file: "AGENTS.md", note: "Codex, Amp, Jules, OpenHands and others read AGENTS.md" },
  cursor:   { file: path.join(".cursor", "rules", "penpot-kit.mdc"), note: "Cursor project rules",
              front: "---\ndescription: Penpot design system workflow\nalwaysApply: false\nglobs: [\"**/*.tsx\", \"**/*.css\", \".penpot/**\"]\n---\n\n" },
  cline:    { file: ".clinerules", note: "Cline / Roo Code" },
  copilot:  { file: path.join(".github", "copilot-instructions.md"), note: "GitHub Copilot" },
  windsurf: { file: ".windsurfrules", note: "Windsurf" },
  zed:      { file: ".rules", note: "Zed" },
  codex:    { file: "AGENTS.md", note: "Codex reads AGENTS.md" }
};

function writeRules(argv) {
  const target = argFlag(argv, "--target", "agents");
  const outDir = path.resolve(argFlag(argv, "--out", "."));
  const list = target === "all" ? Object.keys(RULE_TARGETS) : [target];

  const seen = new Set();
  const written = [];
  for (const t of list) {
    const spec = RULE_TARGETS[t];
    if (!spec) die("unknown --target '" + t + "'. Known: " + Object.keys(RULE_TARGETS).join(", ") + ", all");
    if (seen.has(spec.file)) continue;   // agents and codex share AGENTS.md
    seen.add(spec.file);

    const dest = path.join(outDir, spec.file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const body = (spec.front || "") + ruleBody();

    if (fs.existsSync(dest) && !argv.includes("--force")) {
      const existing = fs.readFileSync(dest, "utf8");
      if (existing.includes("penpot-kit")) {
        written.push("unchanged  " + spec.file + "  (already mentions penpot-kit)");
        continue;
      }
      // Append rather than clobber: these files usually already hold other instructions.
      fs.writeFileSync(dest, existing.replace(/\s*$/, "") + "\n\n" + ruleBody());
      written.push("appended   " + spec.file + "  (" + spec.note + ")");
      continue;
    }
    fs.writeFileSync(dest, body);
    written.push("wrote      " + spec.file + "  (" + spec.note + ")");
  }
  console.log("penpot-kit rules -> " + outDir);
  written.forEach((w) => console.log("  " + w));
  console.log("\nNext: make sure the Penpot MCP server is configured in your harness,");
  console.log("then run  npx penpot-kit script helpers  and pass the output to execute_code.");
}

function argFlag(argv, flag, def) {
  const i = argv.indexOf(flag);
  return i > -1 && argv[i + 1] ? argv[i + 1] : def;
}

// ---------------------------------------------------------------- doctor

function doctor() {
  let bad = 0;
  const ok = (label) => console.log("  ok    " + label);
  const fail = (label, why) => { bad++; console.log("  FAIL  " + label + (why ? "  -> " + why : "")); };

  console.log("penpot-kit " + VERSION + " self-check\n");

  console.log("payload:");
  fs.existsSync(SCRIPTS) ? ok("scripts/") : fail("scripts/", SCRIPTS + " missing");
  fs.existsSync(DOCS) ? ok("reference docs") : fail("reference docs", DOCS + " missing");

  console.log("\nnode emitters parse:");
  ["emit/index.js", "emit/react.js", "emit/drift.js", "emit/push-tokens.js",
   "emit/plan-icons.js", "emit/validate-output.js"].forEach((rel) => {
    const p = path.join(SCRIPTS, rel);
    if (!fs.existsSync(p)) return fail(rel, "missing");
    try { new (require("vm").Script)(fs.readFileSync(p, "utf8"), { filename: p }); ok(rel); }
    catch (e) { fail(rel, e.message); }
  });

  console.log("\npenpot scripts parse as async body, and are SES-clean:");
  const forbidden = new RegExp("\\b" + String.fromCharCode(105,109,112,111,114,116) + "\\s*\\(");
  Object.values(PENPOT_SCRIPTS).forEach((f) => {
    const p = path.join(SCRIPTS, f);
    if (!fs.existsSync(p)) return fail(f, "missing");
    const src = fs.readFileSync(p, "utf8");
    if (forbidden.test(src)) return fail(f, "contains a dynamic-import-looking sequence; SES will reject it");
    try { new (require("vm").Script)("(async function(){\n" + src + "\n})", { filename: p }); ok(f); }
    catch (e) { fail(f, e.message); }
  });

  console.log("\nnode: " + process.version);
  console.log(bad ? "\n" + bad + " problem(s) found." : "\nAll checks passed.");
  process.exit(bad ? 1 : 0);
}

// ---------------------------------------------------------------- dispatch

const [cmd, ...rest] = process.argv.slice(2);

switch (cmd) {
  case undefined:
  case "-h":
  case "--help":
  case "help":
    usage();
    break;

  case "-v":
  case "--version":
  case "version":
    console.log(VERSION);
    break;

  case "emit":
    delegate("emit/index.js", rest);
    break;

  case "drift":
    delegate("emit/drift.js", rest);
    break;

  case "lint":
    delegate("emit/lint.js", rest);
    break;

  case "scaffold":
    delegate("emit/scaffold.js", rest);
    break;

  case "screens":
    delegate("emit/screens.js", rest);
    break;

  case "push-tokens":
    delegate("emit/push-tokens.js", rest);
    break;

  case "plan-icons":
    delegate("emit/plan-icons.js", rest);
    break;

  case "validate":
    delegate("emit/validate-output.js", rest);
    break;

  case "fixture":
    delegate("emit/make-fixture.js", rest);
    break;

  case "script": {
    const name = rest[0];
    if (!name || !PENPOT_SCRIPTS[name]) {
      die("script <name> requires one of: " + Object.keys(PENPOT_SCRIPTS).join(", "));
    }
    process.stdout.write(fs.readFileSync(path.join(SCRIPTS, PENPOT_SCRIPTS[name]), "utf8"));
    break;
  }

  case "docs": {
    const name = rest[0];
    if (!name || !DOC_FILES[name]) {
      die("docs <name> requires one of: " + Object.keys(DOC_FILES).join(", "));
    }
    process.stdout.write(fs.readFileSync(DOC_FILES[name], "utf8"));
    break;
  }

  case "rules":
    writeRules(rest);
    break;

  case "doctor":
    doctor();
    break;

  default:
    die("unknown command '" + cmd + "'. Run 'penpot-kit --help'.");
}
