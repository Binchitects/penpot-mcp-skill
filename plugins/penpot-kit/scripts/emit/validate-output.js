#!/usr/bin/env node
// Validate generated .tsx output.
//
//   node scripts/emit/validate-output.js <outDir>
//
// Exists because an emitter bug produced `field-label?: ReactNode`, which is not valid
// JavaScript at all -- `field-label` parses as `field - label`. It looked fine in review
// and would have failed at build time in the consuming project, far from the cause.

const fs = require("fs");
const path = require("path");

const dir = process.argv[2];
if (!dir) { console.log("usage: node validate-output.js <outDir>"); process.exit(2); }

let bad = 0;
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".tsx"));

if (!files.length) { console.log("no .tsx files in " + dir); process.exit(2); }

for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), "utf8");
  const problems = [];

  // 1. kebab-case identifiers in prop declarations or destructuring
  const propDecl = /^\s{2}([A-Za-z0-9]+-[A-Za-z0-9-]+)\??:/gm;
  let m;
  while ((m = propDecl.exec(src))) problems.push("invalid prop identifier: " + m[1]);

  const destructure = src.match(/export function \w+\(\{([^}]*)\}/);
  if (destructure) {
    destructure[1].split(",").map((s) => s.trim().split(/[\s=]/)[0]).forEach((name) => {
      if (name && /^[A-Za-z0-9]+-[A-Za-z0-9-]+$/.test(name)) {
        problems.push("invalid destructured identifier: " + name);
      }
    });
  }

  // 2. a JSX expression referencing a kebab identifier
  const expr = /\{\s*([A-Za-z0-9]+-[A-Za-z0-9-]+)\s*\?\?/g;
  while ((m = expr.exec(src))) problems.push("invalid identifier in JSX: " + m[1]);

  // 3. an interface that extends nothing / empty body is a sign of a broken emit
  if (/export interface \w+Props extends [^{]+\{\s*\}/.test(src)) {
    problems.push("empty Props interface");
  }

  // 4. unresolved template placeholders
  if (/undefined|\[object Object\]/.test(src)) {
    problems.push("contains 'undefined' or '[object Object]'");
  }

  if (problems.length) {
    bad++;
    console.log("  FAIL   " + f);
    problems.forEach((p) => console.log("           " + p));
  } else {
    console.log("  ok     " + f);
  }
}

process.exit(bad ? 1 : 0);
