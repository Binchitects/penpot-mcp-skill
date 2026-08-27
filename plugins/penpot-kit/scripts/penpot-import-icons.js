// penpot-kit: import an SVG icon set from code into the connected Penpot file.
//
// Pass this to `execute_code` AFTER setting `storage.iconPlan` to the contents of
// .penpot/icons.json (produced by scripts/emit/plan-icons.js), and after injecting
// scripts/penpot-helpers.js (needed for pk.tx / pk.checkpoint).
//
// Writes are wrapped in a version checkpoint and a single undo block, so the whole import
// is ONE ctrl+Z for whoever else is in the file.

if (!storage.iconPlan || !Array.isArray(storage.iconPlan.icons)) {
  return "No plan. Set storage.iconPlan to the contents of .penpot/icons.json first.";
}
if (!storage.pk || typeof storage.pk.tx !== "function") {
  return "Helpers not loaded. Inject scripts/penpot-helpers.js first.";
}

const plan = storage.iconPlan;
const icons = plan.icons;
if (!icons.length) return { imported: 0, note: "Plan contains no icons." };

// Target page must already exist — creating pages is out of scope for an import.
const page = penpotUtils.getPageByName(plan.page);
if (!page) {
  return "No page named '" + plan.page + "'. Create it in Penpot first, or re-plan with --page.";
}
penpot.openPage(page);

const lib = penpot.library.local;
const existing = new Set(lib.components.map((c) => c.name));

const COLS = 10;
const CELL = 56;
const imported = [];
const skipped = [];
const failed = [];

// NOTE: never write the character sequence  import  followed by  (  anywhere in a script
// sent to execute_code, INCLUDING inside a string. Penpot runs under SES, whose censor
// scans raw source text for dynamic-import expressions and rejects the whole script with
// SES_IMPORT_REJECTED. Even a human-readable label is enough to trip it, so keep the
// word well away from any opening parenthesis. This comment deliberately does not
// reproduce the offending sequence, because this file is itself sent to execute_code.
const checkpoint = await storage.pk.checkpoint(
  "penpot-kit: before icon load of " + icons.length + " icons"
);

const tx = await storage.pk.tx("penpot-kit icon import", () => {
  icons.forEach((icon, i) => {
    if (existing.has(icon.name)) { skipped.push(icon.name + " (component exists)"); return; }
    try {
      const shape = penpot.createShapeFromSvg(icon.svg);
      if (!shape) { failed.push(icon.name + ": createShapeFromSvg returned nothing"); return; }

      shape.name = icon.name;
      shape.x = (i % COLS) * CELL;
      shape.y = Math.floor(i / COLS) * CELL;

      const comp = lib.createComponent([shape]);
      comp.name = "Icon / " + icon.name;

      // Record where this icon came from, in the file itself, so the design knows its
      // source of truth is the repo and a re-import can be reconciled later.
      try {
        shape.setPluginData("penpotKit.codeConnect",
          JSON.stringify({ path: icon.source, kind: "icon", importedFrom: plan.dir }));
      } catch (e) { /* metadata is best-effort; the icon itself still imported */ }

      imported.push(icon.name);
    } catch (e) {
      failed.push(icon.name + ": " + e.message);
    }
  });
  return imported.length;
});

await new Promise((r) => setTimeout(r, 600));

return {
  checkpoint: checkpoint,
  undoGrouped: tx.ok,
  page: plan.page,
  imported: imported.length,
  skipped: skipped.length,
  failed: failed.length,
  sample: imported.slice(0, 12),
  skippedSample: skipped.slice(0, 8),
  errors: failed.slice(0, 8),
  note: "Imported as ONE undo step. Run /penpot:sync to refresh the manifest."
};
