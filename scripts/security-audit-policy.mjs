const compareText = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

const advisoryId = (via) => {
  if (!via || typeof via !== "object") return null;
  return (
    via.url
      ?.match(/(?:GHSA-[\w-]+|CVE-\d{4}-\d+)/i)?.[0]
      ?.toUpperCase() || null
  );
};

const sortFinding = (finding) => ({
  package: finding.package,
  advisoryIds: [...finding.advisoryIds].sort(compareText)
});

export function normalizeAudit(audit) {
  const vulnerabilities = audit?.vulnerabilities || {};
  const memo = new Map();

  function advisoryIds(name, trail = new Set()) {
    if (memo.has(name)) return memo.get(name);
    if (trail.has(name)) return [];
    const finding = vulnerabilities[name];
    const ids = new Set();
    for (const via of finding?.via || []) {
      if (typeof via === "string") {
        for (const id of advisoryIds(via, new Set([...trail, name]))) {
          ids.add(id);
        }
      } else {
        const id = advisoryId(via);
        if (id) ids.add(id);
      }
    }
    const normalized = [...ids].sort(compareText);
    memo.set(name, normalized);
    return normalized;
  }

  return ["critical", "high"].reduce((result, severity) => {
    result[severity] = Object.entries(vulnerabilities)
      .filter(([, finding]) => finding.severity === severity)
      .map(([name]) => ({ package: name, advisoryIds: advisoryIds(name) }))
      .sort((left, right) => compareText(left.package, right.package));
    return result;
  }, {});
}

export function normalizeAllowedHigh(policy) {
  return [...policy]
    .map(({ package: name, advisoryIds, rationale }) => ({
      package: name,
      advisoryIds: [...advisoryIds].sort(compareText),
      rationale
    }))
    .sort((left, right) => compareText(left.package, right.package));
}

export function validateResidualHighPolicy(
  policy,
  currentDate = new Date().toISOString().slice(0, 10)
) {
  if (!policy || !Array.isArray(policy.allowedHigh)) {
    throw new Error("Invalid residual-High security policy.");
  }

  const packages = new Set();
  for (const waiver of policy.allowedHigh) {
    if (
      !waiver ||
      typeof waiver.package !== "string" ||
      packages.has(waiver.package) ||
      !Array.isArray(waiver.advisoryIds) ||
      waiver.advisoryIds.length === 0 ||
      waiver.advisoryIds.some(
        (id) => !/^(?:GHSA-[\w-]+|CVE-\d{4}-\d+)$/i.test(id)
      ) ||
      typeof waiver.rationale !== "string" ||
      waiver.rationale.trim().length === 0
    ) {
      throw new Error(
        `Invalid residual-High waiver: ${waiver?.package || "unknown"}`
      );
    }
    packages.add(waiver.package);
  }

  if (policy.allowedHigh.length === 0) {
    if (policy.expiresOn !== null) {
      throw new Error("A zero-waiver security policy must not have an expiry.");
    }
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(policy.expiresOn)) {
      throw new Error("A residual-High waiver policy requires an expiry date.");
    }
    if (currentDate > policy.expiresOn) {
      throw new Error(`Security policy expired on ${policy.expiresOn}.`);
    }
  }

  return {
    expiresOn: policy.expiresOn,
    allowedHigh: normalizeAllowedHigh(policy.allowedHigh)
  };
}

export function normalizeFindings(findings) {
  return {
    critical: [...(findings.critical || [])]
      .map(sortFinding)
      .sort((left, right) => compareText(left.package, right.package)),
    high: [...(findings.high || [])]
      .map(sortFinding)
      .sort((left, right) => compareText(left.package, right.package))
  };
}

export function assertExactHighPolicy(actual, policy) {
  const normalizedActual = [...actual]
    .map(sortFinding)
    .sort((left, right) => compareText(left.package, right.package));
  const expected = normalizeAllowedHigh(policy).map(
    ({ package: name, advisoryIds }) => ({ package: name, advisoryIds })
  );
  if (JSON.stringify(normalizedActual) !== JSON.stringify(expected)) {
    throw new Error(
      `Residual High findings do not exactly match the approved policy. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(normalizedActual)}.`
    );
  }
}
