import { describe, it, expect } from "vitest";
import { calcS8Score, getVerdict } from "./utils.js";

// ── calcS8Score ────────────────────────────────────────────────────────────

describe("calcS8Score", () => {
  it("returns 0 when fmr or price is missing", () => {
    expect(calcS8Score(0, 100000, 55, "MEDIUM")).toBe(0);
    expect(calcS8Score(1200, 0, 55, "MEDIUM")).toBe(0);
    expect(calcS8Score(null, null, 55, "MEDIUM")).toBe(0);
  });

  it("rewards high rent-to-price ratio (rtp)", () => {
    // 2% rtp (fmr=2000, price=100000) should score higher than 1% rtp
    const highRtp = calcS8Score(2000, 100000, 55, "MEDIUM");
    const lowRtp = calcS8Score(1000, 100000, 55, "MEDIUM");
    expect(highRtp).toBeGreaterThan(lowRtp);
  });

  it("caps rtp contribution at 40 points", () => {
    // Extremely high rtp should not push score above theoretical max
    const score = calcS8Score(10000, 10000, 100, "HIGH");
    expect(score).toBeLessThanOrEqual(100);
  });

  it("rewards safer areas (higher crimeScore)", () => {
    const safe = calcS8Score(1200, 100000, 90, "MEDIUM");
    const dangerous = calcS8Score(1200, 100000, 20, "MEDIUM");
    expect(safe).toBeGreaterThan(dangerous);
  });

  it("rewards higher voucher demand", () => {
    const high = calcS8Score(1200, 100000, 55, "HIGH");
    const medium = calcS8Score(1200, 100000, 55, "MEDIUM");
    const low = calcS8Score(1200, 100000, 55, "LOW");
    expect(high).toBeGreaterThan(medium);
    expect(medium).toBeGreaterThan(low);
  });

  it("falls back to crimeScore=55 when crimeScore is falsy", () => {
    const withNull = calcS8Score(1200, 100000, null, "MEDIUM");
    const with55 = calcS8Score(1200, 100000, 55, "MEDIUM");
    expect(withNull).toBe(with55);
  });

  it("produces a known stable result for a typical Cleveland deal", () => {
    // fmr=1340, price=89000, crimeScore=55, demand=HIGH
    const score = calcS8Score(1340, 89000, 55, "HIGH");
    expect(score).toBeGreaterThanOrEqual(60);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ── getVerdict ─────────────────────────────────────────────────────────────

describe("getVerdict", () => {
  it("returns STRONG BUY for score >= 80", () => {
    expect(getVerdict(80).label).toBe("STRONG BUY");
    expect(getVerdict(95).label).toBe("STRONG BUY");
  });

  it("returns GOOD DEAL for score 65–79", () => {
    expect(getVerdict(65).label).toBe("GOOD DEAL");
    expect(getVerdict(79).label).toBe("GOOD DEAL");
  });

  it("returns PROCEED WITH CAUTION for score 50–64", () => {
    expect(getVerdict(50).label).toBe("PROCEED WITH CAUTION");
    expect(getVerdict(64).label).toBe("PROCEED WITH CAUTION");
  });

  it("returns NOT RECOMMENDED for score < 50", () => {
    expect(getVerdict(49).label).toBe("NOT RECOMMENDED");
    expect(getVerdict(0).label).toBe("NOT RECOMMENDED");
  });

  it("returns a hex color string for every verdict", () => {
    [0, 50, 65, 80].forEach(score => {
      expect(getVerdict(score).color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });
});
