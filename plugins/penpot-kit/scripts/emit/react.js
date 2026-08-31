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

    const first = comp.variants[0];
    const structure = comp.structure || null;

    // Text nodes in document order. Prefer the structural tree; fall back to the flat list
    // for IRs extracted before structure existed.
    const collect = (node, acc) => {
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

    const slotProps = multi
      ? "\n" + textNodes.map((t, i) =>
          "  /** \"" + t.name + "\" text slot from the design */\n" +
          "  " + slotNames[i] + "?: ReactNode;").join("\n")
      : "";

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

    const destructure = multi
      ? "{ " + defaults + ", " + slotNames.join(", ") + ", className, children, ...rest }"
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
        if (node.type === "text") {
          const fallback = JSON.stringify(node.text ? node.text.characters : "");
          if (multi) {
            const prop = slotNames[slotIdx++];
            return pad + '<span className="' + cls + '">{' + prop + " ?? " + fallback + "}</span>";
          }
          usedChildren = true;
          return pad + '<span className="' + cls + '">{children ?? ' + fallback + "}</span>";
        }
        const kids = (node.children || []).map((c) => render(c, depth + 1));
        if (!kids.length) return pad + '<div className="' + cls + '" />';
        return pad + '<div className="' + cls + '">\n' + kids.join("\n") + "\n" + pad + "</div>";
      };
      const rendered = structure.children.map((c) => render(c, 0)).join("\n");
      // A component with internals but no text (a Switch is a track plus a thumb) still
      // needs somewhere for callers to put content.
      body = (multi || usedChildren) ? rendered : rendered + "\n      {children}";
    } else {
      body = primaryText
        ? "      {children ?? " + JSON.stringify(primaryText.characters) + "}"
        : "      {children}";
    }

    const imports = multi
      ? 'import type { ' + attrType + ', ReactNode } from "react";'
      : 'import type { ' + attrType + ' } from "react";';

    // Generated props must not collide with the DOM attributes we extend. A text node named
    // "Title" becomes `title?: ReactNode` while HTMLAttributes declares `title?: string`,
    // and TS rejects the whole interface.
    const ownProps = axes.map(([axis]) => camel(axis)).concat(multi ? slotNames : []);
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
      "export interface " + Name + "Props extends " + extendsType + " {",
      axisProps + slotProps,
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

    // ---------------- axis modifiers ----------------
    const axisNames = axes.map((a) => a[0]);
    const sizeAxis = axisNames.find((a) => /size/i.test(a));
    const otherAxes = axisNames.filter((a) => a !== sizeAxis);

    if (sizeAxis) {
      (comp.axes[sizeAxis] || []).forEach((val) => {
        const v = comp.variants.find((x) => x.props && x.props[sizeAxis] === val);
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
        const v = comp.variants.find((x) => x.props && x.props[axis] === val);
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

    return { tsx: tsx, css: css, name: base, Name: Name };
  };
}

module.exports = { makeEmitReact, trackCss };
