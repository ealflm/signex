// apps/web/app/lib/nap.test.mjs
import assert from "node:assert/strict";
import { napView } from "./nap.ts";

const bc = {
  legalName: "Cong ty SIGNEX",
  brand: "SIGNEX",
  emails: ["sales@signex.vn", "info@signex.vn"],
  phones: [
    { kind: "tel", label: "Tel", value: "(+84) 979 700 072" },
    { kind: "zalo", label: "Zalo", value: "0979700072" },
  ],
  taxId: "0123456789",
  taxLabel: "Tax",
  sites: [
    { kind: "office", label: "Office", address: "12 Office St, HCMC, Viet Nam." },
    { kind: "factory", label: "Factory", address: "34 Factory Rd, HCMC, Viet Nam." },
  ],
  social: [{ kind: "facebook", href: "#" }],
};

const v = napView(bc);
assert.equal(v.company, "Cong ty SIGNEX");
assert.equal(v.email, "sales@signex.vn", "footer renders emails[0]");
assert.equal(v.tel, "(+84) 979 700 072", "tel = first phone of kind tel");
assert.equal(v.zalo, "0979700072");
assert.equal(v.office, "12 Office St, HCMC, Viet Nam.");
assert.equal(v.factory, "34 Factory Rd, HCMC, Viet Nam.");
assert.equal(v.tax, "0123456789");
assert.deepEqual(v.social, [{ kind: "facebook", href: "#" }]);
console.log("nap OK");
