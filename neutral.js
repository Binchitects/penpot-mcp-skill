const fs=require("fs");
const edits = [
  ["plugins/penpot-kit/scripts/emit/drift.js",
   '"generated code is STALE — run /penpot:codegen"',
   '"generated code is STALE — regenerate (penpot-kit emit)"'],
  ["plugins/penpot-kit/scripts/emit/index.js",
   '"   Regenerate with /penpot:codegen   |   target: " + kind + " */\n"',
   '"   Regenerate: penpot-kit emit   |   target: " + kind + " */\n"'],
  ["plugins/penpot-kit/scripts/penpot-apply-tokens.js",
   '"All planned ops applied as ONE undo step. Re-run /penpot:sync to refresh manifest and IR."',
   '"All planned ops applied as ONE undo step. Re-extract to refresh the manifest and IR."'],
  ["plugins/penpot-kit/scripts/penpot-helpers.js",
   "// Full payload for .penpot/manifest.json - written by /penpot:sync.",
   "// Full payload for .penpot/manifest.json."],
  ["plugins/penpot-kit/scripts/penpot-import-icons.js",
   '"Imported as ONE undo step. Run /penpot:sync to refresh the manifest."',
   '"Imported as ONE undo step. Re-extract to refresh the manifest."']
];
let bad=0;
for (const [f,o,n] of edits) {
  const s=fs.readFileSync(f,"utf8");
  if(!s.includes(o)){ console.error("  MISS  "+f); bad++; continue; }
  fs.writeFileSync(f,s.replace(o,n));
  console.log("  neutral  "+f.split("/").pop());
}
process.exit(bad?1:0);
