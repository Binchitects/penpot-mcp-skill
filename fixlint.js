const fs=require("fs");
const p="plugins/penpot-kit/scripts/emit/lint.js"; let s=fs.readFileSync(p,"utf8");
let n=0;
const sub=(o,x)=>{ if(!s.includes(o)){console.error("MISS: "+o.slice(0,50));process.exit(1);} s=s.split(o).join(x); n++; };

// Normalise once: older IRs (and single-label components) carry `text`, not `texts`.
sub(`function lint(ir, config) {
  const S = buildScales(ir);`,
`// Older IRs -- and any single-label component -- carry \`text\` (singular) with no \`texts\`
// array. Reading only \`texts\` silently skipped every such variant, so the linter reported
// a clean system while checking none of it. Normalise before any rule runs.
function textsOf(v) {
  if (v.texts && v.texts.length) return v.texts;
  if (v.text) return [{ name: "Label", text: v.text }];
  return [];
}

function lint(ir, config) {
  const S = buildScales(ir);`);

sub("      (v.texts || []).forEach((t) => {", "      textsOf(v).forEach((t) => {");
sub("      (v.texts || []).forEach((t) => {\n        const x = t.text || {};", "      textsOf(v).forEach((t) => {\n        const x = t.text || {};");
sub("(v.variants || []).forEach((v) => {\n      (v.texts || []).forEach((t) => {",
    "(v.variants || []).forEach((v) => {\n      textsOf(v).forEach((t) => {");
sub("      if (!v.layout && (v.texts || []).length > 1) {\n        add(\"WARN\", \"no-layout\", tag, \"has \" + v.texts.length + \" text nodes but no layout system\");",
    "      if (!v.layout && textsOf(v).length > 1) {\n        add(\"WARN\", \"no-layout\", tag, \"has \" + textsOf(v).length + \" text nodes but no layout system\");");
fs.writeFileSync(p,s); console.log("lint.js: text/texts normalised ("+n+" edits)");
