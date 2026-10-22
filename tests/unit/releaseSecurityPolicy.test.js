import { describe, expect, it } from "vitest";
import {
  assertExactHighPolicy,
  normalizeAudit,
  validateResidualHighPolicy
} from "../../scripts/security-audit-policy.mjs";

const advisory = {
  source: 111,
  name: "serialize-javascript",
  dependency: "serialize-javascript",
  title: "test advisory",
  url: "https://github.com/advisories/GHSA-AAAA-BBBB-CCCC",
  severity: "high",
  range: "<7.0.5"
};

describe("production audit policy", () => {
  it.each([
    undefined,
    null,
    {},
    { message: "network timeout", error: { summary: "", detail: "" } },
    { error: { code: "ENOAUDIT" }, vulnerabilities: {} },
    { vulnerabilities: null },
    { vulnerabilities: [] },
    { vulnerabilities: "unavailable" }
  ])("rejects failed or malformed audit responses: %j", (audit) => {
    expect(() => normalizeAudit(audit)).toThrow(/invalid vulnerability report/);
  });

  it("accepts an empty successful vulnerability report", () => {
    expect(normalizeAudit({ vulnerabilities: {} })).toEqual({
      critical: [],
      high: []
    });
  });

  it("resolves advisory ids through npm audit dependency-chain records", () => {
    const findings = normalizeAudit({
      vulnerabilities: {
        "next-pwa": {
          severity: "high",
          via: ["workbox-webpack-plugin"]
        },
        "workbox-webpack-plugin": {
          severity: "high",
          via: ["workbox-build"]
        },
        "workbox-build": {
          severity: "high",
          via: ["serialize-javascript"]
        },
        "serialize-javascript": {
          severity: "high",
          via: [advisory]
        }
      }
    });

    expect(findings.critical).toEqual([]);
    expect(findings.high).toEqual([
      {
        package: "next-pwa",
        advisoryIds: ["GHSA-AAAA-BBBB-CCCC"]
      },
      {
        package: "serialize-javascript",
        advisoryIds: ["GHSA-AAAA-BBBB-CCCC"]
      },
      {
        package: "workbox-build",
        advisoryIds: ["GHSA-AAAA-BBBB-CCCC"]
      },
      {
        package: "workbox-webpack-plugin",
        advisoryIds: ["GHSA-AAAA-BBBB-CCCC"]
      }
    ]);
  });

  it("rejects a new or missing residual High finding", () => {
    expect(() =>
      assertExactHighPolicy(
        [
          {
            package: "next-pwa",
            advisoryIds: ["GHSA-AAAA-BBBB-CCCC"]
          },
          {
            package: "unexpected-package",
            advisoryIds: ["GHSA-DDDD-EEEE-FFFF"]
          }
        ],
        [
          {
            package: "next-pwa",
            advisoryIds: ["GHSA-AAAA-BBBB-CCCC"],
            rationale: "temporary migration waiver"
          }
        ]
      )
    ).toThrow(/do not exactly match/);
  });

  it("accepts a permanent zero-waiver policy", () => {
    expect(
      validateResidualHighPolicy(
        { expiresOn: null, allowedHigh: [] },
        "2026-07-19"
      )
    ).toEqual({ expiresOn: null, allowedHigh: [] });
  });

  it("requires every non-empty waiver policy to expire", () => {
    expect(() =>
      validateResidualHighPolicy(
        {
          expiresOn: null,
          allowedHigh: [
            {
              package: "next-pwa",
              advisoryIds: ["GHSA-AAAA-BBBB-CCCC"],
              rationale: "temporary migration waiver"
            }
          ]
        },
        "2026-07-19"
      )
    ).toThrow(/requires an expiry date/);
  });

  it("rejects an expired waiver policy", () => {
    expect(() =>
      validateResidualHighPolicy(
        {
          expiresOn: "2026-07-18",
          allowedHigh: [
            {
              package: "next-pwa",
              advisoryIds: ["GHSA-AAAA-BBBB-CCCC"],
              rationale: "temporary migration waiver"
            }
          ]
        },
        "2026-07-19"
      )
    ).toThrow(/expired/);
  });
});
