// Pure utility functions shared across the app

export function getVerdict(score) {
  if (score >= 80) return { label: "STRONG BUY", color: "#00E59B" };
  if (score >= 65) return { label: "GOOD DEAL", color: "#4CAF7D" };
  if (score >= 50) return { label: "PROCEED WITH CAUTION", color: "#F4A636" };
  return { label: "NOT RECOMMENDED", color: "#E05C5C" };
}

export function calcS8Score(fmr, price, crimeScore, voucherDemand) {
  if (!fmr || !price) return 0;
  const rtp = (fmr / price) * 100;
  const rtpPts = Math.min(40, (rtp / 2) * 40);
  const crimePts = ((crimeScore || 55) / 100) * 25;
  const demandPts = voucherDemand === "HIGH" ? 20 : voucherDemand === "MEDIUM" ? 13 : 7;
  const affordPts = Math.min(15, (300000 / price) * 10);
  return Math.round(rtpPts + crimePts + demandPts + affordPts);
}
