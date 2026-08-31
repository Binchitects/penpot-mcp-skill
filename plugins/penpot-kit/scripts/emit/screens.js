#!/usr/bin/env node
// penpot-kit screen emitter.
//
//   node scripts/emit/screens.js --screens .penpot/screens.json --ir .penpot/ir.json \
//                                --out src/screens --components ../design
//
// Turns extracted SCREENS into React pages that IMPORT the design system rather than
// inline it.
//
// A component instance in the design becomes a component call in the code:
//
//     { kind: "instance", component: "Button", props: { Appearance: "Primary" } }
//       ->  <Button appearance="primary" />
//
// It does NOT become the button's rendered geometry. That is the whole point of screens
// being separate from components: change the Button, and every screen follows.

"use strict";

const fs = require("fs");
const path = require("path");

function arg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const kebab = (s) => String(s)
  .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
  .replace(/[\s_.]+/g, "-")
  .toLowerCase();
const pascal = (s) => String(s)
  .replace(/[^a-zA-Z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""))
  .replace(/^(.)/, (m) => m.toUpperCase());
const camel = (s) => kebab(s).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
const varName = (n) => "--" + String(n).replace(/\./g, "-");

const BOOLY = [["no", "yes"], ["false", "true"], ["off", "on"]];
const isBool = (vals) => {
  if (!vals || vals.length !== 2) return false;
  const low = vals.map((v) => String(v).toLowerCase()).sort();
  return BOOLY.some((p) => p[0] === low[0] && p[1] === low[1]);
};
const truthy = (vals) => (vals || []).find((v) => /^(yes|true|on)$/i.test(v));

const tokenOf = (sv) => {
  if (!sv) return null;
  return sv.t ? "var(" + varName(sv.t) + ")" : (sv.v != null ? String(sv.v) : null);
};

// A screen's copy has to land on the right prop. When a component detected a repeated run
// and emitted an `items` array, the instance's text nodes are ITEM DATA, not slots -- so
// this mirrors the component emitter's list detection and builds a per-text PLAN saying,
// for each text node in document order, whether it is a slot or a field of item N.
function buildTextPlan(structure) {
  if (!structure) return null;
  const sigOf = (n) => n.type + ":" + n.name + "[" +
    (n.children || []).map(sigOf).join(",") + "]";
  const hasText = (n) => n.type === "text" || (n.children || []).some(hasText);

  const lists = new Map(), inList = new Set();
  (function detect(node) {
    const kids = node.children || [];
    let i = 0;
    while (i < kids.length) {
      const sig = sigOf(kids[i]);
      let j = i + 1;
      while (j < kids.length && sigOf(kids[j]) === sig) j++;
      if (j - i >= 2 && hasText(kids[i])) {
        const g = kids.slice(i, j);
        lists.set(kids[i], { group: g, template: kids[i] });
        g.forEach((x) => inList.add(x));
      }
      i = j;
    }
    kids.forEach(detect);
  })(structure);

  const textsIn = (n, acc) => {
    if (n.type === "text") acc.push(n);
    (n.children || []).forEach((c) => textsIn(c, acc));
    return acc;
  };

  const usedProp = {}, specs = new Map();
  lists.forEach((L, anchor) => {
    let prop = camel(L.template.name) + "s";
    usedProp[prop] = (usedProp[prop] || 0) + 1;
    if (usedProp[prop] > 1) prop = prop + usedProp[prop];
    const seen = {};
    const fields = textsIn(L.template, []).map((n) => {
      const b = camel(n.name);
      seen[b] = (seen[b] || 0) + 1;
      return seen[b] === 1 ? b : b + seen[b];
    });
    specs.set(anchor, { prop: prop, fields: fields, group: L.group });
  });

  const plan = [], slotSeen = {};
  (function walk(node) {
    (node.children || []).forEach((child) => {
      if (specs.has(child)) {
        const sp = specs.get(child);
        sp.group.forEach((g, gi) => {
          textsIn(g, []).forEach((t, fi) => {
            plan.push({ kind: "item", listProp: sp.prop, itemIndex: gi, field: sp.fields[fi] });
          });
        });
        return;
      }
      if (inList.has(child)) return;
      if (child.type === "text") {
        const b = camel(child.name);
        slotSeen[b] = (slotSeen[b] || 0) + 1;
        plan.push({ kind: "slot", prop: slotSeen[b] === 1 ? b : b + slotSeen[b] });
        return;
      }
      walk(child);
    });
  })(structure);

  return { plan: plan, hasLists: specs.size > 0 };
}

