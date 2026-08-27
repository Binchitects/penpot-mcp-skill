#!/usr/bin/env node
// Validate Penpot execute_code scripts.
//
// `node --check` is WRONG for these files: the Penpot plugin host evaluates them as the
// body of an ASYNC function, so top-level `await` and top-level `return` are both legal.
// We parse them the same way the host does, without executing.

const fs = require("fs");
const vm = require("vm");

let bad = 0;
for (const f of process.argv.slice(2)) {
  const src = fs.readFileSync(f, "utf8");
  try {
    new vm.Script("(async function(){\n" + src + "\n})", { filename: f });
    console.log("  ok     " + f);
  } catch (e) {
    bad++;
    console.log("  FAIL   " + f + "  -> " + e.message);
  }
}
process.exit(bad ? 1 : 0);
