import childProcess from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertExactHighPolicy,
  normalizeAllowedHigh,
  normalizeAudit,
  normalizeFindings,
  validateResidualHighPolicy
} from "./security-audit-policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const snapshotPath = path.join(
  root,
  "security",
  "production-audit-snapshot.json"
);
const canonicalFileText = (value) =>
  `${value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim()}\n`;
const lockfileSha256 = crypto
  .createHash("sha256")
  .update(canonicalFileText(fs.readFileSync(path.join(root, "package-lock.json"), "utf8")))
  .digest("hex");
const refresh = process.argv.includes("--refresh");
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const readAudit = () => {
  const result = childProcess.spawnSync(
    "npm",
    ["audit", "--omit=dev", "--json"],
    {
      cwd: root,
      encoding: "utf8",
      shell: process.platform === "win32"
    }
  );
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(
      `npm audit did not produce JSON: ${result.stderr || result.stdout}`
    );
  }
};

function validatePolicy(snapshot) {
  if (
    snapshot.schemaVersion !== 3 ||
    snapshot.auditScope !== "production" ||
    !snapshot.policy
  ) {
    throw new Error("Invalid production security policy schema.");
  }
  return validateResidualHighPolicy(snapshot.policy);
}

function canonicalSnapshot(snapshot, findings = snapshot.findings) {
  const policy = validateResidualHighPolicy(snapshot.policy);
  return {
    schemaVersion: 3,
    auditScope: "production",
    lockfileSha256: snapshot.lockfileSha256,
    policy: {
      expiresOn: policy.expiresOn,
      allowedHigh: normalizeAllowedHigh(policy.allowedHigh)
    },
    findings: normalizeFindings(findings)
  };
}

function validateSnapshot(snapshot) {
  validatePolicy(snapshot);
  if (snapshot.lockfileSha256 !== lockfileSha256 || !snapshot.findings) {
    throw new Error(
      "Invalid or stale normalized production security snapshot. Run npm run security:refresh-snapshot after review."
    );
  }
  const findings = normalizeFindings(snapshot.findings);
  if (findings.critical.length) {
    throw new Error("Committed production security snapshot contains Critical findings.");
  }
  assertExactHighPolicy(findings.high, snapshot.policy.allowedHigh);
  const normalized = canonicalSnapshot(snapshot, findings);
  if (fs.readFileSync(snapshotPath, "utf8") !== stableJson(normalized)) {
    throw new Error(
      "Production security snapshot is not bytewise stable LF JSON ordering."
    );
  }
  return normalized;
}

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
if (refresh) {
  validatePolicy(snapshot);
  const findings = normalizeAudit(readAudit());
  if (findings.critical.length) {
    throw new Error(
      `Refusing to refresh snapshot with Critical findings: ${findings.critical.map((item) => item.package).join(", ")}`
    );
  }
  assertExactHighPolicy(findings.high, snapshot.policy.allowedHigh);
  const updated = canonicalSnapshot(
    { ...snapshot, lockfileSha256 },
    findings
  );
  fs.writeFileSync(snapshotPath, stableJson(updated), "utf8");
  validateSnapshot(updated);
  console.log(
    `Refreshed normalized production security snapshot (${findings.high.length} residual High records).`
  );
} else {
  const current = validateSnapshot(snapshot);
  console.log(
    `Production security snapshot is current (${current.findings.high.length} approved residual High records).`
  );
}
