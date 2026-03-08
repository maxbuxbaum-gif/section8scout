import { describe, it, expect } from "vitest";
import { extractViolentCrimeRate, pickWebSearchSource } from "./analyze.js";

// ── extractViolentCrimeRate ────────────────────────────────────────────────

describe("extractViolentCrimeRate", () => {
  it("returns null when no crime rate is present", () => {
    expect(extractViolentCrimeRate("Nice neighborhood with good schools.")).toBeNull();
    expect(extractViolentCrimeRate("")).toBeNull();
  });

  it("parses 'X crimes per 100,000' (per-hundred-thousand phrasing)", () => {
    expect(extractViolentCrimeRate("The area has 850 violent crimes per 100,000 residents.")).toBe(850);
    expect(extractViolentCrimeRate("crime rate of 1,200 crimes per 100000 in 2023")).toBe(1200);
  });

  it("parses 'X crimes per 1,000' and scales to per-100k", () => {
    expect(extractViolentCrimeRate("8.5 violent crimes per 1,000 residents")).toBeCloseTo(850);
    expect(extractViolentCrimeRate("12 incidents per 1000 annually")).toBeCloseTo(1200);
  });

  it("parses 'violent crime rate of X' where X >= 100 (per-100k)", () => {
    expect(extractViolentCrimeRate("violent crime rate of 620 in this zip")).toBe(620);
  });

  it("parses 'violent crime rate of X' where X < 100 (treats as per-1k → scales)", () => {
    expect(extractViolentCrimeRate("violent crime rate of 8.5")).toBeCloseTo(850);
  });

  it("ignores commas inside numbers", () => {
    expect(extractViolentCrimeRate("1,450 violent crimes per 100,000")).toBe(1450);
  });

  it("matches text embedded in a longer sentence", () => {
    const notes = "Investors should note that the area has 540 violent crimes per 100,000 which is above the national average.";
    expect(extractViolentCrimeRate(notes)).toBe(540);
  });
});

// ── pickWebSearchSource ────────────────────────────────────────────────────

describe("pickWebSearchSource", () => {
  it("returns first non-backend source", () => {
    expect(pickWebSearchSource(["NeighborhoodScout", "HUD FMR", "FBI UCR"])).toBe("NeighborhoodScout");
  });

  it("skips all backend source names", () => {
    const backend = ["State Estimate", "State Average Estimate", "HUD FMR", "FBI UCR", "HUD Open Data", "City-Data.com"];
    expect(pickWebSearchSource(backend)).toBe("City-Data.com");
  });

  it("returns 'Web Search' when all entries are backend sources", () => {
    expect(pickWebSearchSource(["HUD FMR", "FBI UCR"])).toBe("Web Search");
  });

  it("returns 'Web Search' for null / undefined / empty", () => {
    expect(pickWebSearchSource(null)).toBe("Web Search");
    expect(pickWebSearchSource(undefined)).toBe("Web Search");
    expect(pickWebSearchSource([])).toBe("Web Search");
  });
});
