// penpot-kit React + TypeScript emitter.
//
// Split out of index.js because it is the only emitter that has to reason about component
// STRUCTURE rather than a flat token list, and structure is where the sharp edges live.

const trackCss = (t) => {
  if (!t) return "auto";
  if (t.type === "flex") return (t.value || 1) + "fr";
  if (t.type === "fixed") return (t.value || 0) + "px";
  if (t.type === "percent") return (t.value || 0) + "%";
  return "auto";
};

function makeEmitReact(helpers) {
  const { varName, kebab, pascal, banner } = helpers;

  // CSS classes are kebab-case; JS identifiers must NOT be. `field-label` parses as
  // `field - label` and the generated component does not compile.
  const camel = (s) => kebab(s).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

  // An axis whose values are just yes/no or true/false is a boolean in code, not a
  // string union. `disabled="yes"` is not an API anyone wants to call.
  const BOOLY = [["no", "yes"], ["false", "true"], ["off", "on"]];
  const isBool = (vals) => {
    if (vals.length !== 2) return false;
    const low = vals.map((v) => String(v).toLowerCase()).sort();
    return BOOLY.some((pair) => pair[0] === low[0] && pair[1] === low[1]);
  };
  const truthy = (vals) => vals.find((v) => /^(yes|true|on)$/i.test(v));

  // `connect` is the optional .penpot/connect.json:
  //   { "components": { "Button": { "defaults": { "Size": "Medium" } } } }
  return function emitReact(ir, comp, connect, nameOverride) {
    // A design system can legitimately hold two components with the SAME name -- a Web
    // Avatar and an Android Avatar, for example. Both would generate Avatar.tsx and one
    // would silently overwrite the other. The caller resolves collisions and passes an
    // explicit name; `connect.name` lets the design itself decide.
    const Name = pascal(nameOverride || comp.name);
    const base = kebab(Name);
    const axes = Object.entries(comp.axes);

    // Precedence: metadata stored in the .penpot file wins over a repo-side connect.json,
    // because the in-file record is the one the whole team can see and edit.
    const fromRepo = ((connect || {}).components || {})[comp.name] || {};
    const inFile = comp.connect || {};
    const configured = Object.assign({}, fromRepo, inFile);
    const wanted = configured.defaults || fromRepo.defaults || {};

    const tokenOf = (sv) => {
      if (!sv) return null;
      return sv.t ? "var(" + varName(sv.t) + ")" : String(sv.v);
    };

    const first = comp.variants[0];

    // A component may legitimately have NO text: a Switch is a track plus a thumb. An
    // earlier version dereferenced .text.fontFamily unconditionally and crashed the whole
    // codegen run on the first such component.
    const textNodes = first.texts && first.texts.length
      ? first.texts
      : (first.text ? [{ name: "Label", text: first.text }] : []);
    const primaryText = textNodes.length ? textNodes[0].text : null;
    const multi = textNodes.length > 1;

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
      ? "\n" + textNodes.map((t) =>
          "  /** \"" + t.name + "\" text slot from the design */\n" +
          "  " + camel(t.name) + "?: ReactNode;").join("\n")
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
      ? "{ " + defaults + ", " + textNodes.map((t) => camel(t.name)).join(", ") +
        ", className, children, ...rest }"
      : "{ " + defaults + ", className, children, ...rest }";

    // Multi-part components expose each named text node as a slot prop, so callers fill
    // them instead of inheriting the designer's placeholder copy.
    const body = multi
      ? textNodes.map((t) =>
          "      <span className={" + JSON.stringify(base + "__" + kebab(t.name)) + "}>" +
          "{" + camel(t.name) + " ?? " + JSON.stringify(t.text.characters) + "}</span>"
        ).join("\n")
      : (primaryText
          ? "      {children ?? " + JSON.stringify(primaryText.characters) + "}"
          : "      {children}");

    // Our generated props must not collide with the DOM attributes we extend. A text node
    // named "Title" becomes `title?: ReactNode`, but HTMLAttributes already declares
    // `title?: string` (the tooltip attribute), and TS rejects the whole interface:
    //   Interface 'CardProps' incorrectly extends 'HTMLAttributes<HTMLDivElement>'
    // Omit every name we generate, so the component's own API always wins.
    const ownProps = axes.map(([axis]) => camel(axis))
      .concat(multi ? textNodes.map((t) => camel(t.name)) : []);
    const baseType = attrType + "<" + domType + ">";
    const extendsType = ownProps.length
      ? "Omit<" + baseType + ", " + ownProps.map((p) => JSON.stringify(p)).join(" | ") + ">"
      : baseType;

    const imports = multi
      ? 'import type { ' + attrType + ', ReactNode } from "react";'
      : 'import type { ' + attrType + ' } from "react";';

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

    // ----- CSS -----
    let css = banner("component css") + "\n." + base + " {\n";

    const L = first.layout;
    if (L && L.kind === "grid") {
      // Returning null for grid (an earlier bug) dropped the entire layout of every
      // grid-based component: the CSS looked plausible and positioned nothing.
      css += "  display: grid;\n";
      if (L.rows && L.rows.length) {
        css += "  grid-template-rows: " + L.rows.map(trackCss).join(" ") + ";\n";
      }
      if (L.columns && L.columns.length) {
        css += "  grid-template-columns: " + L.columns.map(trackCss).join(" ") + ";\n";
      }
      if (L.rowGap || L.columnGap) {
        css += "  gap: " + (L.rowGap || 0) + "px " + (L.columnGap || 0) + "px;\n";
      }
    } else if (L && L.kind === "flex") {
      css += "  display: " + (isButton ? "inline-flex" : "flex") + ";\n";
      css += "  flex-direction: " + (L.dir === "column" ? "column" : "row") + ";\n";
      if (L.alignItems) css += "  align-items: " + L.alignItems + ";\n";
      if (L.justifyContent) css += "  justify-content: " + L.justifyContent + ";\n";
      if (L.rowGap || L.columnGap) {
        css += "  gap: " + (L.rowGap || 0) + "px " + (L.columnGap || 0) + "px;\n";
      }
    } else {
      css += "  position: relative;\n";
    }

    if (L && L.padding) {
      const pd = L.padding;
      css += "  padding: " + (pd.top || 0) + "px " + (pd.right || 0) + "px " +
             (pd.bottom || 0) + "px " + (pd.left || 0) + "px;\n";
    }
    if (isButton) css += "  border: 0;\n  cursor: pointer;\n  white-space: nowrap;\n";
    if (primaryText) {
      css += "  font-family: " + JSON.stringify(primaryText.fontFamily) + ", system-ui, sans-serif;\n";
      css += "  font-weight: " + primaryText.fontWeight + ";\n";
      css += "  line-height: " + primaryText.lineHeight + ";\n";
    }
    // Without a layout, or with fixed horizontal sizing, the component has no intrinsic
    // width in CSS and collapses to zero. A Switch is a track and a thumb: it renders
    // nothing unless its box size is carried across.
    const fixedWidth = !L || (L.sizing && L.sizing.h === "fix");
    if (fixedWidth && first.box && first.box.width) {
      css += "  width: " + first.box.width + "px;\n";
    }
    if (!L && first.box && first.box.height) {
      css += "  height: " + first.box.height + "px;\n";
    }
    // Base appearance on the ROOT class, always.
    //
    // Appearance used to be emitted only in the non-size axis loop, so a component whose
    // ONLY axis is Size (an Avatar, say) got no background and no colour whatsoever -- it
    // rendered as bare text. Axis rules below still override this; this is the floor.
    if (first.box && first.box.fill) {
      css += "  background: " + tokenOf(first.box.fill) + ";\n";
    }
    if (primaryText && primaryText.color) {
      css += "  color: " + tokenOf(primaryText.color) + ";\n";
    }
    if (first.box && first.box.stroke) {
      css += "  border: " + tokenOf(first.box.stroke.width) + " solid " +
             tokenOf(first.box.stroke.color) + ";\n";
    }
    if (first.box && first.box.radius) {
      css += "  border-radius: " + tokenOf(first.box.radius) + ";\n";
    }
    if (first.box && first.box.shadow) {
      const sh = first.box.shadow;
      css += "  box-shadow: " + (sh.offsetX || 0) + "px " + (sh.offsetY || 0) + "px " +
             (sh.blur || 0) + "px " + (sh.spread || 0) + "px " + (sh.color || "#000000") + ";\n";
    }
    css += "}\n";

    if (multi) {
      textNodes.forEach((t) => {
        css += "\n." + base + "__" + kebab(t.name) + " {\n" +
          "  font-size: " + t.text.fontSize + "px;\n" +
          "  font-weight: " + t.text.fontWeight + ";\n" +
          "  color: " + tokenOf(t.text.color) + ";\n}\n";
      });
    }

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
