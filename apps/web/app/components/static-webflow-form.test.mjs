// apps/web/app/components/static-webflow-form.test.mjs
// Spec §11: the lead forms must POST to /api/forms/:formKey/submit and branch on the response
// (no fake always-success). Source invariants:
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "static-webflow-form.tsx"), "utf8");
const fail = [];
if (!/formKey/.test(src)) fail.push("form: must accept a formKey prop");
if (!/\/api\/forms\//.test(src)) fail.push("form: must POST to /api/forms/:formKey/submit");
if (!/FormData/.test(src)) fail.push("form: must send FormData (upload field present)");
if (!/res\.ok|response\.ok/.test(src)) fail.push("form: must branch on response.ok");
if (/setDone\(true\)\s*;?\s*}\s*}\s*$/m.test(src) && !/await\s+fetch/.test(src))
  fail.push("form: still fakes success without a network call");
if (fail.length) { console.error("FAIL\n" + fail.join("\n")); process.exit(1); }
console.log("form wiring OK");
