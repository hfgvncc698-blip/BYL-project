import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { searchCiqual } from "../src/utils/ciqualLoader.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rows = JSON.parse(fs.readFileSync(path.join(root, "public/ciqual_2025.json"), "utf8"));

const appleResults = searchCiqual(rows, "pomme", 8);
assert.ok(appleResults.length > 0, "Apple search must return results");
assert.equal(appleResults[0].name, "Pomme, chair et peau, crue", "A fresh whole apple must be the first result for pomme");
assert.ok(
  appleResults.slice(0, 5).every((row) => /^Pomme(?!s? de terre)/i.test(row.name)),
  "Fresh apples must rank ahead of potato dishes"
);

const potatoResults = searchCiqual(rows, "pomme de terre", 8);
assert.ok(
  potatoResults.slice(0, 3).every((row) => /pomme de terre/i.test(row.name)),
  "A potato query must keep potato foods at the top"
);

const chickenResults = searchCiqual(rows, "poulet", 5);
assert.ok(/^Poulet[, ]/i.test(chickenResults[0]?.name || ""), "A simple chicken food must rank first for poulet");

const tomatoResults = searchCiqual(rows, "tomate", 5);
assert.match(tomatoResults[0]?.name || "", /^Tomate,.*crue/i, "A fresh tomato must rank ahead of dried and processed tomatoes");

const riceResults = searchCiqual(rows, "riz", 20);
assert.ok(riceResults.every((row) => /\briz\b/i.test(row.name)), "Short queries must match complete words, not words such as chorizo");

const rawPastaResults = searchCiqual(rows, "pâte crue", 6);
assert.ok(rawPastaResults.length > 0, "Raw pasta search must return results");
assert.ok(
  rawPastaResults.every((row) => /^Pâtes\b/i.test(row.name) && /\bcrues?\b/i.test(row.name)),
  "Raw pasta search must only return uncooked pasta before dough and pâté"
);

const cookedPastaResults = searchCiqual(rows, "pâte cuite", 6);
assert.ok(cookedPastaResults.length > 0, "Cooked pasta search must return results");
assert.ok(
  cookedPastaResults.every((row) => /^Pâtes\b/i.test(row.name) && /\bcuites?\b/i.test(row.name)),
  "Cooked pasta search must only return cooked pasta before dough and pâté"
);
assert.ok(
  rawPastaResults.every((rawRow) => cookedPastaResults.every((cookedRow) => cookedRow.code !== rawRow.code)),
  "Raw and cooked pasta searches must produce distinct foods"
);

const pizzaDoughResults = searchCiqual(rows, "pâte à pizza crue", 5);
assert.match(pizzaDoughResults[0]?.name || "", /^Pâte à pizza.*crue/i, "A qualified dough search must keep dough results");

console.log("ok - CIQUAL search ranks simple foods before compound dishes");
