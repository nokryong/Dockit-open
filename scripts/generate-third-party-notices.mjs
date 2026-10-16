import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = path.join(root, "package-lock.json");
const manifestPath = path.join(
  root,
  "licenses",
  "third-party-notices.manifest.json"
);
const noticesPath = path.join(root, "public", "THIRD_PARTY_NOTICES.txt");
const iconDataPath = path.join(
  root,
  "licenses",
  "icon-attributions.json"
);
const refresh = process.argv.includes("--refresh");
const check = process.argv.includes("--check");

const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const normalizeText = (value) =>
  value
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim();
const canonicalFileText = (value) => `${normalizeText(value)}\n`;
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const compareText = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const npmPackageUrl = (name, version) =>
  `https://www.npmjs.com/package/${encodeURIComponent(name)}/v/${encodeURIComponent(version)}`;
const packageName = (lockEntryPath) =>
  lockEntryPath.slice(
    lockEntryPath.lastIndexOf("node_modules/") + "node_modules/".length
  );
const packageVersionKey = (name, version) => `${name}@${version}`;

const ownerControlledPackages = new Map([
  ["sud-icons", "Owned and controlled by the Dockit product owner"]
]);
const licenseOverrides = new Map([
  [
    "buffers@0.1.1",
    {
      license: "MIT",
      evidence:
        "https://sources.debian.org/copyright/license/node-buffers/0.1.1-2/"
    }
  ],
  [
    "jstat@1.9.6",
    {
      license: "MIT",
      evidence: "https://github.com/jstat/jstat/blob/1.9.6/LICENSE"
    }
  ],
  [
    "khroma@2.1.0",
    {
      license: "MIT",
      evidence:
        "https://github.com/fabiospampinato/khroma/blob/v2.1.0/license"
    }
  ]
]);
const licenseSelections = new Map([
  ["dompurify@3.4.12", "Apache-2.0"],
  ["jszip@3.10.1", "MIT"]
]);

function sourceFiles(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareText(left.name, right.name))
    .flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory()
        ? sourceFiles(file)
        : /\.(?:js|jsx|ts|tsx)$/.test(entry.name)
          ? [file]
          : [];
    });
}

