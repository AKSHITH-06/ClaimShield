/**
 * Copy the canonical case corpus into the frontend as an offline snapshot.
 *
 * The backend's app/data/cases.json is the ONE source of truth. The frontend previously kept
 * its own cases.json with different field names (case_id vs id) and case ids the backend
 * would 404 on, which meant offline mode surfaced cases that live mode could not analyse.
 *
 * Run after any corpus edit:  node scripts/sync-corpus.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(root, "backend/app/data/cases.json");
const DEST = resolve(root, "Frontend-amogh/src/data/corpus.generated.json");

const cases = JSON.parse(readFileSync(SRC, "utf8"));

if (!Array.isArray(cases) || cases.length === 0) {
  console.error("Corpus is empty or not an array. Aborting.");
  process.exit(1);
}

const missingId = cases.filter((c) => !c.id);
if (missingId.length) {
  console.error(`${missingId.length} case(s) have no "id". Aborting.`);
  process.exit(1);
}

const declined = cases.filter((c) => c.insufficient_information).map((c) => c.id);
if (declined.length !== 1) {
  console.warn(
    `Warning: expected exactly one insufficient_information case, found ${declined.length} ` +
      `(${declined.join(", ") || "none"}). The declined-path demo needs exactly one.`
  );
}

writeFileSync(DEST, JSON.stringify(cases, null, 2) + "\n", "utf8");

const byReason = cases.reduce((acc, c) => {
  const k = c.rejection_reason ?? "unknown";
  acc[k] = (acc[k] ?? 0) + 1;
  return acc;
}, {});

console.log(`Synced ${cases.length} cases -> Frontend-amogh/src/data/corpus.generated.json`);
console.log(`  categories: ${JSON.stringify(byReason)}`);
console.log(`  declined case: ${declined.join(", ") || "none"}`);
