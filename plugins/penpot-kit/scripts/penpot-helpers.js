// penpot-kit helper library.
// Pass this whole file to the Penpot MCP `execute_code` tool ONCE per session.
// It installs `pk` into `storage`, so later calls are one line: `return storage.pk.summary();`
//
// Design rule: every helper returns a PROJECTION (short strings / small objects),
// never a raw Penpot object. Raw shapes and pages serialise enormously.

const pk = {};
pk.version = "1.0.0";

// ---------- pages ----------

// Non-empty pages only, as "Name:childCount". Replaces a ~2500-token getPages() dump.
pk.pages = () => penpotUtils.getPages()
  .map(p => {
    const pg = penpotUtils.getPageById(p.id);
    return { n: p.name, c: ((pg && pg.root && pg.root.children) || []).length };
  })
  .filter(x => x.c > 0)
  .map(x => x.n + ":" + x.c);

pk.allPages = () => penpotUtils.getPages().map(p => p.name);

pk.pageId = name => {
  const p = penpotUtils.getPageByName(name);
  return p ? p.id : null;
};

pk.open = name => {
  const p = penpotUtils.getPageByName(name);
  if (!p) return "no page: " + name;
  penpot.openPage(p);
  return penpot.currentPage.name;
};

// Shallow structure of a page or named shape.
pk.tree = (nameOrNull, depth) => {
  const root = nameOrNull
    ? (penpotUtils.getPageByName(nameOrNull) || {}).root || penpotUtils.findShape(s => s.name === nameOrNull)
    : penpot.root;
  if (!root) return "not found: " + nameOrNull;
  return penpotUtils.shapeStructure(root, depth || 2);
};

// ---------- tokens ----------

// set -> type -> [names]. Compact map of the whole token catalog.
pk.tokens = () => {
  const out = {};
  penpot.library.local.tokens.sets.forEach(s => {
    const byType = {};
    s.tokens.forEach(t => { (byType[t.type] = byType[t.type] || []).push(t.name); });
    out[s.name + (s.active ? "" : " (inactive)")] = byType;
  });
  return out;
};

// "set/name=resolved" lines, optionally filtered by regex string.
pk.tokenValues = filter => {
  const re = filter ? new RegExp(filter, "i") : null;
  return penpot.library.local.tokens.sets.flatMap(s =>
    s.tokens
      .filter(t => !re || re.test(t.name))
      .map(t => s.name + "/" + t.name + "=" + t.resolvedValue));
};

pk.themes = () => penpot.library.local.tokens.themes
  .map(t => t.group + "/" + t.name + (t.active ? " *" : ""));

pk.setTheme = name => {
  const cat = penpot.library.local.tokens;
  const t = cat.themes.find(x => x.name === name);
  if (!t) return "no theme: " + name;
  if (!t.active) t.toggleActive();
  return cat.themes.filter(x => x.active).map(x => x.name);
};

// Idempotent. Returns "created" | "exists" | "ERR: ...".
pk.addToken = (setName, type, name, value) => {
  const set = penpot.library.local.tokens.sets.find(s => s.name === setName);
  if (!set) return "no set: " + setName;
  if (set.tokens.find(t => t.name === name)) return "exists";
  try { set.addToken({ type, name, value }); return "created"; }
  catch (e) { return "ERR: " + e.message; }
};

// ---------- components ----------

// A variant group counts as ONE library component. Report its axes, not the
// first variant's props (which is what `variantProps` returns on the group).
pk.components = () => penpot.library.local.components.map(c => {
  const isV = typeof c.isVariant === "function" && c.isVariant();
  if (!isV) return c.name;
  try {
    const v = c.variants;
    return c.name + " [variants: " +
      v.properties.map(p => p + "=" + v.currentValues(p).join("|")).join("; ") + "]";
  } catch (e) { return c.name + " [variant group]"; }
});

// Axes and values for a variant container, plus any variant errors.
pk.variants = containerName => {
  const c = penpotUtils.findShape(s =>
    s.name === containerName &&
    typeof s.isVariantContainer === "function" && s.isVariantContainer());
  if (!c) return "no variant container: " + containerName;
  const v = c.variants;
  return {
    axes: v.properties.map(p => p + ": " + v.currentValues(p).join("|")),
    count: v.variantComponents().length,
    errors: v.variantComponents().map(x => x.variantError).filter(Boolean)
  };
};

// ---------- fonts ----------

// EXACT match. penpot.fonts.findByName is fuzzy and returns wrong families.
pk.font = exact => {
  const f = (penpot.fonts.all || [])
    .filter(x => x.name.toLowerCase() === String(exact).toLowerCase())[0];
  return f
    ? { id: f.fontId || f.id, name: f.name, weights: [...new Set(f.variants.map(v => v.fontWeight))] }
    : null;
};