function verifyReactIconInputs() {
  const packs = JSON.parse(fs.readFileSync(iconDataPath, "utf8"));
  const imported = new Set();
  for (const file of sourceFiles(path.join(root, "app"))) {
    for (const match of fs
      .readFileSync(file, "utf8")
      .matchAll(/(?:from\s*|import\s*\()\s*["']react-icons\/([^"']+)["']/g)) {
      imported.add(match[1].toLowerCase());
    }
  }
  const declared = new Set(packs.map(({ code }) => code));
  const missing = [...imported].filter((code) => !declared.has(code));
  const stale = [...declared].filter((code) => !imported.has(code));
  if (missing.length || stale.length) {
    throw new Error(
      [
        missing.length
          ? `Missing React Icons notices: ${missing.join(", ")}`
          : "",
        stale.length ? `Stale React Icons notices: ${stale.join(", ")}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
  return packs.sort((left, right) => compareText(left.code, right.code));
}

function readLock() {
  const text = canonicalFileText(fs.readFileSync(lockPath, "utf8"));
  const lock = JSON.parse(text);
  const entries = Object.entries(lock.packages || {})
    .filter(
      ([entryPath, entry]) =>
        entryPath.startsWith("node_modules/") && entry.dev !== true
    )
    .map(([entryPath, entry]) => ({ lockPath: entryPath, entry }))
    .sort((left, right) => compareText(left.lockPath, right.lockPath));
  return { text, entries };
}

function normalizeLicense(value) {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map(normalizeLicense).filter(Boolean).join(" OR ");
  }
  if (value && typeof value === "object") {
    return normalizeLicense(value.type || value.name || value.license);
  }
  return "";
}

function normalizePerson(value) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  return [
    value.name || "",
    value.email && `<${value.email}>`,
    value.url && `(${value.url})`
  ]
    .filter(Boolean)
    .join(" ");
}

function normalizeRepository(value) {
  const raw = typeof value === "string" ? value : value?.url;
  return (raw || "")
    .replace(/^github:/, "https://github.com/")
    .replace(/^git\+/, "")
    .replace(/^git:\/\/github\.com\//, "https://github.com/")
    .replace(/^ssh:\/\/git@github\.com\//, "https://github.com/")
    .replace(/^git@github\.com:/, "https://github.com/")
    .replace(/\.git$/, "");
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function noticeFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const pattern =
    /^(?:licen[cs]e|copying|copyright|notice|third[-_ ]party(?:[-_ ]notices?)?)(?:[._ -].*)?$/i;
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && pattern.test(entry.name))
    .sort((left, right) => compareText(left.name, right.name))
    .flatMap((entry) => {
      const file = path.join(directory, entry.name);
      const size = fs.statSync(file).size;
      if (size === 0 || size > 2 * 1024 * 1024) return [];
      try {
        const text = normalizeText(fs.readFileSync(file, "utf8"));
        return text && !text.includes("\0")
          ? [{ name: entry.name, text }]
          : [];
      } catch {
        return [];
      }
    });
}

function recordFor(entryPath, entry, metadata, evidenceStatus, collectedFiles) {
  const name = packageName(entryPath);
  const version = entry.version || "unknown";
  const key = packageVersionKey(name, version);
  const override = licenseOverrides.get(key);
  const files = collectedFiles
    .map(({ name: filename, text }) => ({
      name: filename,
      sha256: sha256(text)
    }))
    .sort((left, right) =>
      compareText(`${left.name}\0${left.sha256}`, `${right.name}\0${right.sha256}`)
    );
  return {
    lockPath: entryPath,
    name,
    version,
    resolved: entry.resolved || "",
    integrity: entry.integrity || "",
    optional: entry.optional === true,
    ownerControlled: ownerControlledPackages.has(name),
    ownerNote: ownerControlledPackages.get(name) || "",
    license:
      override?.license ||
      normalizeLicense(metadata?.license) ||
      normalizeLicense(entry.license) ||
      "UNKNOWN",
    selectedLicense: licenseSelections.get(key) || "",
    licenseEvidence: override?.evidence || "",
    source:
      normalizeRepository(metadata?.repository) ||
      metadata?.homepage ||
      npmPackageUrl(name, version),
    author: normalizePerson(metadata?.author),
    evidenceStatus,
    noticeFiles: files
  };
}

function validateManifest(manifest, lock) {
  if (
    manifest.schemaVersion !== 3 ||
    manifest.lockfileSha256 !== sha256(lock.text) ||
    !Array.isArray(manifest.packages) ||
    !Array.isArray(manifest.texts)
  ) {
    throw new Error(
      "License manifest schema or package-lock SHA-256 is invalid. Run npm run licenses:refresh-evidence."
    );
  }

  const expected = new Map(
    lock.entries.map(({ lockPath: entryPath, entry }) => [entryPath, entry])
  );
  const records = new Map();
  const appliedOverrides = new Set();
  const appliedSelections = new Set();
  for (const record of manifest.packages) {
    if (
      !record ||
      typeof record.lockPath !== "string" ||
      records.has(record.lockPath) ||
      !expected.has(record.lockPath)
    ) {
      throw new Error(
        `Stale or duplicate manifest package record: ${record?.lockPath || "unknown"}`
      );
    }
    const entry = expected.get(record.lockPath);
    const key = packageVersionKey(record.name, record.version);
    const expectedOwnerNote = ownerControlledPackages.get(record.name) || "";
    if (
      record.name !== packageName(record.lockPath) ||
      record.version !== entry.version ||
      record.resolved !== (entry.resolved || "") ||
      record.integrity !== (entry.integrity || "") ||
      record.optional !== (entry.optional === true) ||
      record.ownerControlled !== ownerControlledPackages.has(record.name) ||
      record.ownerNote !== expectedOwnerNote ||
      !["collected", "fallback-missing"].includes(record.evidenceStatus) ||
      !Array.isArray(record.noticeFiles)
    ) {
      throw new Error(`Invalid manifest package record: ${record.lockPath}`);
    }
    const override = licenseOverrides.get(key);
    if (override) {
      appliedOverrides.add(key);
      if (
        record.license !== override.license ||
        record.licenseEvidence !== override.evidence
      ) {
        throw new Error(`License override is not applied for ${key}`);
      }
    }
    const selection = licenseSelections.get(key);
    if (selection) {
      appliedSelections.add(key);
      if (record.selectedLicense !== selection) {
        throw new Error(`License selection is not applied for ${key}`);
      }
    } else if (record.selectedLicense) {
      throw new Error(`Unexpected license selection for ${key}`);
    }
    const sortedFiles = [...record.noticeFiles].sort((left, right) =>
      compareText(`${left.name}\0${left.sha256}`, `${right.name}\0${right.sha256}`)
    );
    if (
      JSON.stringify(sortedFiles) !== JSON.stringify(record.noticeFiles) ||
      record.noticeFiles.some(
        (file) =>
          typeof file.name !== "string" || typeof file.sha256 !== "string"
      ) ||
      (record.evidenceStatus === "fallback-missing" &&
        record.noticeFiles.length > 0)
    ) {
      throw new Error(`Invalid notice-file evidence for ${record.lockPath}`);
    }
    records.set(record.lockPath, record);
  }

  const missing = [...expected.keys()].filter(
    (entryPath) => !records.has(entryPath)
  );
  if (missing.length) {
    throw new Error(
      `License manifest is missing non-dev lock entries: ${missing.join(", ")}`
    );
  }
  const staleOverrides = [...licenseOverrides.keys()].filter(
    (key) => !appliedOverrides.has(key)
  );
  const staleSelections = [...licenseSelections.keys()].filter(
    (key) => !appliedSelections.has(key)
  );
  if (staleOverrides.length || staleSelections.length) {
    throw new Error(
      [
        staleOverrides.length
          ? `Stale license overrides: ${staleOverrides.join(", ")}`
          : "",
        staleSelections.length
          ? `Stale license selections: ${staleSelections.join(", ")}`
          : ""
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  const texts = new Map();
  for (const text of manifest.texts) {
    if (
      !text ||
      typeof text.sha256 !== "string" ||
      typeof text.text !== "string" ||
      texts.has(text.sha256) ||
      sha256(text.text) !== text.sha256 ||
      text.text !== normalizeText(text.text)
    ) {
      throw new Error(
        `Invalid license text catalog record: ${text?.sha256 || "unknown"}`
      );
    }
    texts.set(text.sha256, text);
  }
  const referenced = new Set();
  for (const record of records.values()) {
    for (const file of record.noticeFiles) {
      if (!texts.has(file.sha256)) {
        throw new Error(
          `Missing license text ${file.sha256} referenced by ${record.lockPath}`
        );
      }
      referenced.add(file.sha256);
    }
  }
  const staleTexts = [...texts.keys()].filter((hash) => !referenced.has(hash));
  if (staleTexts.length) {
    throw new Error(
      `Stale unreferenced license text catalog records: ${staleTexts.join(", ")}`
    );
  }

  const sortedPackages = [...manifest.packages].sort((left, right) =>
    compareText(left.lockPath, right.lockPath)
  );
  const sortedTexts = [...manifest.texts].sort((left, right) =>
    compareText(left.sha256, right.sha256)
  );
  if (
    JSON.stringify(manifest.packages) !== JSON.stringify(sortedPackages) ||
    JSON.stringify(manifest.texts) !== JSON.stringify(sortedTexts) ||
    fs.readFileSync(manifestPath, "utf8") !== stableJson(manifest)
  ) {
    throw new Error("License manifest is not bytewise stable LF JSON ordering.");
  }
  return { records, texts };
}

function aggregatePackages(manifest) {
  const groups = new Map();
  for (const record of manifest.packages.filter(
    (packageRecord) => !packageRecord.ownerControlled
  )) {
    const key = packageVersionKey(record.name, record.version);
    const group = groups.get(key) || {
      ...record,
      lockPaths: [],
      evidenceStatuses: new Set(),
      noticeFiles: new Map()
    };
    group.lockPaths.push(record.lockPath);
    group.evidenceStatuses.add(record.evidenceStatus);
    for (const file of record.noticeFiles) {
      group.noticeFiles.set(`${file.name}\0${file.sha256}`, file);
    }
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, group]) => group);
}

function notices(manifest, packs) {
  const publicPackages = aggregatePackages(manifest);
  const publicTextHashes = new Set();
  for (const group of publicPackages) {
    for (const file of group.noticeFiles.values()) {
      publicTextHashes.add(file.sha256);
    }
  }
  const lines = [
    "DOCKIT THIRD-PARTY SOFTWARE NOTICES",
    "=".repeat(80),
    "",
    "This document lists third-party npm components associated with the Dockit production dependency graph.",
    "It is generated conservatively from package-lock.json and a committed structured evidence manifest, and may include optional, server-side, or build-time components that are not delivered to every client.",
    "The listed licenses apply only to their respective third-party components. They do not license or disclose Dockit proprietary source code, product content, trademarks, or other proprietary materials.",
    "sud-icons is owned by the Dockit product owner and is intentionally excluded from this third-party notice.",
    "If this summary conflicts with an included license text, the included license text controls for that component.",
    "",
    `package-lock.json SHA-256: ${manifest.lockfileSha256}`,
    `Included non-dev lock entries: ${manifest.packages.length}`,
    `Unique third-party package name/version pairs: ${publicPackages.length}`,
    `Owner-controlled lock entries excluded from this notice: ${manifest.packages.filter((record) => record.ownerControlled).length}`,
    `Fallback/missing-evidence records: ${manifest.packages.filter((record) => record.evidenceStatus === "fallback-missing").length}`,
    "",
    "MULTI-LICENSE OPTIONS SELECTED BY DOCKIT",
    "=".repeat(80),
    "",
    "Where a component offers alternative licenses, Dockit uses the following option:",
    ""
  ];
  for (const [key, selection] of licenseSelections) {
    lines.push(`- ${key}: ${selection}`);
  }

  lines.push(
    "",
    "REACT ICONS - ICON PACKS IMPORTED BY DOCKIT",
    "=".repeat(80),
    "",
    "react-icons is MIT-licensed, while each source icon project retains its own license. Only the following icon-pack entry points are imported by Dockit:",
    ""
  );
  for (const pack of packs) {
    lines.push(
      `- react-icons/${pack.code}: ${pack.name} | ${pack.license} | ${pack.source}`
    );
  }

  lines.push("", "PACKAGE INDEX", "=".repeat(80), "");
  for (const group of publicPackages) {
    lines.push(
      `${group.name}@${group.version}`,
      `  License: ${group.license || "UNKNOWN"}`,
      `  Source: ${group.source || "unknown"}`,
      `  Evidence: ${[...group.evidenceStatuses].sort(compareText).join(", ")}`,
      `  Lockfile instances: ${group.lockPaths.length}`
    );
    if (group.selectedLicense) {
      lines.push(`  Selected option: ${group.selectedLicense}`);
    }
    if (group.licenseEvidence) {
      lines.push(`  License evidence: ${group.licenseEvidence}`);
    }
    if (group.author) lines.push(`  Author: ${group.author}`);
    const files = [...group.noticeFiles.values()].sort((left, right) =>
      compareText(`${left.name}\0${left.sha256}`, `${right.name}\0${right.sha256}`)
    );
    lines.push(
      files.length
        ? `  Included files: ${files.map((file) => `${file.name} (${file.sha256})`).join(", ")}`
        : "  Included files: none; package metadata or reviewed override is retained"
    );
    lines.push("");
  }

  lines.push("LICENSE, COPYRIGHT, COPYING, AND NOTICE TEXTS", "=".repeat(80), "");
  for (const text of manifest.texts.filter((entry) => publicTextHashes.has(entry.sha256))) {
    lines.push(
      "-".repeat(80),
      `Text SHA-256: ${text.sha256}`,
      "-".repeat(80),
      text.text,
      ""
    );
  }
  return `${lines.join("\n").trim()}\n`;
}

const lock = readLock();
const packs = verifyReactIconInputs();
if (!refresh) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  validateManifest(manifest, lock);
  const output = notices(manifest, packs);
  if (check) {
    if (
      !fs.existsSync(noticesPath) ||
      fs.readFileSync(noticesPath, "utf8") !== output
    ) {
      throw new Error(
        "THIRD_PARTY_NOTICES.txt is stale. Run npm run licenses:generate."
      );
    }
    console.log(
      `License manifest is current (${manifest.packages.length} non-dev lock entries; ${manifest.texts.length} unique texts).`
    );
  } else {
    fs.writeFileSync(noticesPath, output, "utf8");
    console.log(
      "Generated public/THIRD_PARTY_NOTICES.txt from committed license manifest."
    );
  }
  process.exit(0);
}

const previous = fs.existsSync(manifestPath)
  ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  : null;
const previousRecords = new Map(
  (previous?.packages || []).map((record) => [record.lockPath, record])
);
const previousTexts = new Map(
  (previous?.texts || []).map((text) => [text.sha256, text])
);
const catalog = new Map();
const records = [];
for (const { lockPath: entryPath, entry } of lock.entries) {
  const directory = path.join(root, ...entryPath.split("/"));
  const old = previousRecords.get(entryPath);
  if (!fs.existsSync(directory)) {
    if (
      old &&
      old.version === entry.version &&
      old.resolved === (entry.resolved || "") &&
      old.integrity === (entry.integrity || "") &&
      Array.isArray(old.noticeFiles)
    ) {
      records.push(old);
      for (const file of old.noticeFiles) {
        const text = previousTexts.get(file.sha256);
        if (!text) {
          throw new Error(
            `Prior evidence text ${file.sha256} is missing for ${entryPath}`
          );
        }
        catalog.set(file.sha256, text);
      }
      continue;
    }
    if (previous && old && old.evidenceStatus !== "fallback-missing") {
      throw new Error(
        `Prior license evidence is incompatible with the current lock entry: ${entryPath}`
      );
    }
    if (previous && !old) {
      throw new Error(
        `New non-dev lock entry is absent from this platform and has no prior evidence: ${entryPath}`
      );
    }
    records.push(recordFor(entryPath, entry, null, "fallback-missing", []));
    continue;
  }

  const metadata = readJson(path.join(directory, "package.json")) || {};
  const collected = noticeFiles(directory);
  for (const notice of collected) {
    const hash = sha256(notice.text);
    catalog.set(hash, { sha256: hash, text: notice.text });
  }
  records.push(recordFor(entryPath, entry, metadata, "collected", collected));
}

const manifest = {
  schemaVersion: 3,
  lockfileSha256: sha256(lock.text),
  packages: records.sort((left, right) => compareText(left.lockPath, right.lockPath)),
  texts: [...catalog.values()]
    .filter(Boolean)
    .sort((left, right) => compareText(left.sha256, right.sha256))
};
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, stableJson(manifest), "utf8");
validateManifest(manifest, lock);
fs.writeFileSync(noticesPath, notices(manifest, packs), "utf8");
console.log(
  `Refreshed structured license evidence (${manifest.packages.length} entries, ${manifest.texts.length} texts, ${manifest.packages.filter((record) => record.evidenceStatus === "fallback-missing").length} platform-absent fallback records).`
);
