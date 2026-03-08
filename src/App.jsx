import { useState, useEffect } from "react";

// ── All API calls go through Vercel serverless functions ──────────────────
async function apiFetch(endpoint, body) {
  const res = await fetch(`/api/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok && data.error) throw new Error(data.error);
  return data;
}

// ── Storage helpers ───────────────────────────────────────────────────────
async function storageGet(key) {
  try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; } catch { return null; }
}
async function storageSet(key, val) {
  try { await window.storage.set(key, JSON.stringify(val)); } catch {}
}

// ── Constants ─────────────────────────────────────────────────────────────
const TABS = ["Analyzer", "Portfolio", "Markets", "Settings"];
const TAB_ICONS = { Analyzer: "🔍", Portfolio: "🏘", Markets: "🗺", Settings: "⚙" };

// ── Shared UI ─────────────────────────────────────────────────────────────
const S = {
  card: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 20 },
  label: { fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 6, display: "block" },
};

function KpiBox({ label, value, color = "#00E59B", sub }) {
  return (
    <div style={{ ...S.card, padding: "14px 16px" }}>
      <span style={S.label}>{label}</span>
      <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Badge({ label, color }) {
  return <span style={{ fontSize: 10, color, background: color + "18", border: `1px solid ${color}28`, padding: "3px 9px", borderRadius: 20, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{label}</span>;
}

function Btn({ children, onClick, variant = "primary", disabled, style }) {
  const variants = {
    primary: { background: "linear-gradient(135deg,#00E59B,#0AB87A)", color: "#060A10" },
    ghost: { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.6)", border: "1px solid rgba(255,255,255,0.1)" },
    danger: { background: "rgba(224,92,92,0.1)", color: "#E05C5C", border: "1px solid rgba(224,92,92,0.2)" },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ border: "none", borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 13, padding: "11px 20px", transition: "all 0.15s", opacity: disabled ? 0.5 : 1, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", mono }) {
  return (
    <div>
      {label && <label style={S.label}>{label}</label>}
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type}
        style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 9, padding: "10px 13px", color: "#E8EDF5", fontSize: 13, fontFamily: mono ? "'IBM Plex Mono',monospace" : "'Syne',sans-serif", outline: "none", transition: "border-color 0.2s" }}
        onFocus={e => e.target.style.borderColor = "rgba(0,229,155,0.4)"}
        onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"} />
    </div>
  );
}

function Spinner() {
  return <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.1)", borderTopColor: "#00E59B", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />;
}

function SourcePill({ label }) {
  return <span style={{ fontSize: 9, background: "rgba(0,229,155,0.08)", border: "1px solid rgba(0,229,155,0.15)", color: "rgba(0,229,155,0.7)", padding: "2px 7px", borderRadius: 4, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: "0.06em" }}>{label}</span>;
}

function ScoreRing({ score }) {
  const color = score >= 80 ? "#00E59B" : score >= 65 ? "#4CAF7D" : score >= 50 ? "#F4A636" : "#E05C5C";
  const r = 44, circ = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: 110, height: 110, flexShrink: 0 }}>
      <svg width="110" height="110" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="55" cy="55" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
        <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${(score / 100) * circ} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 1s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 30, fontWeight: 800, color, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em" }}>S8 SCORE</div>
      </div>
    </div>
  );
}

function getVerdict(score) {
  if (score >= 80) return { label: "STRONG BUY", color: "#00E59B" };
  if (score >= 65) return { label: "GOOD DEAL", color: "#4CAF7D" };
  if (score >= 50) return { label: "PROCEED WITH CAUTION", color: "#F4A636" };
  return { label: "NOT RECOMMENDED", color: "#E05C5C" };
}

function calcS8Score(fmr, price, crimeScore, voucherDemand) {
  if (!fmr || !price) return 0;
  const rtp = (fmr / price) * 100;
  const rtpPts = Math.min(40, (rtp / 2) * 40);
  const crimePts = ((crimeScore || 55) / 100) * 25;
  const demandPts = voucherDemand === "HIGH" ? 20 : voucherDemand === "MEDIUM" ? 13 : 7;
  const affordPts = Math.min(15, (300000 / price) * 10);
  return Math.round(rtpPts + crimePts + demandPts + affordPts);
}

// ══════════════════════════════════════════════════════════════════════════
// ANALYZER TAB
// ══════════════════════════════════════════════════════════════════════════
function AnalyzerTab() {
  const [address, setAddress] = useState("");
  const [beds, setBeds] = useState("3");
  const [manualPrice, setManualPrice] = useState("");
  const [status, setStatus] = useState("idle");
  const [steps, setSteps] = useState([]);
  const [result, setResult] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [zillowKey, setZillowKey] = useState("");

  useEffect(() => {
    storageGet("s8scout-zillow-key").then(k => { if (k) setZillowKey(k); });
  }, []);

  function addStep(msg) {
    setSteps(s => {
      const updated = s.map((x, i) => i === s.length - 1 ? { ...x, done: true } : x);
      return [...updated, { msg, done: false }];
    });
  }

  async function analyze() {
    if (!address.trim()) return;
    const zipMatch = address.match(/\b\d{5}\b/);
    const zip = zipMatch ? zipMatch[0] : "";
    const cityStateMatch = address.match(/,\s*([^,]+?)\s+([A-Z]{2})\s*\d{5}/);
    const city = cityStateMatch ? cityStateMatch[1].trim() : "";
    const state = cityStateMatch ? cityStateMatch[2] : "";

    setStatus("loading");
    setResult(null);
    setErrorMsg("");
    setSteps([{ msg: "Starting analysis...", done: false }]);

    try {
      addStep("Fetching real HUD Fair Market Rent...");
      let fmrData;
      try {
        fmrData = await apiFetch("hud-fmr", { zip: zip || "44105", bedrooms: parseInt(beds) });
      } catch {
        fmrData = { fmr: 1200, county: "Unknown", metro: "Unknown", state, year: 2024, bedrooms: parseInt(beds), source: "Estimated" };
      }

      addStep("Fetching live Zillow listing data...");
      let zillowData = null;
      if (zillowKey) {
        try {
          zillowData = await apiFetch("zillow", { address, rapidApiKey: zillowKey });
          if (zillowData.error) zillowData = null;
        } catch { zillowData = null; }
      }

      let price = zillowData?.price || zillowData?.zestimate || null;
      if (!price && manualPrice) price = parseInt(manualPrice.replace(/[^0-9]/g, ""));
      if (!price) price = 150000;

      addStep("Fetching real crime & voucher data...");
      addStep("Running AI analysis with live web research...");

      const analysis = await apiFetch("analyze", {
        address, zip, city, state,
        fmr: fmrData.fmr, price,
        bedrooms: beds,
        s8Score: calcS8Score(fmrData.fmr, price, 55, "MEDIUM")
      });

      const score = calcS8Score(
        fmrData.fmr, price,
        analysis.crime_score || 55,
        analysis.voucher_demand || "MEDIUM"
      );

      setSteps(s => s.map(x => ({ ...x, done: true })));
      setResult({ fmr: fmrData, zillow: zillowData, price, score, analysis, address, zip, city, state, beds });
      setStatus("done");
      setChatMessages([]);
    } catch (err) {
      setErrorMsg(err.message || "Analysis failed. Check that ANTHROPIC_API_KEY is set in Vercel.");
      setStatus("error");
    }
  }

  async function sendChat() {
    if (!chatInput.trim() || chatLoading || !result) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatLoading(true);
    const newMessages = [...chatMessages, { role: "user", content: userMsg }];
    setChatMessages(newMessages);
    try {
      const rtp = ((result.fmr.fmr / result.price) * 100).toFixed(2);
      const data = await apiFetch("chat", {
        messages: newMessages,
        propertyContext: `Address: ${result.address} | ZIP: ${result.zip} | Bedrooms: ${result.beds}BR
HUD FMR: $${result.fmr.fmr}/mo (${result.fmr.county}) | Purchase Price: $${result.price.toLocaleString()}
S8 Score: ${result.score}/100 | Verdict: ${getVerdict(result.score).label}
Rent-to-Price: ${rtp}% | Voucher Demand: ${result.analysis.voucher_demand}
Crime Rating: ${result.analysis.crime_rating} (${result.analysis.crime_score}/100)
Est. Cash Flow: $${result.analysis.cashflow_low}–$${result.analysis.cashflow_high}/mo
Inspection Likelihood: ${result.analysis.inspection_likelihood} | Market Trend: ${result.analysis.market_trend}`
      });
      setChatMessages([...newMessages, { role: "assistant", content: data.reply }]);
    } catch {
      setChatMessages([...newMessages, { role: "assistant", content: "Sorry, couldn't reach the advisor. Try again." }]);
    }
    setChatLoading(false);
  }

  const verdict = result ? getVerdict(result.score) : null;
  const rtp = result ? ((result.fmr.fmr / result.price) * 100).toFixed(2) : null;

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      {/* Search */}
      <div style={{ ...S.card, marginBottom: 16, padding: "22px 24px" }}>
        <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.02em" }}>Property Analyzer</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 18 }}>Real HUD FMR · Live Zillow · FBI crime data · HUD voucher data · AI analysis</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 300px" }}>
            <Field label="Property Address (include ZIP code)" value={address} onChange={setAddress} placeholder="123 Maple St, Cleveland OH 44105" />
          </div>
          <div style={{ flex: "0 0 90px" }}>
            <label style={S.label}>Bedrooms</label>
            <select value={beds} onChange={e => setBeds(e.target.value)} style={{ width: "100%", background: "#101828", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 9, padding: "10px 12px", color: "#E8EDF5", fontSize: 13, outline: "none", fontFamily: "'Syne',sans-serif" }}>
              {["1","2","3","4"].map(n => <option key={n} value={n}>{n} BR</option>)}
            </select>
          </div>
          <div style={{ flex: "0 0 160px" }}>
            <Field label="Price Override (optional)" value={manualPrice} onChange={setManualPrice} placeholder="Leave blank for Zillow" mono />
          </div>
          <Btn onClick={analyze} disabled={status === "loading" || !address.trim()} style={{ flexShrink: 0 }}>
            {status === "loading" ? "Analyzing..." : "Analyze →"}
          </Btn>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "'IBM Plex Mono',monospace" }}>Try:</span>
          {["123 Maple St, Cleveland OH 44105", "456 Oak Ave, Detroit MI 48205", "789 Pine Rd, Philadelphia PA 19132"].map(a => (
            <button key={a} onClick={() => setAddress(a)} style={{ fontSize: 11, color: "rgba(0,229,155,0.7)", background: "rgba(0,229,155,0.07)", border: "1px solid rgba(0,229,155,0.15)", borderRadius: 6, padding: "3px 9px", cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace" }}>{a}</button>
          ))}
        </div>
      </div>

      {/* Loading steps */}
      {status === "loading" && (
        <div style={{ ...S.card, marginBottom: 16 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: i < steps.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              {s.done ? <span style={{ color: "#00E59B", fontSize: 14, width: 16, textAlign: "center" }}>✓</span> : <Spinner />}
              <span style={{ fontSize: 13, color: s.done ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.7)", fontFamily: "'IBM Plex Mono',monospace" }}>{s.msg}</span>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div style={{ ...S.card, borderColor: "rgba(224,92,92,0.3)", background: "rgba(224,92,92,0.05)", marginBottom: 16, color: "#E05C5C", fontSize: 13, lineHeight: 1.6 }}>
          ✕ {errorMsg}
          <div style={{ marginTop: 8, fontSize: 11, color: "rgba(224,92,92,0.6)", fontFamily: "'IBM Plex Mono',monospace" }}>Check Vercel → Settings → Environment Variables → ANTHROPIC_API_KEY is set</div>
        </div>
      )}

      {/* Results */}
      {status === "done" && result && (() => {
        const a = result.analysis;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Score card */}
            <div style={{ ...S.card, background: `linear-gradient(135deg,rgba(12,18,32,0.98) 50%,${verdict.color}10)`, padding: "22px 24px" }}>
              <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
                <ScoreRing score={result.score} />
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 23, fontWeight: 800, color: verdict.color, letterSpacing: "-0.02em", marginBottom: 4 }}>{verdict.label}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 10, fontFamily: "'IBM Plex Mono',monospace" }}>{result.address}</div>
                  {a.headline && <div style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.65, fontStyle: "italic" }}>"{a.headline}"</div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <Badge label={`${a.voucher_demand || "?"} DEMAND`} color={a.voucher_demand === "HIGH" ? "#00E59B" : "#F4A636"} />
                  <Badge label={`CRIME: ${(a.crime_rating || "?").toUpperCase()}`} color={a.crime_rating === "low" ? "#00E59B" : a.crime_rating === "moderate" ? "#F4A636" : "#E05C5C"} />
                  <Badge label={`${(a.market_trend || "stable").toUpperCase()}`} color="#60A5FA" />
                </div>
              </div>
              {a.data_sources && (
                <div style={{ marginTop: 14, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", fontFamily: "'IBM Plex Mono',monospace" }}>DATA SOURCES:</span>
                  {a.data_sources.map((s, i) => <SourcePill key={i} label={s} />)}
                </div>
              )}
            </div>

            {/* Key metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10 }}>
              <KpiBox label="HUD FMR" value={`$${result.fmr.fmr.toLocaleString()}/mo`} color="#00E59B" sub={`${result.beds}BR · ${result.fmr.county || result.zip}`} />
              <KpiBox label="Purchase Price" value={`$${result.price.toLocaleString()}`} color="rgba(255,255,255,0.8)" sub={result.zillow?.source === "zillow_live" ? "Live Zillow" : "Manual / Estimated"} />
              <KpiBox label="Rent/Price Ratio" value={`${rtp}%`} color={parseFloat(rtp) >= 1.0 ? "#00E59B" : "#F4A636"} sub="Target ≥ 1.0%" />
              {a.cashflow_low && <KpiBox label="Est. Cash Flow" value={`$${a.cashflow_low}–${a.cashflow_high}/mo`} color="#F0C060" sub="After all expenses" />}
              {result.zillow?.zestimate && <KpiBox label="Zestimate" value={`$${result.zillow.zestimate.toLocaleString()}`} color="#A78BFA" sub="Zillow estimate" />}
              {a.recommended_offer && <KpiBox label="Recommended Offer" value={`$${a.recommended_offer.toLocaleString()}`} color="#60A5FA" sub="AI suggestion" />}
            </div>

            {/* Score breakdown */}
            <div style={{ ...S.card }}>
              <span style={S.label}>Score Breakdown</span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px" }}>
                {[
                  ["Rent-to-Price (40pts)", Math.min(40, (parseFloat(rtp) / 2) * 40), 40, "#00E59B", a.crime_source ? null : null],
                  ["Crime Safety (25pts)", Math.round(((a.crime_score || 55) / 100) * 25), 25, "#60A5FA"],
                  ["Voucher Demand (20pts)", a.voucher_demand === "HIGH" ? 20 : a.voucher_demand === "MEDIUM" ? 13 : 7, 20, "#A78BFA"],
                  ["Affordability (15pts)", Math.min(15, (300000 / result.price) * 10), 15, "#F0C060"],
                ].map(([label, val, max, color]) => (
                  <div key={label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "'IBM Plex Mono',monospace" }}>{label}</span>
                      <span style={{ fontSize: 11, color, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600 }}>{Math.round(val)}/{max}</span>
                    </div>
                    <div style={{ height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3 }}>
                      <div style={{ height: "100%", width: `${Math.max(0, Math.min(100, (val / max) * 100))}%`, background: color, borderRadius: 3, transition: "width 1s ease" }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {a.crime_source && <SourcePill label={`Crime: ${a.crime_source}`} />}
                {a.voucher_source && <SourcePill label={`Vouchers: ${a.voucher_source}`} />}
              </div>
            </div>

            {/* Neighborhood + voucher intel */}
            {(a.neighborhood_notes || a.housing_authority) && (
              <div style={{ ...S.card, background: "rgba(96,165,250,0.04)", borderColor: "rgba(96,165,250,0.14)" }}>
                <span style={{ ...S.label, color: "#60A5FA" }}>📍 Neighborhood & Voucher Intelligence</span>
                {a.neighborhood_notes && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.65, marginBottom: 8 }}>{a.neighborhood_notes}</div>}
                {a.housing_authority && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>🏛 {a.housing_authority}{a.voucher_waitlist && a.voucher_waitlist !== "unknown" ? ` — Waitlist: ${a.voucher_waitlist}` : ""}{a.total_hcv_units ? ` · ~${a.total_hcv_units.toLocaleString()} active vouchers` : ""}</div>}
              </div>
            )}

            {/* Pros / Risks */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ ...S.card, borderColor: "rgba(0,229,155,0.15)" }}>
                <span style={{ ...S.label, color: "#00E59B" }}>✓ Why This Works</span>
                {a.pros?.map((p, i) => <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 7, display: "flex", gap: 8 }}><span style={{ color: "#00E59B", flexShrink: 0 }}>→</span>{p}</div>)}
              </div>
              <div style={{ ...S.card, borderColor: "rgba(244,166,54,0.15)" }}>
                <span style={{ ...S.label, color: "#F4A636" }}>⚠ Watch Out For</span>
                {a.risks?.map((r, i) => <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 7, display: "flex", gap: 8 }}><span style={{ color: "#F4A636", flexShrink: 0 }}>→</span>{r}</div>)}
              </div>
            </div>

            {/* Tip */}
            {a.tip && (
              <div style={{ ...S.card, display: "flex", gap: 12 }}>
                <div style={{ fontSize: 20 }}>💡</div>
                <div>
                  <span style={S.label}>Investor Tip</span>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.65 }}>{a.tip}</div>
                  <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
                    <div><span style={S.label}>HUD Inspection</span><Badge label={(a.inspection_likelihood || "?").toUpperCase()} color={a.inspection_likelihood === "high" ? "#00E59B" : a.inspection_likelihood === "medium" ? "#F4A636" : "#E05C5C"} /></div>
                    <div><span style={S.label}>Landlord-Friendly</span><Badge label={a.landlord_friendly ? "YES" : "NO"} color={a.landlord_friendly ? "#00E59B" : "#E05C5C"} /></div>
                    {a.voucher_waitlist && a.voucher_waitlist !== "unknown" && <div><span style={S.label}>Voucher Waitlist</span><Badge label={a.voucher_waitlist.toUpperCase()} color={a.voucher_waitlist === "open" ? "#00E59B" : "#F4A636"} /></div>}
                  </div>
                </div>
              </div>
            )}

            {/* AI Chat */}
            <div style={{ ...S.card }}>
              <span style={{ ...S.label, color: "rgba(255,255,255,0.4)" }}>💬 AI Advisor — Ask Anything About This Property</span>
              <div style={{ maxHeight: 240, overflowY: "auto", marginBottom: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                {chatMessages.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>Ask about inspection requirements, financing, tenant screening, cash flow, negotiation strategy...</div>}
                {chatMessages.map((m, i) => (
                  <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "82%", background: m.role === "user" ? "rgba(0,229,155,0.1)" : "rgba(255,255,255,0.04)", border: `1px solid ${m.role === "user" ? "rgba(0,229,155,0.2)" : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "9px 13px", fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.6 }}>{m.content}</div>
                ))}
                {chatLoading && <div style={{ alignSelf: "flex-start", fontSize: 12, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>Thinking...</div>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendChat()} placeholder="Will this pass HUD inspection? What should I offer?" style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 9, padding: "9px 13px", color: "#E8EDF5", fontSize: 13, outline: "none", fontFamily: "'Syne',sans-serif" }} />
                <Btn onClick={sendChat} disabled={chatLoading || !chatInput.trim()} style={{ padding: "9px 16px" }}>Send</Btn>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// PORTFOLIO TAB
