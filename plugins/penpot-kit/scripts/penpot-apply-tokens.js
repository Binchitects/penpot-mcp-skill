// penpot-kit: apply a token push plan to the connected Penpot file.
//
// Pass this to the Penpot MCP `execute_code` tool AFTER setting `storage.plan` to the
// contents of .penpot/plan.json (produced by scripts/emit/push-tokens.js).
//
// This is the ONLY script in penpot-kit that writes to the design from code. It applies
// exactly the ops in the plan and nothing else: no deletions, no inferred changes. If the
// plan is empty it is a no-op.

if (!storage.plan || !Array.isArray(storage.plan.ops)) {
  return "No plan found. Set storage.plan to the contents of .penpot/plan.json first.";
}

const cat = penpot.library.local.tokens;
const applied = [];
const failed = [];

for (const op of storage.plan.ops) {
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
      // `value` is writable on a Token, so this updates in place and preserves any
      // bindings shapes already have to this token.
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

// Token writes are asynchronous; give them a moment before reporting resolved state.
await new Promise((r) => setTimeout(r, 500));

return {
  applied: applied.length,
  failed: failed.length,
  details: applied.slice(0, 20),
  errors: failed,
  note: failed.length
    ? "Some ops failed. A 'path' error means the token name is both a leaf and a prefix."
    : "All planned ops applied. Re-run /penpot:sync to refresh the manifest and IR."
};