pk.fonts = filter => {
  const re = new RegExp(filter, "i");
  return (penpot.fonts.all || []).filter(f => re.test(f.name)).map(f => f.name).slice(0, 40);
};

// ---------- shapes ----------

pk.find = name => {
  const s = penpotUtils.findShape(x => x.name === name);
  return s ? { id: s.id, type: s.type, w: Math.round(s.width), h: Math.round(s.height) } : null;
};

// Token bindings on a shape and its direct children - use to verify applyToken worked.
pk.bindings = name => {
  const s = penpotUtils.findShape(x => x.name === name);
  if (!s) return "not found: " + name;
  return {
    self: s.tokens || {},
    children: (s.children || []).map(c => ({ n: c.name, t: c.tokens || {} }))
  };
};

// ---------- summary / manifest ----------

pk.summary = () => ({
  file: penpot.currentFile ? penpot.currentFile.name : null,
  currentPage: penpot.currentPage ? penpot.currentPage.name : null,
  pagesWithContent: pk.pages(),
  totalPages: penpotUtils.getPages().length,
  components: penpot.library.local.components.length,
  themes: pk.themes(),
  tokenSets: penpot.library.local.tokens.sets
    .map(s => s.name + ":" + s.tokens.length + (s.active ? "" : " (inactive)"))
});

// Full payload for .penpot/manifest.json.
pk.manifest = () => ({
  generated: new Date().toISOString(),
  file: penpot.currentFile ? penpot.currentFile.name : null,
  pages: { total: penpotUtils.getPages().length, withContent: pk.pages() },
  themes: pk.themes(),
  tokens: pk.tokens(),
  components: pk.components()
});

// ---------- safe writes ----------

// Group a batch of mutations into ONE undo step.
//
// Without this, a 30-op token push is 30 separate undos for whoever is using the file.
// To you it was one action; to them it is thirty presses of ctrl+Z. Any tool writing to a
// shared design MUST group its writes, or it quietly degrades someone else's ability to
// back out of your change.
//
//   const r = await pk.tx("push tokens", () => { ...mutations...; return summary; });
pk.tx = async (label, fn) => {
  const id = penpot.history.undoBlockBegin();
  try {
    const result = await fn();
    return { ok: true, label: label, result: result };
  } catch (e) {
    return { ok: false, label: label, error: e.message };
  } finally {
    // finish in `finally` so a thrown mutation cannot leave the undo block open,
    // which would silently swallow every subsequent edit into the same step.
    penpot.history.undoBlockFinish(id);
  }
};

// Named checkpoint in the file's version history. Call BEFORE anything destructive so
// there is a labelled point to roll back to that does not depend on the undo stack.
pk.checkpoint = async (label) => {
  const f = penpot.currentFile;
  if (!f || typeof f.saveVersion !== "function") return "saveVersion unavailable";
  try { await f.saveVersion(label); return "saved: " + label; }
  catch (e) { return "ERR: " + e.message; }
};

// ---------- code connect (metadata stored IN the .penpot file) ----------

// Penpot can store arbitrary key/value data on a shape, persisted in the file itself.
// That makes it the right home for the design->code mapping: it travels with the design,
// every teammate sees it, and it needs no repo access. A repo-side config file can only
// be read by people who have the repo.
const CONNECT_KEY = "penpotKit.codeConnect";

pk.connectSet = (shapeName, info) => {
  const s = penpotUtils.findShape(x => x.name === shapeName);
  if (!s) return "not found: " + shapeName;
  s.setPluginData(CONNECT_KEY, JSON.stringify(info));
  return { shape: shapeName, stored: info };
};

pk.connectGet = (shapeName) => {
  const s = penpotUtils.findShape(x => x.name === shapeName);
  if (!s) return null;
  const raw = s.getPluginData(CONNECT_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return { malformed: raw }; }
};

// Every shape in the file carrying a code-connect record.
pk.connectAll = () => {
  const out = [];
  penpotUtils.getPages().forEach(p => {
    const pg = penpotUtils.getPageById(p.id);
    if (!pg || !pg.root) return;
    penpotUtils.findShapes(x => {
      try { return !!x.getPluginData(CONNECT_KEY); } catch (e) { return false; }
    }, pg.root).forEach(x => {
      let v = null;
      try { v = JSON.parse(x.getPluginData(CONNECT_KEY)); } catch (e) { v = { malformed: true }; }
      out.push({ page: p.name, shape: x.name, connect: v });
    });
  });
  return out;
};

storage.pk = pk;
return "pk v" + pk.version + " ready: " +
  Object.keys(pk).filter(k => typeof pk[k] === "function").join(", ");