// ══════════════════════════════════════════════════════════════════════════
const SAMPLE_PROPS = [
  { id:"1", address:"123 Maple St", city:"Cleveland", state:"OH", zip:"44105", bedrooms:3, bathrooms:1, purchasePrice:89000, purchaseDate:"2023-06-15", fmr:1340, monthlyRent:1340, status:"occupied", tenant:"Johnson Family", leaseStart:"2023-08-01", leaseEnd:"2024-07-31", s8Score:82, mortgagePayment:620, insurance:90, taxes:95, maintenance:60, inspectionDate:"2024-03-15", inspectionStatus:"passed", nextInspection:"2025-03-15", notes:"Great tenant.", rentHistory:[{month:"2024-01",paid:true,amount:1340},{month:"2024-02",paid:true,amount:1340},{month:"2024-03",paid:true,amount:1340}] },
  { id:"2", address:"456 Oak Ave", city:"Detroit", state:"MI", zip:"48205", bedrooms:3, bathrooms:1, purchasePrice:65000, purchaseDate:"2022-11-20", fmr:1350, monthlyRent:1350, status:"occupied", tenant:"Williams Family", leaseStart:"2023-01-01", leaseEnd:"2024-12-31", s8Score:76, mortgagePayment:480, insurance:85, taxes:72, maintenance:80, inspectionDate:"2023-11-10", inspectionStatus:"passed", nextInspection:"2024-11-10", notes:"Minor plumbing fix needed.", rentHistory:[{month:"2024-01",paid:true,amount:1350},{month:"2024-02",paid:true,amount:1350},{month:"2024-03",paid:false,amount:0}] },
  { id:"3", address:"789 Pine Rd", city:"Philadelphia", state:"PA", zip:"19132", bedrooms:4, bathrooms:2, purchasePrice:128000, purchaseDate:"2024-01-08", fmr:1740, monthlyRent:1740, status:"vacant", tenant:"", leaseStart:"", leaseEnd:"", s8Score:71, mortgagePayment:890, insurance:110, taxes:140, maintenance:50, inspectionDate:"", inspectionStatus:"pending", nextInspection:"2024-08-20", notes:"Awaiting HUD inspection.", rentHistory:[] },
];

