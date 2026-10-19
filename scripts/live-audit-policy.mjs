import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertExactHighPolicy,
  normalizeAudit,
  validateResidualHighPolicy
} from "./security-audit-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshot = JSON.parse(
  fs.readFileSync(
    path.join(root, "security", "production-audit-snapshot.json"),
    "utf8"
  )
);
const canonicalFileText = (value) =>
  `${value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim()}\n`;
const lockfileSha256 = crypto
  .createHash("sha256")
  .update(canonicalFileText(fs.readFileSync(path.join(root, "package-lock.json"), "utf8")))
  .digest("hex");
if (
  snapshot.schemaVersion !== 3 ||
  snapshot.auditScope !== "production" ||
  snapshot.lockfileSha256 !== lockfileSha256
) {
  throw new Error("Security snapshot schema or package-lock SHA-256 is stale.");
}
const policy = validateResidualHighPolicy(snapshot.policy);
const result = childProcess.spawnSync(
  "npm",
  ["audit", "--omit=dev", "--json"],
  {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32"
  }
);
let audit;
try {
  audit = JSON.parse(result.stdout);
} catch {
  throw new Error(
    `npm audit did not produce JSON: ${result.stderr || result.stdout}`
  );
}
const findings = normalizeAudit(audit);
if (findings.critical.length) {
  throw new Error(
    `Live production audit has Critical findings: ${findings.critical.map((item) => item.package).join(", ")}`
  );
}
assertExactHighPolicy(findings.high, policy.allowedHigh);
console.log(
  `Live production audit exactly satisfies the approved residual-High policy (${findings.high.length} High records).`
);