// Resolve component -> generated export name, mirroring the component emitter so the
// screen imports the file that actually exists.
function nameMap(ir) {
  const used = new Map();
  const map = {};
  (ir.components || []).forEach((c) => {
    let chosen = (c.connect && c.connect.name) || c.name;
    if (used.has(chosen)) {
      let cand = c.page && c.page !== used.get(chosen).page ? c.page + " " + chosen : null;
      if (!cand || used.has(cand)) {
        let n = 2;
        while (used.has(chosen + " " + n)) n++;
        cand = chosen + " " + n;
      }
      chosen = cand;
    }
    used.set(chosen, { page: c.page });
    if (!map[c.name]) {
      // A component with ONE text node renders {children}; only multi-text components
      // expose named slot props. Passing label={...} to a single-text component is a
      // type error, so the screen emitter has to know which shape it is dealing with.
      const first = (c.variants || [])[0] || {};
      const texts = (first.texts && first.texts.length)
        ? first.texts : (first.text ? [{ name: "Label" }] : []);
      // Slot prop names are deduplicated the same way the component emitter does it,
      // or a Nav's four `label` nodes would all collide on one prop.
      const seen = {};
      const slotNames = texts.map((t) => {
        const b = camel(t.name);
        seen[b] = (seen[b] || 0) + 1;
        return seen[b] === 1 ? b : b + seen[b];
      });
      const base = (c.variants || [])[0] || {};
      map[c.name] = {
        Name: pascal(chosen), axes: c.axes || {},
        multiText: texts.length > 1,
        slots: texts.map((t) => t.name),
        slotNames: slotNames,
        textPlan: buildTextPlan(base.structure || c.structure || null)
      };
    }
  });
  return map;
}

// A CSS class per structural box, named from the screen and the box's own name. Screens
// own their layout; components own their appearance.
function cssFor(screenBase, node, out) {
  if (node.kind !== "box") return;
  const cls = screenBase + "__" + kebab(node.name);
  let rule = "";
  const L = node.layout;
  if (L && L.kind === "grid") {
    rule += "  display: grid;\n";
    if (L.rows && L.rows.length) {
      rule += "  grid-template-rows: " + L.rows.map((t) =>
        t.type === "flex" ? (t.value || 1) + "fr" : "auto").join(" ") + ";\n";
    }
    if (L.columns && L.columns.length) {
      rule += "  grid-template-columns: " + L.columns.map((t) =>
        t.type === "flex" ? (t.value || 1) + "fr" : "auto").join(" ") + ";\n";
    }
  } else if (L && L.kind === "flex") {
    rule += "  display: flex;\n";
    rule += "  flex-direction: " + (L.dir === "column" ? "column" : "row") + ";\n";
    if (L.alignItems) rule += "  align-items: " + (L.alignItems === "start" ? "flex-start" :
      L.alignItems === "end" ? "flex-end" : L.alignItems) + ";\n";
    if (L.justifyContent) rule += "  justify-content: " + (L.justifyContent === "start" ? "flex-start" :
      L.justifyContent === "end" ? "flex-end" : L.justifyContent) + ";\n";
  }
  if (L && (L.rowGap || L.columnGap)) {
    rule += "  gap: " + (L.rowGap || 0) + "px " + (L.columnGap || 0) + "px;\n";
  }
  if (L && L.padding) {
    const p = L.padding;
    rule += "  padding: " + (p.top || 0) + "px " + (p.right || 0) + "px " +
            (p.bottom || 0) + "px " + (p.left || 0) + "px;\n";
  }
  if (node.box) {
    if (node.box.fill) rule += "  background: " + tokenOf(node.box.fill) + ";\n";
    if (node.box.stroke) {
      rule += "  border: " + tokenOf(node.box.stroke.width) + " solid " +
              tokenOf(node.box.stroke.color) + ";\n";
    }
    if (node.box.radius && node.box.radius.v) {
      rule += "  border-radius: " + tokenOf(node.box.radius) + ";\n";
    }
  }
  if (rule) out.push("." + cls + " {\n" + rule + "}\n");
  (node.children || []).forEach((c) => cssFor(screenBase, c, out));
}

function jsxFor(screenBase, node, map, depth, imports) {
  const pad = "  ".repeat(depth + 3);

  if (node.kind === "instance") {
    const entry = node.component ? map[node.component] : null;
    if (!entry) {
      return pad + "{/* unresolved instance: " + (node.component || node.name) + " */}";
    }
    imports.add(entry.Name);

    const props = [];
    Object.entries(node.props || {}).forEach(([axis, val]) => {
      const vals = entry.axes[axis];
      if (isBool(vals)) {
        if (val === truthy(vals)) props.push(camel(axis));
      } else {
        props.push(camel(axis) + '="' + kebab(val) + '"');
      }
    });

    // The screen's own copy overrides the component's placeholder text.
    const overrides = (node.texts || []).filter((t) => t.name && t.characters);

    if (!entry.multiText) {
      // Single-text component: its one label is `children`, not a prop.
      const only = overrides.find((t) => entry.slots.indexOf(t.name) > -1) || overrides[0];
      const open = "<" + entry.Name + (props.length ? " " + props.join(" ") : "");
      return only
        ? pad + open + ">" + escapeJsx(only.characters) + "</" + entry.Name + ">"
        : pad + open + " />";
    }

    // Match overrides to props BY POSITION. Where the component emitted an `items` array,
    // the screen's copy becomes array data rather than a numbered prop.
    const plan = entry.textPlan && entry.textPlan.plan;
    if (plan && plan.length) {
      const arrays = {};
      overrides.forEach((t, i) => {
        const step = plan[i];
        if (!step) return;
        if (step.kind === "slot") {
          props.push(step.prop + "={" + JSON.stringify(t.characters) + "}");
        } else {
          arrays[step.listProp] = arrays[step.listProp] || [];
          arrays[step.listProp][step.itemIndex] = arrays[step.listProp][step.itemIndex] || {};
          arrays[step.listProp][step.itemIndex][step.field] = t.characters;
        }
      });
      Object.keys(arrays).forEach((prop) => {
        props.push(prop + "={" + JSON.stringify(arrays[prop].filter(Boolean)) + "}");
      });
    } else {
      overrides.forEach((t, i) => {
        const prop = entry.slotNames[i];
        if (!prop) return;
        props.push(prop + "={" + JSON.stringify(t.characters) + "}");
      });
    }

    return pad + "<" + entry.Name + (props.length ? " " + props.join(" ") : "") + " />";
  }

  if (node.kind === "text") {
    const cls = screenBase + "__" + kebab(node.name);
    return pad + '<span className="' + cls + '">' + escapeJsx(node.text.characters) + "</span>";
  }

  const cls = screenBase + "__" + kebab(node.name);
  const kids = (node.children || []).map((c) => jsxFor(screenBase, c, map, depth + 1, imports));
  if (!kids.length) return pad + '<div className="' + cls + '" />';
  return pad + '<div className="' + cls + '">\n' + kids.join("\n") + "\n" + pad + "</div>";
}