const cfCalc = p => p.monthlyRent - p.mortgagePayment - p.insurance - p.taxes - p.maintenance;
const roiCalc = p => ((cfCalc(p) * 12) / p.purchasePrice * 100).toFixed(1);
const daysUntil = s => s ? Math.ceil((new Date(s) - new Date()) / 86400000) : null;
const fmtD = s => s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const fmtM = n => "$" + Number(n).toLocaleString();

function PortfolioTab() {
  const [props, setProps] = useState([]);
  const [selId, setSelId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editP, setEditP] = useState(null);
  const [dtab, setDtab] = useState("overview");
  const [loaded, setLoaded] = useState(false);
  const EMPTY = { id:"",address:"",city:"",state:"",zip:"",bedrooms:3,bathrooms:1,purchasePrice:"",purchaseDate:"",fmr:"",monthlyRent:"",status:"vacant",tenant:"",leaseStart:"",leaseEnd:"",s8Score:"",mortgagePayment:"",insurance:"",taxes:"",maintenance:"",inspectionDate:"",inspectionStatus:"pending",nextInspection:"",notes:"",rentHistory:[] };
  const [form, setForm] = useState(EMPTY);

  useEffect(() => { storageGet("s8scout-portfolio").then(d => { const data = d && d.length > 0 ? d : SAMPLE_PROPS; setProps(data); setSelId(data[0]?.id); setLoaded(true); }); }, []);
  useEffect(() => { if (loaded) storageSet("s8scout-portfolio", props); }, [props, loaded]);

  const sel = props.find(p => p.id === selId);
  const totalCF = props.reduce((a, p) => a + cfCalc(p), 0);
  const occupied = props.filter(p => p.status === "occupied").length;
  const totalRent = props.filter(p => p.status === "occupied").reduce((a, p) => a + p.monthlyRent, 0);
  const updateP = p => setProps(ps => ps.map(x => x.id === p.id ? p : x));
  const deleteP = id => { if (!confirm("Remove this property?")) return; setProps(ps => ps.filter(p => p.id !== id)); if (selId === id) setSelId(null); };
  const saveP = p => { setProps(ps => ps.find(x => x.id === p.id) ? ps.map(x => x.id === p.id ? p : x) : [...ps, p]); setSelId(p.id); setShowAdd(false); setEditP(null); };
  const setF = k => v => setForm(f => ({ ...f, [k]: v }));

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginBottom: 16 }}>
        <KpiBox label="Total Units" value={props.length} color="rgba(255,255,255,0.8)" sub={`${occupied} occupied`} />
        <KpiBox label="Monthly Income" value={fmtM(totalRent)} color="#00E59B" />
        <KpiBox label="Total Cash Flow" value={`${totalCF >= 0 ? "+" : ""}${fmtM(totalCF)}`} color={totalCF >= 0 ? "#00E59B" : "#E05C5C"} />
        <KpiBox label="Occupancy" value={`${props.length > 0 ? Math.round((occupied / props.length) * 100) : 0}%`} color="#A78BFA" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 14 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono',monospace" }}>{props.length} PROPERTIES</span>
            <Btn onClick={() => { setForm({ ...EMPTY }); setEditP(null); setShowAdd(true); }} style={{ padding: "7px 14px", fontSize: 12 }}>+ Add</Btn>
          </div>
          {props.map(p => {
            const cf = cfCalc(p), isSel = selId === p.id;
            return (
              <div key={p.id} onClick={() => { setSelId(p.id); setDtab("overview"); }} style={{ ...S.card, cursor: "pointer", borderColor: isSel ? "rgba(0,229,155,0.3)" : "rgba(255,255,255,0.08)", background: isSel ? "rgba(0,229,155,0.05)" : "rgba(255,255,255,0.02)", padding: 14, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{p.address}</div><Badge label={p.status} color={p.status === "occupied" ? "#00E59B" : "#F4A636"} /></div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 7 }}>{p.city}, {p.state} · {p.bedrooms}BR</div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: cf >= 0 ? "#00E59B" : "#E05C5C" }}>{cf >= 0 ? "+" : ""}{fmtM(cf)}/mo</span>
                  <span style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: "rgba(255,255,255,0.3)" }}>ROI {roiCalc(p)}%</span>
                </div>
              </div>
            );
          })}
        </div>
        {sel ? (
          <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 20px 0", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div><div style={{ fontSize: 16, fontWeight: 700 }}>{sel.address}</div><div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{sel.city}, {sel.state} {sel.zip} · {sel.bedrooms}BR/{sel.bathrooms}BA</div></div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn onClick={() => { setForm({ ...sel }); setEditP(sel); setShowAdd(true); }} variant="ghost" style={{ padding: "6px 12px", fontSize: 11 }}>✏ Edit</Btn>
                  <Btn onClick={() => deleteP(sel.id)} variant="danger" style={{ padding: "6px 12px", fontSize: 11 }}>✕</Btn>
                </div>
              </div>
              <div style={{ display: "flex" }}>
                {["overview", "financials", "inspection", "rent history", "notes"].map(t => (
                  <button key={t} onClick={() => setDtab(t)} style={{ background: "transparent", border: "none", borderBottom: `2px solid ${dtab === t ? "#00E59B" : "transparent"}`, color: dtab === t ? "#00E59B" : "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: "0.06em", textTransform: "uppercase", padding: "7px 12px", cursor: "pointer", whiteSpace: "nowrap" }}>{t}</button>
                ))}
              </div>
            </div>
            <div style={{ padding: 20 }}>
              {dtab === "overview" && <div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}><KpiBox label="Cash Flow" value={`${cfCalc(sel) >= 0 ? "+" : ""}${fmtM(cfCalc(sel))}/mo`} color={cfCalc(sel) >= 0 ? "#00E59B" : "#E05C5C"} /><KpiBox label="Annual ROI" value={`${roiCalc(sel)}%`} color="#A78BFA" /><KpiBox label="HUD FMR" value={fmtM(sel.fmr) + "/mo"} color="#60A5FA" /><KpiBox label="S8 Score" value={sel.s8Score || "—"} color={sel.s8Score >= 70 ? "#00E59B" : "#F4A636"} /></div>{sel.tenant && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>👤 {sel.tenant} · {fmtD(sel.leaseStart)} – {fmtD(sel.leaseEnd)}</div>}</div>}
              {dtab === "financials" && <div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}><div style={S.card}><span style={{ ...S.label, color: "#00E59B" }}>Income</span><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Monthly Rent</span><span style={{ color: "#00E59B", fontFamily: "'IBM Plex Mono',monospace" }}>{fmtM(sel.monthlyRent)}</span></div></div><div style={S.card}><span style={{ ...S.label, color: "#E05C5C" }}>Expenses</span>{[["Mortgage", sel.mortgagePayment], ["Insurance", sel.insurance], ["Taxes", sel.taxes], ["Maintenance", sel.maintenance]].map(([k, v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}><span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{k}</span><span style={{ color: "#E05C5C", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>−{fmtM(v)}</span></div>)}</div></div><div style={{ ...S.card, marginTop: 10, background: cfCalc(sel) >= 0 ? "rgba(0,229,155,0.05)" : "rgba(224,92,92,0.05)", borderColor: cfCalc(sel) >= 0 ? "rgba(0,229,155,0.2)" : "rgba(224,92,92,0.2)", display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Net Cash Flow</span><span style={{ fontSize: 26, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, color: cfCalc(sel) >= 0 ? "#00E59B" : "#E05C5C" }}>{cfCalc(sel) >= 0 ? "+" : ""}{fmtM(cfCalc(sel))}</span></div></div>}
              {dtab === "inspection" && <div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><KpiBox label="Last Inspection" value={fmtD(sel.inspectionDate)} color="rgba(255,255,255,0.7)" /><KpiBox label="Next Inspection" value={fmtD(sel.nextInspection)} color={daysUntil(sel.nextInspection) <= 30 ? "#F4A636" : "#E8EDF5"} sub={daysUntil(sel.nextInspection) !== null ? `${daysUntil(sel.nextInspection)} days` : ""} /></div><div style={{ marginTop: 12 }}><Badge label={sel.inspectionStatus.toUpperCase()} color={sel.inspectionStatus === "passed" ? "#00E59B" : "#F4A636"} /></div></div>}
              {dtab === "rent history" && <div><div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{sel.rentHistory.filter(r => r.paid).length}/{sel.rentHistory.length} paid</span><Btn onClick={() => { const now = new Date(); const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; if (!sel.rentHistory.find(r => r.month === month)) updateP({ ...sel, rentHistory: [...sel.rentHistory, { month, paid: false, amount: 0 }] }); }} style={{ padding: "5px 12px", fontSize: 11 }}>+ Month</Btn></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(100px,1fr))", gap: 8 }}>{[...sel.rentHistory].sort((a, b) => b.month.localeCompare(a.month)).map(r => { const idx = sel.rentHistory.findIndex(x => x.month === r.month); return (<div key={r.month} onClick={() => { const u = [...sel.rentHistory]; u[idx] = { ...u[idx], paid: !u[idx].paid, amount: u[idx].paid ? 0 : sel.monthlyRent }; updateP({ ...sel, rentHistory: u }); }} style={{ ...S.card, padding: "9px 11px", cursor: "pointer", background: r.paid ? "rgba(0,229,155,0.07)" : "rgba(224,92,92,0.05)", borderColor: r.paid ? "rgba(0,229,155,0.2)" : "rgba(224,92,92,0.15)" }}><div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 3 }}>{new Date(r.month + "-01").toLocaleDateString("en-US", { month: "short", year: "numeric" })}</div><div style={{ fontSize: 13, fontWeight: 700, color: r.paid ? "#00E59B" : "#E05C5C", fontFamily: "'IBM Plex Mono',monospace" }}>{r.paid ? fmtM(r.amount) : "Unpaid"}</div></div>); })}</div></div>}
              {dtab === "notes" && <textarea value={sel.notes} onChange={e => updateP({ ...sel, notes: e.target.value })} style={{ width: "100%", minHeight: 140, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 14, color: "#E8EDF5", fontSize: 13, lineHeight: 1.65, resize: "vertical", outline: "none", fontFamily: "inherit" }} />}
            </div>
          </div>
        ) : (
          <div style={{ ...S.card, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.2)", fontSize: 13, borderStyle: "dashed" }}>Select a property to view details</div>
        )}
      </div>
      {showAdd && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(6px)" }} onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div style={{ background: "#0C1220", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 26, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}><div style={{ fontSize: 16, fontWeight: 700 }}>{editP ? "Edit" : "Add"} Property</div><button onClick={() => setShowAdd(false)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 16 }}>✕</button></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Address" value={form.address} onChange={setF("address")} placeholder="123 Maple St" />
              <div style={{ display: "flex", gap: 10 }}><div style={{ flex: 2 }}><Field label="City" value={form.city} onChange={setF("city")} /></div><div style={{ flex: 1 }}><Field label="State" value={form.state} onChange={setF("state")} /></div><div style={{ flex: 1 }}><Field label="ZIP" value={form.zip} onChange={setF("zip")} /></div></div>
              <div style={{ display: "flex", gap: 10 }}><div style={{ flex: 1 }}><Field label="Purchase Price" value={form.purchasePrice} onChange={setF("purchasePrice")} type="number" /></div><div style={{ flex: 1 }}><Field label="HUD FMR" value={form.fmr} onChange={setF("fmr")} type="number" /></div><div style={{ flex: 1 }}><Field label="Monthly Rent" value={form.monthlyRent} onChange={setF("monthlyRent")} type="number" /></div></div>
              <div style={{ display: "flex", gap: 10 }}><div style={{ flex: 1 }}><Field label="Mortgage" value={form.mortgagePayment} onChange={setF("mortgagePayment")} type="number" /></div><div style={{ flex: 1 }}><Field label="Insurance" value={form.insurance} onChange={setF("insurance")} type="number" /></div><div style={{ flex: 1 }}><Field label="Taxes" value={form.taxes} onChange={setF("taxes")} type="number" /></div><div style={{ flex: 1 }}><Field label="Maintenance" value={form.maintenance} onChange={setF("maintenance")} type="number" /></div></div>
              <Field label="Tenant Name" value={form.tenant} onChange={setF("tenant")} />
              <div style={{ display: "flex", gap: 10 }}><div style={{ flex: 1 }}><Field label="Lease Start" value={form.leaseStart} onChange={setF("leaseStart")} type="date" /></div><div style={{ flex: 1 }}><Field label="Lease End" value={form.leaseEnd} onChange={setF("leaseEnd")} type="date" /></div><div style={{ flex: 1 }}><Field label="Next Inspection" value={form.nextInspection} onChange={setF("nextInspection")} type="date" /></div></div>
              <div style={{ display: "flex", gap: 10, marginTop: 8 }}><Btn onClick={() => setShowAdd(false)} variant="ghost" style={{ flex: 1 }}>Cancel</Btn><Btn onClick={() => saveP({ ...form, id: form.id || String(Date.now()) })} style={{ flex: 2 }}>{editP ? "Save Changes" : "Add Property"}</Btn></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// MARKETS TAB
// ══════════════════════════════════════════════════════════════════════════
const MARKETS_DATA = [
  {id:1,city:"Cleveland",state:"OH",region:"Midwest",fmr3:1340,medianPrice:89000,crimeIndex:58,voucherDemand:"HIGH",vouchers:12400,landlordFriendly:true},
  {id:2,city:"Detroit",state:"MI",region:"Midwest",fmr3:1350,medianPrice:72000,crimeIndex:52,voucherDemand:"HIGH",vouchers:18900,landlordFriendly:true},
  {id:3,city:"Memphis",state:"TN",region:"South",fmr3:1180,medianPrice:105000,crimeIndex:44,voucherDemand:"HIGH",vouchers:14200,landlordFriendly:true},
  {id:4,city:"Birmingham",state:"AL",region:"South",fmr3:1090,medianPrice:118000,crimeIndex:46,voucherDemand:"HIGH",vouchers:9800,landlordFriendly:true},
  {id:5,city:"Indianapolis",state:"IN",region:"Midwest",fmr3:1210,medianPrice:155000,crimeIndex:55,voucherDemand:"HIGH",vouchers:16100,landlordFriendly:true},
  {id:6,city:"Kansas City",state:"MO",region:"Midwest",fmr3:1250,medianPrice:172000,crimeIndex:53,voucherDemand:"MEDIUM",vouchers:10500,landlordFriendly:true},
  {id:7,city:"St. Louis",state:"MO",region:"Midwest",fmr3:1100,medianPrice:130000,crimeIndex:47,voucherDemand:"HIGH",vouchers:13600,landlordFriendly:true},
  {id:8,city:"Baltimore",state:"MD",region:"Northeast",fmr3:1620,medianPrice:145000,crimeIndex:45,voucherDemand:"HIGH",vouchers:21000,landlordFriendly:false},
  {id:9,city:"Philadelphia",state:"PA",region:"Northeast",fmr3:1480,medianPrice:175000,crimeIndex:50,voucherDemand:"HIGH",vouchers:24300,landlordFriendly:false},
  {id:10,city:"Columbus",state:"OH",region:"Midwest",fmr3:1230,medianPrice:198000,crimeIndex:58,voucherDemand:"MEDIUM",vouchers:11200,landlordFriendly:true},
  {id:11,city:"Milwaukee",state:"WI",region:"Midwest",fmr3:1160,medianPrice:138000,crimeIndex:49,voucherDemand:"HIGH",vouchers:12800,landlordFriendly:true},
  {id:12,city:"Atlanta",state:"GA",region:"South",fmr3:1640,medianPrice:285000,crimeIndex:50,voucherDemand:"HIGH",vouchers:29800,landlordFriendly:true},
  {id:13,city:"Houston",state:"TX",region:"South",fmr3:1450,medianPrice:195000,crimeIndex:53,voucherDemand:"HIGH",vouchers:38500,landlordFriendly:true},
  {id:14,city:"Dallas",state:"TX",region:"South",fmr3:1620,medianPrice:278000,crimeIndex:55,voucherDemand:"HIGH",vouchers:31200,landlordFriendly:true},
  {id:15,city:"Louisville",state:"KY",region:"South",fmr3:1100,medianPrice:168000,crimeIndex:55,voucherDemand:"MEDIUM",vouchers:8600,landlordFriendly:true},
];

const mktScore = m => { const rtp = (m.fmr3 / m.medianPrice) * 100; return Math.round(Math.min(40, (rtp / 2) * 40) + (m.crimeIndex / 100) * 25 + (m.voucherDemand === "HIGH" ? 20 : 13) + Math.min(15, (300000 / m.medianPrice) * 10)); };

function MarketsTab() {
  const [sortBy, setSortBy] = useState("score");
  const [filterRegion, setFilterRegion] = useState("all");
  const [selected, setSelected] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const scored = MARKETS_DATA.map(m => ({ ...m, score: mktScore(m), rtp: ((m.fmr3 / m.medianPrice) * 100).toFixed(2) }));
  const filtered = scored.filter(m => filterRegion === "all" || m.region === filterRegion);
  const sorted = [...filtered].sort((a, b) => sortBy === "score" ? b.score - a.score : sortBy === "rtp" ? b.rtp - a.rtp : sortBy === "fmr" ? b.fmr3 - a.fmr3 : a.medianPrice - b.medianPrice);

  async function selectMarket(m) {
    setSelected(m); setAnalysis(null); setLoading(true);
    try {
      const data = await apiFetch("market", { city: m.city, state: m.state, fmr3: m.fmr3, medianPrice: m.medianPrice, vouchers: m.vouchers, voucherDemand: m.voucherDemand, score: m.score, landlordFriendly: m.landlordFriendly });
      setAnalysis(data);
    } catch { setAnalysis(null); }
    setLoading(false);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        {["all","Midwest","South","Northeast"].map(r => (
          <button key={r} onClick={() => setFilterRegion(r)} style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", background: filterRegion === r ? "rgba(0,229,155,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${filterRegion === r ? "rgba(0,229,155,0.3)" : "rgba(255,255,255,0.08)"}`, color: filterRegion === r ? "#00E59B" : "rgba(255,255,255,0.4)", borderRadius: 20, padding: "5px 14px", cursor: "pointer" }}>{r === "all" ? "All Regions" : r}</button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "'IBM Plex Mono',monospace", alignSelf: "center" }}>SORT:</span>
          {[["score","Score"],["rtp","Rent/Price"],["fmr","FMR"],["price","Price ↑"]].map(([v, l]) => (
            <button key={v} onClick={() => setSortBy(v)} style={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", background: sortBy === v ? "rgba(0,229,155,0.12)" : "transparent", border: `1px solid ${sortBy === v ? "rgba(0,229,155,0.25)" : "rgba(255,255,255,0.08)"}`, color: sortBy === v ? "#00E59B" : "rgba(255,255,255,0.35)", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 400px" : "1fr", gap: 14 }}>
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "32px 1fr 80px 80px 68px 90px", gap: 10, padding: "6px 14px", marginBottom: 4 }}>
            {["#","MARKET","FMR 3BR","MED PRICE","RTP","VERDICT"].map(h => <div key={h} style={{ fontSize: 9, color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em", fontFamily: "'IBM Plex Mono',monospace" }}>{h}</div>)}
          </div>
          {sorted.map((m, i) => {
            const isSel = selected?.id === m.id;
            const v = m.score >= 72 ? { label: "TOP MARKET", color: "#00E59B" } : m.score >= 58 ? { label: "STRONG", color: "#4CAF7D" } : { label: "MODERATE", color: "#F4A636" };
            return (
              <div key={m.id} onClick={() => isSel ? setSelected(null) : selectMarket(m)} style={{ display: "grid", gridTemplateColumns: "32px 1fr 80px 80px 68px 90px", gap: 10, padding: "12px 14px", background: isSel ? "rgba(0,229,155,0.06)" : "rgba(255,255,255,0.02)", border: `1px solid ${isSel ? "rgba(0,229,155,0.25)" : "rgba(255,255,255,0.06)"}`, borderRadius: 10, marginBottom: 6, cursor: "pointer", alignItems: "center" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", fontFamily: "'IBM Plex Mono',monospace" }}>#{i + 1}</div>
                <div><div style={{ fontSize: 13, fontWeight: 700 }}>{m.city}, {m.state}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono',monospace" }}>{m.region}{m.landlordFriendly ? " · LL-friendly" : ""}</div></div>
                <div style={{ fontSize: 13, fontFamily: "'IBM Plex Mono',monospace", color: "#00E59B", fontWeight: 600 }}>${m.fmr3.toLocaleString()}</div>
                <div style={{ fontSize: 13, fontFamily: "'IBM Plex Mono',monospace", color: "rgba(255,255,255,0.7)" }}>${(m.medianPrice / 1000).toFixed(0)}K</div>
                <div style={{ fontSize: 13, fontFamily: "'IBM Plex Mono',monospace", color: parseFloat(m.rtp) >= 1 ? "#00E59B" : "#F4A636", fontWeight: 600 }}>{m.rtp}%</div>
                <Badge label={v.label} color={v.color} />
              </div>
            );
          })}
        </div>
        {selected && (
          <div style={{ ...S.card, position: "sticky", top: 16, maxHeight: "calc(100vh - 80px)", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
              <div><div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>{selected.city}, <span style={{ color: "rgba(255,255,255,0.4)" }}>{selected.state}</span></div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono',monospace", marginTop: 2 }}>S8 Score: {selected.score}/100</div></div>
              <button onClick={() => setSelected(null)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              <KpiBox label="HUD FMR 3BR" value={`$${selected.fmr3.toLocaleString()}`} color="#00E59B" />
              <KpiBox label="Rent/Price" value={`${selected.rtp}%`} color={parseFloat(selected.rtp) >= 1 ? "#00E59B" : "#F4A636"} />
              <KpiBox label="Med. Price" value={`$${(selected.medianPrice / 1000).toFixed(0)}K`} color="#A78BFA" />
              <KpiBox label="Vouchers" value={selected.vouchers.toLocaleString()} color="#60A5FA" />
            </div>
            {loading && <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0" }}><Spinner /><span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", fontFamily: "'IBM Plex Mono',monospace" }}>Researching live market data...</span></div>}
            {analysis && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.65 }}>{analysis.summary}</div>
                <div style={{ ...S.card, background: "rgba(0,229,155,0.05)", borderColor: "rgba(0,229,155,0.12)", padding: 12 }}>
                  <span style={{ ...S.label, color: "#00E59B" }}>Est. Cash Flow (3BR)</span>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#00E59B", fontFamily: "'IBM Plex Mono',monospace" }}>${analysis.cashFlowEstimate?.low}–${analysis.cashFlowEstimate?.high}/mo</div>
                </div>
                {analysis.housingAuthorityNotes && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 12px" }}>🏛 {analysis.housingAuthorityNotes}</div>}
                {analysis.bestNeighborhoods && <div><span style={{ ...S.label, color: "#A78BFA" }}>Best Neighborhoods</span><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{analysis.bestNeighborhoods.map((n, i) => <span key={i} style={{ fontSize: 11, background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.2)", color: "rgba(255,255,255,0.65)", padding: "3px 10px", borderRadius: 16 }}>{n}</span>)}</div></div>}
                {analysis.recentNews && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 10px" }}>📰 {analysis.recentNews}</div>}
                {analysis.investorTip && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "10px 12px", lineHeight: 1.6 }}>💡 {analysis.investorTip}</div>}
                {analysis.data_sources && <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{analysis.data_sources.map((s, i) => <SourcePill key={i} label={s} />)}</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// SETTINGS TAB
// ══════════════════════════════════════════════════════════════════════════
function SettingsTab() {
  const [zillowKey, setZillowKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [serverOk, setServerOk] = useState(null); // null=loading, true=ok, false=error

  useEffect(() => {
    // Load saved Zillow key from storage
    storageGet("s8scout-zillow-key").then(k => { if (k) setZillowKey(k); });
    // Check server health
    fetch("/api/status").then(r => r.json()).then(d => setServerOk(d.hasAnthropicKey)).catch(() => setServerOk(false));
  }, []);

  function saveZillowKey() {
    storageSet("s8scout-zillow-key", zillowKey.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function clearZillowKey() {
    setZillowKey("");
    storageSet("s8scout-zillow-key", "");
  }

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 4, letterSpacing: "-0.02em" }}>Settings</div>
      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 24 }}>Manage your optional integrations.</div>

      {/* Server status */}
      <div style={{ ...S.card, marginBottom: 14, borderColor: serverOk === null ? "rgba(255,255,255,0.08)" : serverOk ? "rgba(0,229,155,0.2)" : "rgba(224,92,92,0.25)", background: serverOk ? "rgba(0,229,155,0.03)" : serverOk === false ? "rgba(224,92,92,0.04)" : "rgba(255,255,255,0.02)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: serverOk === null ? "#F4A636" : serverOk ? "#00E59B" : "#E05C5C" }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>
              {serverOk === null ? "Checking server..." : serverOk ? "AI Engine Online" : "AI Engine Offline"}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              {serverOk === null ? "Verifying connection..." : serverOk ? "HUD FMR data, crime stats, voucher demand, and AI analysis are all active." : "ANTHROPIC_API_KEY is missing from Vercel environment variables. Add it to enable analysis."}
            </div>
          </div>
        </div>
      </div>

      {/* Zillow key — only user-facing key */}
      <div style={{ ...S.card, marginBottom: 14 }}>
        <span style={S.label}>Zillow Integration (Optional)</span>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", lineHeight: 1.65, marginBottom: 14 }}>
          Add your free RapidAPI key to automatically pull live Zillow listing prices. Without it, just enter the price manually in the Analyzer.
        </div>
        <Field label="RapidAPI Key (ZLLW Working API)" value={zillowKey} onChange={setZillowKey} placeholder="Paste your X-RapidAPI-Key here" mono />
        <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <Btn onClick={saveZillowKey} style={{ padding: "9px 18px" }}>{saved ? "✓ Saved!" : "Save Key"}</Btn>
          {zillowKey && <Btn onClick={clearZillowKey} variant="danger" style={{ padding: "9px 14px", fontSize: 12 }}>Clear</Btn>}
          <a href="https://rapidapi.com/search/ZLLW" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#00E59B", fontFamily: "'IBM Plex Mono',monospace", textDecoration: "none", marginLeft: 4 }}>Get free key →</a>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "'IBM Plex Mono',monospace" }}>
          Free tier: 500 calls/month · Key stored locally in your browser
        </div>
      </div>

      {/* What's included free */}
      <div style={{ ...S.card, background: "rgba(0,229,155,0.03)", borderColor: "rgba(0,229,155,0.1)" }}>
        <span style={{ ...S.label, color: "#00E59B" }}>What's Included — No Setup Needed</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            ["🏛", "HUD Fair Market Rent", "Real FMR for any ZIP — pulled live via AI web search"],
            ["🔫", "FBI Crime Data", "Real violent crime stats from FBI UCR database"],
            ["🎫", "HUD Voucher Demand", "Real Housing Choice Voucher counts from HUD open data"],
            ["🤖", "AI Property Analysis", "Full Claude AI analysis with live web research"],
            ["💬", "AI Advisor Chat", "Ask anything about any property you analyze"],
            ["🗺", "Market Explorer", "AI deep dives on 15+ Section 8 markets"],
          ].map(([icon, title, desc]) => (
            <div key={title} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{title}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{desc}</div>
              </div>
              <Badge label="FREE" color="#00E59B" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ROOT APP
// ══════════════════════════════════════════════════════════════════════════
export default function Section8Scout() {
  const [activeTab, setActiveTab] = useState("Analyzer");
  const [apiStatus, setApiStatus] = useState({ hasAnthropicKey: false, hasRapidKey: false, hasFbiKey: false });

  useEffect(() => {
    fetch("/api/status").then(r => r.json()).then(setApiStatus).catch(() => {});
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#060A10", color: "#E8EDF5", fontFamily: "'Syne',sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:rgba(0,229,155,0.3);border-radius:2px}
        select,textarea{font-family:inherit}
      `}</style>

      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "linear-gradient(rgba(0,229,155,0.018) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,155,0.018) 1px,transparent 1px)", backgroundSize: "52px 52px", pointerEvents: "none" }} />

      {/* Nav */}
      <div style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(6,10,16,0.93)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 20px 13px 0", borderRight: "1px solid rgba(255,255,255,0.07)", marginRight: 8, flexShrink: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#00E59B,#0AB87A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🏠</div>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 15, fontWeight: 700 }}>Section8<span style={{ color: "#00E59B" }}>Scout</span></span>
          </div>
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ background: "transparent", border: "none", borderBottom: `2px solid ${activeTab === tab ? "#00E59B" : "transparent"}`, color: activeTab === tab ? "#00E59B" : "rgba(255,255,255,0.4)", fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, letterSpacing: "0.06em", padding: "18px 16px 16px", cursor: "pointer", transition: "color 0.15s", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <span>{TAB_ICONS[tab]}</span>{tab}
            </button>
          ))}
          {/* Live status dot */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: apiStatus.hasAnthropicKey ? "#00E59B" : "#E05C5C" }} />
            <span style={{ fontSize: 9, fontFamily: "'IBM Plex Mono',monospace", color: "rgba(255,255,255,0.3)" }}>{apiStatus.hasAnthropicKey ? "ONLINE" : "OFFLINE"}</span>
          </div>
        </div>
      </div>

      <div style={{ position: "relative", zIndex: 1, maxWidth: 1100, margin: "0 auto", padding: "28px 24px 80px", animation: "fadeUp 0.4s ease both" }}>
        {activeTab === "Analyzer" && <AnalyzerTab />}
        {activeTab === "Portfolio" && <PortfolioTab />}
        {activeTab === "Markets" && <MarketsTab />}
        {activeTab === "Settings" && <SettingsTab />}
      </div>
    </div>
  );
}
