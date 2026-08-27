#!/usr/bin/env node
// Validate Penpot execute_code scripts.
//
// Two checks, both of which `node --check` gets wrong:
//
// 1. PARSE CONTEXT. The Penpot plugin host evaluates these files as the body of an ASYNC
//    function, so top-level `await` and top-level `return` are both legal. `node --check`
//    parses them as a CommonJS module and rejects top-level await.
//
// 2. SES CENSOR. Penpot runs under SES, which scans RAW SOURCE TEXT for anything that
//    looks like a dynamic import expression and rejects the entire script with
//    SES_IMPORT_REJECTED. It does not care whether the match sits inside a string literal
//    or a comment -- a checkpoint label reading "before icon <word> (3 icons)" is enough
//    to kill the whole script.

const fs = require("fs");
const vm = require("vm");

// Built from char codes so this checker does not trip its own rule when it is read as
// data by another tool.
const FORBIDDEN = String.fromCharCode(105, 109, 112, 111, 114, 116);
const sesTrap = new RegExp("\\b" + FORBIDDEN + "\\s*\\(");

let bad = 0;
const files = process.argv.slice(2);

if (!files.length) {
  console.log("usage: node check-syntax.js <file.js> [...]");
  process.exit(2);
}

for (const f of files) {
  let src;
  try {
    src = fs.readFileSync(f, "utf8");
  } catch (e) {
    bad++;
    console.log("  MISSING " + f);
    continue;
  }

  const m = src.match(sesTrap);
  if (m) {
    const line = src.slice(0, m.index).split("\n").length;
    bad++;
    console.log("  SES    " + f + ":" + line +
      "  -> dynamic-import-looking sequence; SES rejects the WHOLE script, " +
      "even inside a string or comment");
    continue;
  }

  try {
    new vm.Script("(async function(){\n" + src + "\n})", { filename: f });
    console.log("  ok     " + f);
  } catch (e) {
    bad++;
    console.log("  FAIL   " + f + "  -> " + e.message);
  }
}

process.exit(bad ? 1 : 0);