const escapeJsx = (s) => String(s)
  .replace(/[{}]/g, (m) => "{'" + m + "'}")
  .replace(/</g, "&lt;").replace(/>/g, "&gt;");

function emitScreen(screen, map, componentsPath) {
  const Name = pascal(screen.name) + "Screen";
  const base = kebab(screen.name) + "-screen";
  const imports = new Set();

  const body = jsxFor(base, screen.root, map, 0, imports);

  const importLines = [...imports].sort().map((n) =>
    'import { ' + n + ' } from "' + componentsPath + "/" + n + '";').join("\n");

  const tsx = [
    "// GENERATED by penpot-kit from Penpot. Do not edit by hand.",
    "// Screen: " + screen.page + " / " + screen.name + "   route: " + screen.route,
    "//",
    "// Component instances in the design become component CALLS here, not inlined markup.",
    "// Change the component and this screen follows automatically.",
    'import "./' + base + '.css";',
    importLines,
    "",
    "export function " + Name + "() {",
    "  return (",
    body.replace(/^ {6}/, "    "),
    "  );",
    "}",
    ""
  ].filter((l) => l !== "").join("\n");

  const rules = [];
  cssFor(base, screen.root, rules);
  const css = "/* GENERATED by penpot-kit. Screen layout only — components own their own\n" +
    "   appearance. Regenerate: penpot-kit screens */\n\n" + rules.join("\n");

  return { Name, base, tsx, css };
}

function main() {
  const screensPath = arg("--screens", ".penpot/screens.json");
  const irPath = arg("--ir", ".penpot/ir.json");
  const outDir = path.resolve(arg("--out", "src/screens"));
  const componentsPath = arg("--components", "../design");

  for (const [label, p] of [["screens", screensPath], ["ir", irPath]]) {
    if (!fs.existsSync(p)) { console.error("penpot-kit screens: no " + label + " at " + p); process.exit(2); }
  }
  const data = JSON.parse(fs.readFileSync(screensPath, "utf8"));
  const ir = JSON.parse(fs.readFileSync(irPath, "utf8"));
  const map = nameMap(ir);

  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  const routes = [];

  for (const screen of data.screens || []) {
    const r = emitScreen(screen, map, componentsPath);
    fs.writeFileSync(path.join(outDir, r.Name + ".tsx"), r.tsx);
    fs.writeFileSync(path.join(outDir, r.base + ".css"), r.css);
    written.push(r.Name + ".tsx", r.base + ".css");
    routes.push({ Name: r.Name, route: screen.route, label: screen.name });
  }

  const routesTs = [
    "// GENERATED by penpot-kit from Penpot. Do not edit by hand.",
    routes.map((r) => 'import { ' + r.Name + ' } from "./' + r.Name + '";').join("\n"),
    "",
    "export const routes = [",
    routes.map((r) => "  { path: " + JSON.stringify(r.route) +
      ", label: " + JSON.stringify(r.label) +
      ", Component: " + r.Name + " }").join(",\n"),
    "] as const;",
    ""
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "routes.ts"), routesTs);
  written.push("routes.ts");

  console.log("Wrote " + (data.screens || []).length + " screen(s) to " + outDir + ":");
  written.forEach((f) => console.log("  " + f));

  const unresolved = new Set();
  (data.screens || []).forEach((s) =>
    Object.keys(s.uses || {}).forEach((u) => { if (!map[u]) unresolved.add(u); }));
  if (unresolved.size) {
    console.log("\nWARNINGS:");
    console.log("  screens reference components absent from the IR: " + [...unresolved].join(", "));
    console.log("  re-extract the component IR so these resolve.");
  }
}

if (require.main === module) main();
module.exports = { emitScreen, nameMap };
