// penpot-kit: apply a token push plan to the connected Penpot file.
//
// Pass this to the Penpot MCP `execute_code` tool AFTER setting `storage.plan` to the
// contents of .penpot/plan.json (produced by scripts/emit/push-tokens.js).
//
// This is the ONLY script in penpot-kit that writes design data from code. It applies
// exactly the ops in the plan and nothing else: no deletions, no inferred changes.
//
// Two safety layers, both mandatory for a shared file:
//   1. A named version checkpoint, so there is a labelled rollback point.
//   2. A single undo block, so the whole batch is ONE ctrl+Z for whoever is in the file
//      rather than one per token.

if (!storage.plan || !Array.isArray(storage.plan.ops)) {
  return "No plan found. Set storage.plan to the contents of .penpot/plan.json first.";
}
if (!storage.pk || typeof storage.pk.tx !== "function") {
  return "Helpers not loaded. Inject scripts/penpot-helpers.js first (it provides pk.tx).";
}

const ops = storage.plan.ops;
if (!ops.length) return { applied: 0, failed: 0, note: "Plan is empty; nothing to do." };

const cat = penpot.library.local.tokens;
const applied = [];
const failed = [];

// Checkpoint first — before the undo block, so the version marks the pre-change state.
const checkpoint = await storage.pk.checkpoint(
  "penpot-kit: before token push (" + ops.length + " ops)"
);

const tx = await storage.pk.tx("penpot-kit token push", () => {
  for (const op of ops) {
    const set = cat.sets.find((s) => s.name === op.set);
    if (!set) { failed.push(op.name + ": no such set '" + op.set + "'"); continue; }

    const existing = set.tokens.find((t) => t.name === op.name);

    try {
      if (op.op === "add") {
        if (existing) { applied.push("exists  " + op.set + "/" + op.name); continue; }
        set.addToken({ type: op.type, name: op.name, value: op.value });
        applied.push("added   " + op.set + "/" + op.name + " = " + op.value);

      } else if (op.op === "update") {
        if (!existing) { failed.push(op.name + ": not present, cannot update"); continue; }
        // `value` is writable, so this updates in place and preserves every binding
        // shapes already have to this token.
        existing.value = op.value;
        applied.push("updated " + op.set + "/" + op.name + " = " + op.value);

      } else {
        failed.push(op.name + ": unknown op '" + op.op + "'");
      }
    } catch (e) {
      // Most common cause: the name collides with an existing path prefix.
      failed.push(op.set + "/" + op.name + ": " + e.message);
    }
  }
  return applied.length;
});

// Token writes are asynchronous; let them settle before reporting.
await new Promise((r) => setTimeout(r, 500));

return {
  checkpoint: checkpoint,
  undoGrouped: tx.ok,
  applied: applied.length,
  failed: failed.length,
  details: applied.slice(0, 20),
  errors: failed,
  note: failed.length
    ? "Some ops failed. A 'path' error means the token name is both a leaf and a prefix."
    : "All planned ops applied as ONE undo step. Re-extract to refresh the manifest and IR."
};
