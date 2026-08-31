// penpot-kit React + TypeScript emitter.
//
// Split out of index.js because it is the only emitter that has to reason about component
// STRUCTURE rather than a flat token list, and structure is where the sharp edges live.
//
// When the IR carries `component.structure` (a node tree), the component renders as that
// tree: nested divs for boxes, spans for text. Without it, an earlier version emitted every
// text node as a flat list of sibling spans, which destroyed any component built from rows
// -- a Nav rendered as eight stacked labels instead of four rows, and a Tablist ran its
// labels together. Structure is not decoration; it IS the component.

const trackCss = (t) => {
  if (!t) return "auto";
  if (t.type === "flex") return (t.value || 1) + "fr";
  if (t.type === "fixed") return (t.value || 0) + "px";
  if (t.type === "percent") return (t.value || 0) + "%";
  return "auto";
};

const alignCss = (v) => (v === "start" ? "flex-start" : v === "end" ? "flex-end" : v);

function makeEmitReact(helpers) {
  const { varName, kebab, pascal, banner } = helpers;

  // CSS classes are kebab-case; JS identifiers must NOT be. `field-label` parses as
  // `field - label` and the generated component does not compile.
  const camel = (s) => kebab(s).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

  // An axis whose values are just yes/no or true/false is a boolean in code, not a string
  // union. `disabled="yes"` is not an API anyone wants to call.
  const BOOLY = [["no", "yes"], ["false", "true"], ["off", "on"]];
  const isBool = (vals) => {
    if (!vals || vals.length !== 2) return false;
    const low = vals.map((v) => String(v).toLowerCase()).sort();
    return BOOLY.some((pair) => pair[0] === low[0] && pair[1] === low[1]);
  };
  const truthy = (vals) => (vals || []).find((v) => /^(yes|true|on)$/i.test(v));

  return function emitReact(ir, comp, connect, nameOverride) {
    // Two components may legitimately share a name (a Web Avatar and an Android Avatar).
    // Both would generate Avatar.tsx and one would silently overwrite the other, so the
    // caller resolves collisions and passes an explicit name.
    const Name = pascal(nameOverride || comp.name);
    const base = kebab(Name);
    const axes = Object.entries(comp.axes || {});

    // Metadata stored in the .penpot file wins over a repo-side connect.json, because the
    // in-file record is the one the whole team can see and edit.
    const fromRepo = ((connect || {}).components || {})[comp.name] || {};
    const inFile = comp.connect || {};
    const configured = Object.assign({}, fromRepo, inFile);
    const wanted = configured.defaults || fromRepo.defaults || {};

    const tokenOf = (sv) => {
      if (!sv) return null;
      return sv.t ? "var(" + varName(sv.t) + ")" : String(sv.v);
    };

    // Which variant is the BASE matters. Taking variants[0] baked whichever state
    // happened to be first into every descendant -- a Field showed the Success state's
    // green border in every state, because the state axis only restyles the root while
    // the border lives on the inner control. Use the variant matching the DEFAULT axis
    // values, so the base rendering is the default state.
    const defaultProps = {};
    (Object.entries(comp.axes || {})).forEach(function (e) {
      const axis = e[0], vals = e[1];
      const w = (configured.defaults || fromRepo.defaults || {})[axis];
      defaultProps[axis] = (w && vals.indexOf(w) > -1) ? w : vals[0];
    });
    const matches = (v) => v.props && Object.keys(defaultProps)
      .every((k) => v.props[k] === defaultProps[k]);
    const first = comp.variants.find(matches) || comp.variants[0];

    // Looking a variant up by ONE axis value is ambiguous: a Switch with State=On has two
    // variants (Disabled No and Yes) and find() returns whichever comes first, so the "on"
    // rule inherited the DISABLED styling. Hold every other axis at its default.
    const variantFor = (axis, val) => {
      const want = Object.assign({}, defaultProps);
      want[axis] = val;
      return comp.variants.find((v) => v.props &&
               Object.keys(want).every((k) => v.props[k] === want[k]))
          || comp.variants.find((v) => v.props && v.props[axis] === val);
    };
    const structure = first.structure || comp.structure || null;

    // ---- repeated structure is a LIST, not numbered slots ----
    //
    // Four identical rows in a design mean a list. Emitting glyph/label/glyph2/label2/...
    // was the single worst thing this emitter did: not an API anyone would write, no key,
    // no way to render a fifth row. Detect a run of >= 2 sibling subtrees with the same
    // SHAPE (same names, same types, recursively) and emit an `items` prop instead.
    const sigOf = (n) => n.type + ":" + n.name + "[" +
      (n.children || []).map(sigOf).join(",") + "]";
    const hasText = (n) => n.type === "text" || (n.children || []).some(hasText);

    const lists = new Map();   // anchor node -> { group, template }
    const inList = new Set();  // every node a list consumed
    (function detect(node) {
      const kids = node.children || [];
      let i = 0;
      while (i < kids.length) {
        const sig = sigOf(kids[i]);
        let j = i + 1;
        while (j < kids.length && sigOf(kids[j]) === sig) j++;
        // A run needs text to be worth parameterising; a row of identical dividers is
        // structure, not data.
        if (j - i >= 2 && hasText(kids[i])) {
          const group = kids.slice(i, j);
          lists.set(kids[i], { group: group, template: kids[i] });
          group.forEach((g) => inList.add(g));
        }
        i = j;
      }
      kids.forEach(detect);
    })(structure || { children: [] });

    // Text nodes in document order. Prefer the structural tree; fall back to the flat list
    // for IRs extracted before structure existed.
    const collect = (node, acc) => {
      // Stop at a list item: its text is item DATA, not a component-level slot.
      if (inList.has(node)) return acc;
      if (node.type === "text" && node.text) acc.push({ name: node.name, text: node.text });
      (node.children || []).forEach((c) => collect(c, acc));
      return acc;
    };
    const textNodes = structure
      ? collect(structure, [])
      : (first.texts && first.texts.length
          ? first.texts
          : (first.text ? [{ name: "Label", text: first.text }] : []));

    const primaryText = textNodes.length ? textNodes[0].text : null;
    const multi = textNodes.length > 1;

    // Slot prop names must be UNIQUE. A Nav is four rows of Glyph + Label, so the raw names
    // repeat and the interface would declare `label` four times (TS2300).
    const slotNames = (function () {
      const seen = {};
      return textNodes.map(function (t) {
        const b = camel(t.name);
        seen[b] = (seen[b] || 0) + 1;
        return seen[b] === 1 ? b : b + seen[b];
      });
    })();

    // One `items` prop per detected list: a type, a prop name, its fields, and the data
    // the designer actually drew as the default.
    const constCase = (x) => x.replace(/([A-Z])/g, "_$1").toUpperCase();
    const listSpecs = [];
    (function () {
      const usedProp = {};
      lists.forEach(function (L, anchor) {
        const TypeName = Name + pascal(L.template.name);
        let prop = camel(L.template.name) + "s";
        usedProp[prop] = (usedProp[prop] || 0) + 1;
        if (usedProp[prop] > 1) prop = prop + usedProp[prop];

        const textsIn = (n, acc) => {
          if (n.type === "text") acc.push(n);
          (n.children || []).forEach((c) => textsIn(c, acc));
          return acc;
        };
        const seen = {};
        const fields = textsIn(L.template, []).map(function (n) {
          const b = camel(n.name);
          seen[b] = (seen[b] || 0) + 1;
          return { prop: seen[b] === 1 ? b : b + seen[b] };
        });

        const data = L.group.map(function (g) {
          const gt = textsIn(g, []);
          const o = {};
          fields.forEach(function (f, i) {
            o[f.prop] = gt[i] && gt[i].text ? gt[i].text.characters : "";
          });
          return o;
        });

        listSpecs.push({ anchor: anchor, TypeName: TypeName, prop: prop,
                         fields: fields, data: data, template: L.template,
                         group: L.group,
                         CONST: "DEFAULT_" + constCase(prop) });
      });
    })();
    const hasLists = listSpecs.length > 0;

    // Once rows are data, "which row is selected" is data too. A rule like
    //   .nav--selected .nav__item { background: ... }
    // highlights EVERY row, which is visibly wrong. Diff each axis variant against the
    // base and, where the difference lands inside a list item, turn it into a per-item
    // boolean field plus an item-level modifier class.
    const styleOf = (n) => {
      const b = n.box || {}, t = n.text || {};
      return [n.type === "text" ? tokenOf(t.color) : tokenOf(b.fill),
              n.type === "text" ? t.fontWeight : (b.stroke ? tokenOf(b.stroke.color) : "")].join("|");
    };
    const ruleFor = (bn, vn) => {
      let r = "";
      if (vn.type === "text") {
        const bt = bn.text || {}, vt = vn.text || {};
        if (vt.color && tokenOf(vt.color) !== tokenOf(bt.color)) r += "  color: " + tokenOf(vt.color) + ";\n";
        if (vt.fontWeight && vt.fontWeight !== bt.fontWeight) r += "  font-weight: " + vt.fontWeight + ";\n";
      } else {
        const bb = bn.box || {}, vb = vn.box || {};
        if (tokenOf(vb.fill) !== tokenOf(bb.fill)) {
          r += "  background: " + (vb.fill ? tokenOf(vb.fill) : "transparent") + ";\n";
        }
        const key = (x) => x ? tokenOf(x.color) + "/" + tokenOf(x.width) : "none";
        if (key(bb.stroke) !== key(vb.stroke)) {
          r += vb.stroke
            ? "  border: " + tokenOf(vb.stroke.width) + " solid " + tokenOf(vb.stroke.color) + ";\n"
            : "  border: 0;\n";
        }
      }
      return r;
    };
    const handledInList = new Set();   // node names the item pass already covers

    listSpecs.forEach((L) => { L.mods = []; });
    if (hasLists) {
      axes.forEach(([axis, vals]) => {
        const booly = isBool(vals);
        vals.forEach((val) => {
          if (booly && val !== truthy(vals)) return;
          const want = Object.assign({}, defaultProps); want[axis] = val;
          const v = comp.variants.find((x) => x.props &&
                      Object.keys(want).every((k) => x.props[k] === want[k]));
          if (!v || !v.structure || v === first) return;
          const modName = camel(val);
          listSpecs.forEach((L) => {
            // locate the same list in the variant tree by walking to the anchor's position
            const findGroup = (bn, vn) => {
              const bk = bn.children || [], vk = vn.children || [];
              if (bk.length !== vk.length) return null;
              for (let i = 0; i < bk.length; i++) {
                if (bk[i] === L.anchor) return vk.slice(i, i + L.group.length);
                const deep = findGroup(bk[i], vk[i]);
                if (deep) return deep;
              }
              return null;
            };
            const vGroup = findGroup(structure, v.structure);
            if (!vGroup) return;
            const rules = {};
            let anyIndex = -1;
            L.group.forEach((bItem, gi) => {
              const vItem = vGroup[gi];
              if (!vItem) return;
              const pair = (bn, vn) => {
                const r = ruleFor(bn, vn);
                if (r) {
                  const cls = base + "__" + kebab(bn.name);
                  if (!rules[cls]) rules[cls] = r;
                  handledInList.add(bn.name);
                  if (anyIndex < 0) anyIndex = gi;
                }
                const bk = bn.children || [], vk = vn.children || [];
                if (bk.length === vk.length) bk.forEach((c, i) => pair(c, vk[i]));
              };
              pair(bItem, vItem);
            });
            if (Object.keys(rules).length) {
              L.mods.push({ name: modName, rules: rules, index: anyIndex });
            }
          });
        });
      });
    }

    // Semantic element: a Button must render a <button>, not a <div>.
    const isButton = /button$/i.test(comp.name);
    const el = isButton ? "button" : "div";
    const domType = isButton ? "HTMLButtonElement" : "HTMLDivElement";
    const attrType = isButton ? "ButtonHTMLAttributes" : "HTMLAttributes";

    const types = axes.filter(([, vals]) => !isBool(vals)).map(([axis, vals]) =>
      "export type " + Name + pascal(axis) + " = " +
      vals.map((v) => JSON.stringify(kebab(v))).join(" | ") + ";"
    ).join("\n");

    const axisProps = axes.map(([axis, vals]) =>
      "  /** " + axis + " — mirrors the Penpot variant axis */\n" +
      "  " + camel(axis) + "?: " + (isBool(vals) ? "boolean" : Name + pascal(axis)) + ";"
    ).join("\n");

    const itemTypes = listSpecs.map((L) =>
      "export interface " + L.TypeName + " {" + "\n" +
      L.fields.map((f) => "  " + f.prop + "?: ReactNode;")
        .concat((L.mods || []).map((m) => "  " + m.name + "?: boolean;")).join("\n") + "\n}"
    ).join("\n\n");

    const itemDefaults = listSpecs.map((L) => {
      const data = L.data.map((row, i) => {
        const out = Object.assign({}, row);
        (L.mods || []).forEach((m) => { if (m.index === i) out[m.name] = true; });
        return out;
      });
      return "const " + L.CONST + ": " + L.TypeName + "[] = " +
             JSON.stringify(data, null, 2) + ";";
    }).join("\n\n");

    const itemsProps = listSpecs.map((L) =>
      "  /** Rows rendered by this component; defaults to the design's own content. */" + "\n" +
      "  " + L.prop + "?: " + L.TypeName + "[];").join("\n");

    const slotProps = multi
      ? "\n" + textNodes.map((t, i) =>
          "  /** \"" + t.name + "\" text slot from the design */\n" +
          "  " + slotNames[i] + "?: ReactNode;").join("\n")
      : "";

    const allSlotProps = [slotProps, hasLists ? "\n" + itemsProps : ""].join("");

    const defaults = axes.map(([axis, vals]) => {
      if (isBool(vals)) return camel(axis) + " = false";
      const want = wanted[axis];
      const chosen = want && vals.indexOf(want) > -1 ? want : vals[0];
      return camel(axis) + " = " + JSON.stringify(kebab(chosen));
    }).join(", ");

    const clsLines = axes.map(([axis, vals]) =>
      isBool(vals)
        ? "    " + camel(axis) + " && " + JSON.stringify(base + "--" + kebab(axis)) + ","
        : "    `" + base + "--${" + camel(axis) + "}`,"
    ).join("\n");

    const destructured = []
      .concat(multi ? slotNames : [])
      .concat(listSpecs.map((L) => L.prop));
    const destructure = destructured.length
      ? "{ " + defaults + ", " + destructured.join(", ") + ", className, children, ...rest }"
      : "{ " + defaults + ", className, children, ...rest }";

    // ---------------- body ----------------
    // Render the STRUCTURAL TREE so rows stay rows. Text nodes consume slot props in the
    // same document order the props were declared in.
    let body;
    if (structure && structure.children && structure.children.length) {
      let slotIdx = 0;
      let usedChildren = false;
      const render = (node, depth) => {
        const pad = "  ".repeat(depth + 3);
        const cls = base + "__" + kebab(node.name);

        // A detected run of identical siblings renders once, mapped over its data.
        if (lists.has(node)) {
          const L = listSpecs.find((x) => x.anchor === node);
          let fi = 0;
          const renderItem = (n, d, isRoot) => {
            const ipad = "  ".repeat(d + 3);
            const icls = base + "__" + kebab(n.name);
            if (n.type === "text") {
              const f = L.fields[fi++];
              return ipad + '<span className="' + icls + '">{item.' + f.prop + "}</span>";
            }
            const ik = (n.children || []).map((c) => renderItem(c, d + 1, false));
            const keyAttr = isRoot ? " key={i}" : "";
            // Per-item state is item DATA, so the modifier class is conditional per row.
            const mods = isRoot ? (L.mods || []) : [];
            const clsExpr = mods.length
              ? "{" + JSON.stringify(icls) +
                mods.map((m) => " + (item." + m.name + " ? " +
                  JSON.stringify(" " + icls + "--" + m.name) + " : \"\")").join("") + "}"
              : JSON.stringify(icls);
            if (!ik.length) return ipad + "<div" + keyAttr + " className=" + clsExpr + " />";
            return ipad + "<div" + keyAttr + " className=" + clsExpr + ">" + "\n" +
                   ik.join("\n") + "\n" + ipad + "</div>";
          };
          const inner = renderItem(L.template, depth + 2, true);
          return pad + "{(" + L.prop + " ?? " + L.CONST + ").map((item, i) => (" + "\n" +
                 inner + "\n" + pad + "))}";
        }
        // Siblings the list already accounted for.
        if (inList.has(node)) return null;

        if (node.type === "text") {
          const fallback = JSON.stringify(node.text ? node.text.characters : "");
          if (multi) {
            const prop = slotNames[slotIdx++];
            return pad + '<span className="' + cls + '">{' + prop + " ?? " + fallback + "}</span>";
          }
          usedChildren = true;
          return pad + '<span className="' + cls + '">{children ?? ' + fallback + "}</span>";
        }
        const kids = (node.children || []).map((c) => render(c, depth + 1)).filter(Boolean);
        if (!kids.length) return pad + '<div className="' + cls + '" />';
        return pad + '<div className="' + cls + '">\n' + kids.join("\n") + "\n" + pad + "</div>";
      };
      const rendered = structure.children.map((c) => render(c, 0)).filter(Boolean).join("\n");
      // A component with internals but no text (a Switch is a track plus a thumb) still
      // needs somewhere for callers to put content.
      body = (multi || usedChildren) ? rendered : rendered + "\n      {children}";
    } else {
      body = primaryText
        ? "      {children ?? " + JSON.stringify(primaryText.characters) + "}"
        : "      {children}";
    }

    const imports = (multi || hasLists)
      ? 'import type { ' + attrType + ', ReactNode } from "react";'
      : 'import type { ' + attrType + ' } from "react";';

    // Generated props must not collide with the DOM attributes we extend. A text node named
    // "Title" becomes `title?: ReactNode` while HTMLAttributes declares `title?: string`,
    // and TS rejects the whole interface.
    const ownProps = axes.map(([axis]) => camel(axis))
      .concat(multi ? slotNames : [])
      .concat(listSpecs.map((L) => L.prop));
    const baseType = attrType + "<" + domType + ">";
    const extendsType = ownProps.length
      ? "Omit<" + baseType + ", " + ownProps.map((p) => JSON.stringify(p)).join(" | ") + ">"
      : baseType;

    const tsx = [
      "// GENERATED by penpot-kit from Penpot. Do not edit by hand.",
      "// The prop types are derived from the Penpot variant axes — the design IS the signature.",
      (configured.path
        ? "// Design source: " + comp.page + " / " + comp.name + "  <->  " + configured.path
        : "// Design source: " + comp.page + " / " + comp.name),
      imports,
      'import "./' + base + '.css";',
      "",
      types,
      "",
      itemTypes,
      itemTypes ? "" : null,
      itemDefaults,
      itemDefaults ? "" : null,
      "export interface " + Name + "Props extends " + extendsType + " {",
      axisProps + allSlotProps,
      "}",
      "",
      "export function " + Name + "(" + destructure + ": " + Name + "Props) {",
      "  const cls = [",
      "    " + JSON.stringify(base) + ",",
      clsLines,
      "    className",
      '  ].filter(Boolean).join(" ");',
      "",
      "  return (",
      "    <" + el + " className={cls} {...rest}>",
      body,
      "    </" + el + ">",
      "  );",
      "}",
      ""
    ].join("\n");

    // ---------------- CSS ----------------

    // Layout + geometry for one node, shared by the root and every descendant.
    const layoutRules = (L, box, opts) => {
      opts = opts || {};
      let r = "";
      if (L && L.kind === "grid") {
        r += "  display: grid;\n";
        if (L.rows && L.rows.length) {
          r += "  grid-template-rows: " + L.rows.map(trackCss).join(" ") + ";\n";
        }
        if (L.columns && L.columns.length) {
          r += "  grid-template-columns: " + L.columns.map(trackCss).join(" ") + ";\n";
        }
      } else if (L && L.kind === "flex") {
        r += "  display: " + (opts.inline ? "inline-flex" : "flex") + ";\n";
        r += "  flex-direction: " + (L.dir === "column" ? "column" : "row") + ";\n";
        if (L.alignItems) r += "  align-items: " + alignCss(L.alignItems) + ";\n";
        if (L.justifyContent) r += "  justify-content: " + alignCss(L.justifyContent) + ";\n";
      }
      if (L && (L.rowGap || L.columnGap)) {
        r += "  gap: " + (L.rowGap || 0) + "px " + (L.columnGap || 0) + "px;\n";
      }
      if (L && L.padding) {
        const p = L.padding;
        r += "  padding: " + (p.top || 0) + "px " + (p.right || 0) + "px " +
             (p.bottom || 0) + "px " + (p.left || 0) + "px;\n";
      }
      if (box) {
        // Only pin a size when the node cannot derive it from content.
        const fixedW = !L || (L.sizing && L.sizing.h === "fix");
        const fixedH = !L || (L.sizing && L.sizing.v === "fix");
        if (fixedW && box.width) r += "  width: " + box.width + "px;\n";
        if (fixedH && box.height && opts.height !== false) r += "  height: " + box.height + "px;\n";
        if (box.fill) r += "  background: " + tokenOf(box.fill) + ";\n";
        if (box.stroke) {
          r += "  border: " + tokenOf(box.stroke.width) + " solid " +
               tokenOf(box.stroke.color) + ";\n";
        }
        if (box.radius && box.radius.v) r += "  border-radius: " + tokenOf(box.radius) + ";\n";
        if (box.shadow) {
          r += "  box-shadow: " + (box.shadow.offsetX || 0) + "px " + (box.shadow.offsetY || 0) +
               "px " + (box.shadow.blur || 0) + "px " + (box.shadow.spread || 0) + "px " +
               (box.shadow.color || "#000000") + ";\n";
        }
      }
      return r;
    };

    let css = banner("component css") + "\n." + base + " {\n";
    const rootLayout = (structure && structure.layout) || first.layout;
    css += layoutRules(rootLayout, null, { inline: isButton });
    if (!rootLayout) css += "  position: relative;\n";
    if (isButton) css += "  border: 0;\n  cursor: pointer;\n  white-space: nowrap;\n";
    if (primaryText) {
      css += "  font-family: " + JSON.stringify(primaryText.fontFamily) + ", system-ui, sans-serif;\n";
      css += "  font-weight: " + primaryText.fontWeight + ";\n";
      css += "  line-height: " + primaryText.lineHeight + ";\n";
    }

    const rootFixedW = !rootLayout || (rootLayout.sizing && rootLayout.sizing.h === "fix");
    if (rootFixedW && first.box && first.box.width) css += "  width: " + first.box.width + "px;\n";
    if (!rootLayout && first.box && first.box.height) css += "  height: " + first.box.height + "px;\n";

    // Base appearance on the ROOT class, always. Appearance used to be emitted only in the
    // non-size axis loop, so a component whose ONLY axis is Size got no colour at all.
    if (first.box && first.box.fill) css += "  background: " + tokenOf(first.box.fill) + ";\n";
    if (primaryText && primaryText.color) css += "  color: " + tokenOf(primaryText.color) + ";\n";
    if (first.box && first.box.stroke) {
      css += "  border: " + tokenOf(first.box.stroke.width) + " solid " +
             tokenOf(first.box.stroke.color) + ";\n";
    }
    if (first.box && first.box.radius) css += "  border-radius: " + tokenOf(first.box.radius) + ";\n";
    if (first.box && first.box.shadow) {
      const sh = first.box.shadow;
      css += "  box-shadow: " + (sh.offsetX || 0) + "px " + (sh.offsetY || 0) + "px " +
             (sh.blur || 0) + "px " + (sh.spread || 0) + "px " + (sh.color || "#000000") + ";\n";
    }
    css += "}\n";

    // One rule per DISTINCT descendant name. Four Nav items share a class because they
    // share styling; only their content differs, and that arrives through slot props.
    if (structure) {
      const emitted = new Set();
      const walk = (node) => {
        (node.children || []).forEach((child) => {
          const cls = base + "__" + kebab(child.name);
          if (!emitted.has(cls)) {
            emitted.add(cls);
            let rule = "";
            if (child.type === "text") {
              const t = child.text || {};
              if (t.fontSize) rule += "  font-size: " + t.fontSize + "px;\n";
              if (t.fontWeight) rule += "  font-weight: " + t.fontWeight + ";\n";
              if (t.color) rule += "  color: " + tokenOf(t.color) + ";\n";
              if (t.lineHeight) rule += "  line-height: " + t.lineHeight + ";\n";
            } else {
              rule += layoutRules(child.layout, child.box, {});
              if (child.type === "ellipse") rule += "  border-radius: 50%;\n";
            }
            if (rule) css += "\n." + cls + " {\n" + rule + "}\n";
          }
          walk(child);
        });
      };
      walk(structure);
    } else if (multi) {
      textNodes.forEach((t, i) => {
        css += "\n." + base + "__" + slotNames[i] + " {\n" +
          "  font-size: " + t.text.fontSize + "px;\n" +
          "  font-weight: " + t.text.fontWeight + ";\n" +
          "  color: " + tokenOf(t.text.color) + ";\n}\n";
      });
    }

    // Per-item modifier rules. The item root gets `.nav__item--selected`; anything deeper
    // is scoped under it, so only the selected ROW restyles rather than all of them.
    listSpecs.forEach((L) => {
      const rootCls = base + "__" + kebab(L.template.name);
      (L.mods || []).forEach((m) => {
        Object.keys(m.rules).forEach((cls) => {
          const sel = cls === rootCls
            ? "." + rootCls + "--" + m.name
            : "." + rootCls + "--" + m.name + " ." + cls;
          css += "\n" + sel + " {\n" + m.rules[cls] + "}\n";
        });
      });
    });

    // ---------------- axis modifiers ----------------
    const axisNames = axes.map((a) => a[0]);
    const sizeAxis = axisNames.find((a) => /size/i.test(a));
    const otherAxes = axisNames.filter((a) => a !== sizeAxis);

    if (sizeAxis) {
      (comp.axes[sizeAxis] || []).forEach((val) => {
        const v = variantFor(sizeAxis, val);
        if (!v) return;
        css += "\n." + base + "--" + kebab(val) + " {\n";
        if (v.box && v.box.height) css += "  height: " + v.box.height + "px;\n";
        if (v.box && v.box.paddingLeft) css += "  padding-inline: " + tokenOf(v.box.paddingLeft) + ";\n";
        const vt = (v.texts && v.texts.length) ? v.texts[0].text : v.text;
        if (vt) css += "  font-size: " + vt.fontSize + "px;\n";
        css += "}\n";
      });
    }

    otherAxes.forEach((axis) => {
      const vals = comp.axes[axis] || [];
      const booly = isBool(vals);
      vals.forEach((val) => {
        // For a boolean axis only the truthy value gets a class; the falsy state is the
        // component's base appearance and needs no modifier.
        if (booly && val !== truthy(vals)) return;
        const v = variantFor(axis, val);
        if (!v) return;
        const mod = booly ? kebab(axis) : kebab(val);
        css += "\n." + base + "--" + mod + " {\n";
        css += "  background: " + (v.box && v.box.fill ? tokenOf(v.box.fill) : "transparent") + ";\n";
        const vt = (v.texts && v.texts.length) ? v.texts[0].text : v.text;
        if (vt) css += "  color: " + tokenOf(vt.color) + ";\n";
        if (v.box && v.box.stroke) {
          css += "  border: " + tokenOf(v.box.stroke.width) + " solid " +
                 tokenOf(v.box.stroke.color) + ";\n";
        }
        if (v.box && typeof v.box.opacity === "number" && v.box.opacity < 1) {
          css += "  opacity: " + v.box.opacity + ";\n";
        }
        css += "}\n";
      });
    });

    // ---------------- descendant-targeted axis rules ----------------
    //
    // A state axis usually restyles something INSIDE the component, not the root: a
    // Field's border lives on its control, a Tablist's underline on its indicator. Root
    // rules can never reach those. Walk each variant's tree against the base tree and
    // emit only the properties that actually differ, scoped to the descendant:
    //
    //     .field--error .field__control { border: ... }
    //
    // Emitting the full descendant styling per variant instead would multiply the CSS and
    // bury the one thing that changed.
    if (structure) {
      const propsOf = (b, v, isText) => {
        let r = "";
        if (isText) {
          const bt = b.text || {}, vt = v.text || {};
          if (tokenOf(vt.color) !== tokenOf(bt.color) && vt.color) {
            r += "  color: " + tokenOf(vt.color) + ";\n";
          }
          if (vt.fontWeight && vt.fontWeight !== bt.fontWeight) {
            r += "  font-weight: " + vt.fontWeight + ";\n";
          }
          if (vt.fontSize && vt.fontSize !== bt.fontSize) {
            r += "  font-size: " + vt.fontSize + "px;\n";
          }
        } else {
          const bb = b.box || {}, vb = v.box || {};
          if (tokenOf(vb.fill) !== tokenOf(bb.fill)) {
            r += "  background: " + (vb.fill ? tokenOf(vb.fill) : "transparent") + ";\n";
          }
          const bs = bb.stroke, vs2 = vb.stroke;
          const key = (x) => x ? tokenOf(x.color) + "/" + tokenOf(x.width) : "none";
          if (key(bs) !== key(vs2)) {
            r += vs2
              ? "  border: " + tokenOf(vs2.width) + " solid " + tokenOf(vs2.color) + ";\n"
              : "  border: 0;\n";
          }
          if (typeof vb.opacity === "number" && vb.opacity !== bb.opacity) {
            r += "  opacity: " + vb.opacity + ";\n";
          }
        }
        return r;
      };

      // Walk two trees in lockstep. Variants of one component share a skeleton, so index
      // alignment is safe; bail out if it ever is not.
      const collectDiff = (baseNode, varNode, acc) => {
        const bk = baseNode.children || [], vk = varNode.children || [];
        if (bk.length !== vk.length) return;
        for (let i = 0; i < bk.length; i++) {
          const b = bk[i], v = vk[i];
          if (b.name !== v.name || b.type !== v.type) continue;
          // Anything the per-item pass already covers is per-ROW state, not component
          // state; emitting it again at component level would highlight every row.
          if (handledInList.has(b.name)) { collectDiff(b, v, acc); continue; }
          const cls = base + "__" + kebab(b.name);
          const rule = propsOf(b, v, b.type === "text");
          if (rule && !acc[cls]) acc[cls] = rule;   // first differing occurrence wins
          collectDiff(b, v, acc);
        }
      };

      axes.forEach(([axis, vals]) => {
        const booly = isBool(vals);
        vals.forEach((val) => {
          if (booly && val !== truthy(vals)) return;
          const v = variantFor(axis, val);
          if (!v || !v.structure || v === first) return;
          const acc = {};
          collectDiff(structure, v.structure, acc);
          const mod = booly ? kebab(axis) : kebab(val);
          Object.keys(acc).forEach((cls) => {
            css += "\n." + base + "--" + mod + " ." + cls + " {\n" + acc[cls] + "}\n";
          });
        });
      });
    }

    return { tsx: tsx, css: css, name: base, Name: Name };
  };
}

module.exports = { makeEmitReact, trackCss };
