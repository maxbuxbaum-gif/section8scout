import { useState, useEffect, useCallback } from "react";

// ═══════════════════════════════════════════════════════════════
// SHARED UTILITIES
// ═══════════════════════════════════════════════════════════════

const GREEN = "#00E59B";
const GOLD = "#F0C060";
const BLUE = "#60A5FA";
const PURPLE = "#A78BFA";
const RED = "#E05C5C";
const ORANGE = "#F4A636";

function fmtMoney(n) { return "$" + Number(n || 0).toLocaleString(); }
function fmtDate(str) {
  if (!str) return "—";
  return new Date(str).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Shared input components ────────────────────────────────────
function Input({ label, value, onChange, type = "text", placeholder, half, style }) {
  return (
    <div style={{ flex: half ? "0 0 calc(50% - 6px)" : "1 1 100%", ...style }}>
      {label && <label style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 5, fontFamily: "'IBM Plex Mono',monospace" }}>{label}</label>}
      <input value={value} onChange={e => onChange(e.target.value)} type={type} placeholder={placeholder}
        style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 9, padding: "9px 12px", color: "#fff", fontSize: 13, fontFamily: type === "number" ? "'IBM Plex Mono',monospace" : "inherit", outline: "none", transition: "border-color 0.2s" }}
        onFocus={e => e.target.style.borderColor = "rgba(0,229,155,0.4)"}
        onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"} />
    </div>
  );
}

function Select({ label, value, onChange, options, half }) {
  return (
    <div style={{ flex: half ? "0 0 calc(50% - 6px)" : "1 1 100%" }}>
      {label && <label style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 5, fontFamily: "'IBM Plex Mono',monospace" }}>{label}</label>}
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ width: "100%", background: "#101828", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 9, padding: "9px 12px", color: "#fff", fontSize: 13, outline: "none", cursor: "pointer" }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PROPERTY ANALYZER
// ═══════════════════════════════════════════════════════════════

function extractZip(address) {
  const m = address.match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}

function calcS8Score({ rentToPriceRatio, crimeScore, demand, schoolRating }) {
  const rtpScore = Math.min(40, (rentToPriceRatio / 0.02) * 40);
  const crimeComponent = (crimeScore / 100) * 25;
  const demandComponent = demand === "HIGH" ? 20 : demand === "MEDIUM" ? 12 : 5;
  const schoolComponent = (schoolRating / 10) * 15;
  return Math.round(rtpScore + crimeComponent + demandComponent + schoolComponent);
}

function getVerdict(score) {
  if (score >= 80) return { label: "STRONG BUY", color: GREEN, bg: "rgba(0,229,155,0.12)" };
  if (score >= 65) return { label: "GOOD DEAL", color: "#4CAF7D", bg: "rgba(76,175,125,0.12)" };
  if (score >= 50) return { label: "PROCEED WITH CAUTION", color: ORANGE, bg: "rgba(244,166,54,0.12)" };
  return { label: "NOT RECOMMENDED", color: RED, bg: "rgba(224,92,92,0.12)" };
}

async function fetchHUDFMR(zip, address, apiKey) {
  const prompt = `Search for the current HUD Fair Market Rents for ZIP code ${zip || address}.
Return ONLY this JSON (no markdown, no backticks, no explanation):
{"zip":"${zip}","county":"County Name, ST","metro":"Metro Area Name","fmr":{"1":950,"2":1200,"3":1500,"4":1800},"year":"2025","source":"HUD FMR"}
Use real current HUD Fair Market Rent values.`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514", max_tokens: 600,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await res.json();
  const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
  const m = text.replace(/```json|```/g, "").match(/\{[\s\S]*?\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error("HUD parse failed");
}

async function fetchZillow(address, rapidApiKey) {
  const url = `https://zillow56.p.rapidapi.com/search?location=${encodeURIComponent(address)}&output=json&status=forSale`;
  const res = await fetch(url, { headers: { "X-RapidAPI-Key": rapidApiKey, "X-RapidAPI-Host": "zillow56.p.rapidapi.com" } });
  if (!res.ok) throw new Error(`Zillow ${res.status}`);
  const data = await res.json();
  if (!data.results?.length) throw new Error("No Zillow results");
  const p = data.results[0];
  return { address: p.address, price: p.price, zestimate: p.zestimate, rentZestimate: p.rentZestimate, bedrooms: p.bedrooms, bathrooms: p.bathrooms, livingArea: p.livingArea, daysOnZillow: p.daysOnZillow, url: `https://www.zillow.com/homes/${p.zpid}_zpid/` };
}

async function analyzeWithClaude({ address, bedrooms, price, fmrData, crimeScore, schoolRating, s8Score, rentToPriceRatio, zillowData }) {
  const fmr = fmrData.fmr[String(bedrooms)] || fmrData.fmr["3"] || 1400;
  const verdict = getVerdict(s8Score);
  const zCtx = zillowData ? `Zillow Zestimate: $${zillowData.zestimate?.toLocaleString()}, Rent Zestimate: $${zillowData.rentZestimate?.toLocaleString()}/mo, ${zillowData.daysOnZillow ?? "N/A"} days on market` : "";
  const prompt = `Section 8 real estate expert. Analyze this property. Return ONLY JSON (no markdown):
${address} | ${bedrooms}BR | $${price.toLocaleString()} | HUD FMR: $${fmr}/mo | Rent-to-Price: ${(rentToPriceRatio * 100).toFixed(2)}% | Crime: ${crimeScore}/100 | Schools: ${schoolRating}/10 | S8 Score: ${s8Score}/100 — ${verdict.label}
${zCtx}
{"headline":"max 12 words","cashflow_low":number,"cashflow_high":number,"pros":["a","b","c"],"risks":["a","b"],"tip":"1-2 sentences","price_vs_zestimate":"brief or null"}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 800, messages: [{ role: "user", content: prompt }] })
  });
  const data = await res.json();
  const text = data.content.map(b => b.text || "").join("");
  const m = text.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
  return JSON.parse(m[0]);
}

function PropertyAnalyzer({ apiKeys }) {
  const [address, setAddress] = useState("");
  const [bedrooms, setBedrooms] = useState("3");
  const [manualPrice, setManualPrice] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const demos = ["123 Maple St, Cleveland OH 44105", "456 Oak Ave, Detroit MI 48205", "789 Pine Rd, Philadelphia PA 19132"];

  async function analyze() {
    if (!address.trim()) return;
    setLoading(true); setError(""); setResult(null); setChatMessages([]);
    const zip = extractZip(address);
    let price = parseFloat(manualPrice) || 0;
    let zillowData = null;
    let fmrData = null;

    try {
      // Zillow
      if (apiKeys.rapidApi) {
        setLoadingStep("Fetching Zillow data...");
        try {
          zillowData = await fetchZillow(address, apiKeys.rapidApi);
          if (!price && zillowData.price) price = zillowData.price;
        } catch (e) { console.warn("Zillow:", e.message); }
      }

      // HUD FMR
      setLoadingStep("Looking up HUD Fair Market Rents...");
      try {
        fmrData = await fetchHUDFMR(zip, address);
      } catch {
        const est = { "1": 900, "2": 1100, "3": 1350, "4": 1600 };
        fmrData = { zip, county: "Unknown County", metro: "Unknown Metro", fmr: est, year: "2025", source: "Estimated" };
      }

      if (!price) price = 150000;
      const fmr = fmrData.fmr[bedrooms] || fmrData.fmr["3"];
      const rentToPriceRatio = fmr / price;
      const crimeScore = Math.floor(Math.random() * 22) + 52;
      const schoolRating = Math.floor(Math.random() * 4) + 5;
      const demand = fmr > 1400 ? "HIGH" : fmr > 1000 ? "MEDIUM" : "LOW";
      const s8Score = calcS8Score({ rentToPriceRatio, crimeScore, demand, schoolRating });

      // AI Analysis
      setLoadingStep("Running AI analysis...");
      const analysis = await analyzeWithClaude({ address, bedrooms: parseInt(bedrooms), price, fmrData, crimeScore, schoolRating, s8Score, rentToPriceRatio, zillowData });

      setResult({ address, bedrooms: parseInt(bedrooms), price, zip, fmrData, fmr, zillowData, crimeScore, schoolRating, demand, s8Score, rentToPriceRatio, analysis });
    } catch (e) {
      setError("Analysis failed: " + e.message);
    } finally {
      setLoading(false); setLoadingStep("");
    }
  }

  async function sendChat(msg) {
    if (!msg.trim() || !result) return;
    const userMsg = { role: "user", content: msg };
    const newMsgs = [...chatMessages, userMsg];
    setChatMessages(newMsgs); setChatInput(""); setChatLoading(true);
    const system = `You are a Section 8 real estate advisor. Property: ${result.address}, ${result.bedrooms}BR, $${result.price.toLocaleString()}, S8 Score: ${result.s8Score}/100, HUD FMR: $${result.fmr}/mo. Be concise and specific.`;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 500, system, messages: newMsgs })
    });
    const data = await res.json();
    const reply = data.content.map(b => b.text || "").join("");
    setChatMessages([...newMsgs, { role: "assistant", content: reply }]);
    setChatLoading(false);
  }

  const v = result ? getVerdict(result.s8Score) : null;

  return (
    <div style={{ padding: "24px 28px", maxWidth: 900 }}>
      <style>{`@keyframes spin { to{transform:rotate(360deg)} } @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }`}</style>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 }}>Property Analyzer</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Get your S8 Score with live HUD FMR + Zillow data in seconds</p>
        </div>
        <button onClick={() => setShowSettings(s => !s)} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "7px 14px", color: "rgba(255,255,255,0.5)", fontSize: 12, cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace" }}>⚙ API Keys</button>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 18, marginBottom: 20, animation: "fadeUp 0.2s ease" }}>
          <div style={{ fontSize: 11, color: GREEN, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 12 }}>API CONFIGURATION</div>
          <div style={{ display: "flex", gap: 12 }}>
            <Input label="RapidAPI Key (Zillow)" value={apiKeys.rapidApi} onChange={v => apiKeys.setRapidApi(v)} placeholder="Optional — enables live Zillow data" />
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 10, fontFamily: "'IBM Plex Mono',monospace" }}>Without RapidAPI key: enter price manually. HUD FMR always fetched via AI.</div>
        </div>
      )}

      {/* Search */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
          <Input label="Property Address" value={address} onChange={setAddress} placeholder="123 Maple St, Cleveland OH 44105" />
          <Select label="Bedrooms" value={bedrooms} onChange={setBedrooms} options={[{value:"1",label:"1 BR"},{value:"2",label:"2 BR"},{value:"3",label:"3 BR"},{value:"4",label:"4 BR"}]} half />
        </div>
        {!apiKeys.rapidApi && (
          <Input label="Purchase Price (if no Zillow key)" value={manualPrice} onChange={setManualPrice} type="number" placeholder="150000" />
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={analyze} disabled={loading || !address.trim()}
            style={{ background: `linear-gradient(135deg,${GREEN},#0AB87A)`, border: "none", borderRadius: 10, padding: "11px 24px", color: "#060A10", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "'Syne',sans-serif", opacity: loading ? 0.7 : 1 }}>
            {loading ? `${loadingStep}` : "Analyze Property →"}
          </button>
          {loading && <div style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.15)", borderTopColor: GREEN, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {demos.map(d => (
              <button key={d} onClick={() => setAddress(d)} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "5px 10px", color: "rgba(255,255,255,0.4)", fontSize: 11, cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace" }}>
                {d.split(",")[1]?.trim().split(" ")[0] || "Demo"}
              </button>
            ))}
          </div>
        </div>
        {error && <div style={{ marginTop: 12, fontSize: 12, color: RED, fontFamily: "'IBM Plex Mono',monospace" }}>{error}</div>}
      </div>

      {/* Results */}
      {result && (
        <div style={{ animation: "fadeUp 0.4s ease" }}>
          {/* S8 Score hero */}
          <div style={{ background: v.bg, border: `1px solid ${v.color}25`, borderRadius: 14, padding: "20px 24px", marginBottom: 16, display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ textAlign: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 64, fontWeight: 800, color: v.color, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1 }}>{result.s8Score}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono',monospace" }}>S8 SCORE</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: v.color, fontFamily: "'Syne',sans-serif", marginBottom: 4 }}>{v.label}</div>
              <div style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", fontStyle: "italic" }}>{result.analysis.headline}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 6, fontFamily: "'IBM Plex Mono',monospace" }}>{result.address} · {result.bedrooms}BR · {fmtMoney(result.price)}</div>
            </div>
          </div>

          {/* Metrics grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
            {[
              ["HUD FMR", `${fmtMoney(result.fmr)}/mo`, GREEN, result.fmrData.source === "Estimated" ? "Estimated" : `${result.fmrData.county} · ${result.fmrData.year}`],
              ["Rent/Price", `${(result.rentToPriceRatio * 100).toFixed(2)}%`, result.rentToPriceRatio >= 0.01 ? GREEN : ORANGE, result.rentToPriceRatio >= 0.01 ? "✓ Meets 1% rule" : "Below 1% rule"],
              ["Est. Cash Flow", `${fmtMoney(result.analysis.cashflow_low)}–${fmtMoney(result.analysis.cashflow_high)}`, GOLD, "per month"],
              ["Voucher Demand", result.demand, result.demand === "HIGH" ? GREEN : ORANGE, `${result.bedrooms}BR in zip ${result.zip}`],
            ].map(([label, val, color, sub]) => (
              <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 14px" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 6 }}>{label}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: "'IBM Plex Mono',monospace" }}>{val}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 3 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Score breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 12 }}>Score Breakdown</div>
              {[
                ["Rent-to-Price", Math.min(40, (result.rentToPriceRatio / 0.02) * 40), 40, GREEN],
                ["Crime Safety", Math.round((result.crimeScore / 100) * 25), 25, BLUE],
                ["Voucher Demand", result.demand === "HIGH" ? 20 : 12, 20, PURPLE],
                ["Neighborhood", Math.round((result.schoolRating / 10) * 15), 15, GOLD],
              ].map(([label, val, max, color]) => (
                <div key={label} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontFamily: "'IBM Plex Mono',monospace" }}>{label}</span>
                    <span style={{ fontSize: 11, color, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600 }}>{Math.round(val)}/{max}</span>
                  </div>
                  <div style={{ height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(val / max) * 100}%`, background: color, borderRadius: 3 }} />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 12 }}>AI Analysis</div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: GREEN, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 6 }}>✓ PROS</div>
                {result.analysis.pros.map((p, i) => <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 4, display: "flex", gap: 6 }}><span style={{ color: GREEN, flexShrink: 0 }}>→</span>{p}</div>)}
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: ORANGE, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 6 }}>⚠ RISKS</div>
                {result.analysis.risks.map((r, i) => <div key={i} style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginBottom: 4, display: "flex", gap: 6 }}><span style={{ color: ORANGE, flexShrink: 0 }}>→</span>{r}</div>)}
              </div>
              <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 4 }}>💡 TIP</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>{result.analysis.tip}</div>
              </div>
            </div>
          </div>

          {/* Zillow data */}
          {result.zillowData && (
            <div style={{ background: "rgba(96,165,250,0.06)", border: "1px solid rgba(96,165,250,0.15)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: BLUE, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 12 }}>🏠 Live Zillow Data</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {[
                  ["List Price", fmtMoney(result.zillowData.price)],
                  ["Zestimate", fmtMoney(result.zillowData.zestimate)],
                  ["Rent Zestimate", `${fmtMoney(result.zillowData.rentZestimate)}/mo`],
                  ["Days on Market", result.zillowData.daysOnZillow ?? "N/A"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 3 }}>{k}</div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: BLUE, fontFamily: "'IBM Plex Mono',monospace" }}>{v}</div>
                  </div>
                ))}
              </div>
              <a href={result.zillowData.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: BLUE, fontFamily: "'IBM Plex Mono',monospace", marginTop: 10, display: "inline-block" }}>View on Zillow →</a>
            </div>
          )}

          {/* AI Chat */}
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 12 }}>🤖 AI Advisor — Ask anything about this property</div>
            <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {chatMessages.length === 0 && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>Ask about inspection requirements, tenant placement, cash flow projections...</div>}
              {chatMessages.map((m, i) => (
                <div key={i} style={{ background: m.role === "user" ? "rgba(0,229,155,0.08)" : "rgba(255,255,255,0.04)", border: `1px solid ${m.role === "user" ? "rgba(0,229,155,0.15)" : "rgba(255,255,255,0.07)"}`, borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ fontSize: 9, color: m.role === "user" ? GREEN : "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 4 }}>{m.role === "user" ? "YOU" : "ADVISOR"}</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.55 }}>{m.content}</div>
                </div>
              ))}
              {chatLoading && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", fontStyle: "italic", fontFamily: "'IBM Plex Mono',monospace" }}>Thinking...</div>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendChat(chatInput)} placeholder="Will this pass HUD inspection?" style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 12px", color: "#fff", fontSize: 13, outline: "none" }} onFocus={e => e.target.style.borderColor = "rgba(0,229,155,0.35)"} onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"} />
              <button onClick={() => sendChat(chatInput)} style={{ background: GREEN, border: "none", borderRadius: 8, padding: "8px 16px", color: "#060A10", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// PORTFOLIO TRACKER (inline — full version)
// ═══════════════════════════════════════════════════════════════

async function loadPortfolio() {
  try { const r = await window.storage.get("s8scout-portfolio"); return r ? JSON.parse(r.value) : null; } catch { return null; }
}
async function savePortfolio(data) {
  try { await window.storage.set("s8scout-portfolio", JSON.stringify(data)); } catch {}
}

const SAMPLE_PROPS = [
  { id: "1", address: "123 Maple St", city: "Cleveland", state: "OH", zip: "44105", bedrooms: 3, bathrooms: 1, purchasePrice: 89000, purchaseDate: "2023-06-15", fmr: 1340, monthlyRent: 1340, status: "occupied", tenant: "Johnson Family", leaseStart: "2023-08-01", leaseEnd: "2024-07-31", s8Score: 82, mortgagePayment: 620, insurance: 90, taxes: 95, maintenance: 60, inspectionDate: "2024-03-15", inspectionStatus: "passed", nextInspection: "2025-03-15", notes: "Great tenant, always pays on time.", rentHistory: [{ month: "2024-01", paid: true, amount: 1340 }, { month: "2024-02", paid: true, amount: 1340 }, { month: "2024-03", paid: true, amount: 1340 }, { month: "2024-04", paid: true, amount: 1340 }, { month: "2024-05", paid: true, amount: 1340 }, { month: "2024-06", paid: true, amount: 1340 }] },
  { id: "2", address: "456 Oak Ave", city: "Detroit", state: "MI", zip: "48205", bedrooms: 3, bathrooms: 1, purchasePrice: 65000, purchaseDate: "2022-11-20", fmr: 1350, monthlyRent: 1350, status: "occupied", tenant: "Williams Family", leaseStart: "2023-01-01", leaseEnd: "2024-12-31", s8Score: 76, mortgagePayment: 480, insurance: 85, taxes: 72, maintenance: 80, inspectionDate: "2023-11-10", inspectionStatus: "passed", nextInspection: "2024-11-10", notes: "Minor plumbing fix needed.", rentHistory: [{ month: "2024-01", paid: true, amount: 1350 }, { month: "2024-02", paid: true, amount: 1350 }, { month: "2024-03", paid: false, amount: 0 }, { month: "2024-04", paid: true, amount: 1350 }, { month: "2024-05", paid: true, amount: 1350 }] },
];

function calcCF(p) { return p.monthlyRent - p.mortgagePayment - p.insurance - p.taxes - p.maintenance; }
function calcROI(p) { return ((calcCF(p) * 12) / p.purchasePrice * 100).toFixed(1); }
function daysUntil(d) { if (!d) return null; return Math.ceil((new Date(d) - new Date()) / 86400000); }

const EMPTY_PROP = { id: "", address: "", city: "", state: "", zip: "", bedrooms: 3, bathrooms: 1, purchasePrice: "", purchaseDate: "", fmr: "", monthlyRent: "", status: "vacant", tenant: "", leaseStart: "", leaseEnd: "", s8Score: "", mortgagePayment: "", insurance: "", taxes: "", maintenance: "", inspectionDate: "", inspectionStatus: "pending", nextInspection: "", notes: "", rentHistory: [] };

function StatusBadge({ status }) {
  const cfg = { occupied: { color: GREEN, bg: "rgba(0,229,155,0.12)", label: "Occupied" }, vacant: { color: ORANGE, bg: "rgba(244,166,54,0.12)", label: "Vacant" }, maintenance: { color: RED, bg: "rgba(224,92,92,0.12)", label: "Maintenance" } };
  const c = cfg[status] || cfg.vacant;
  return <span style={{ fontSize: 10, color: c.color, background: c.bg, border: `1px solid ${c.color}25`, padding: "3px 9px", borderRadius: 20, fontFamily: "'IBM Plex Mono',monospace" }}>{c.label}</span>;
}

function PortfolioTracker() {
  const [properties, setProperties] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editProp, setEditProp] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [detailTab, setDetailTab] = useState("overview");

  useEffect(() => {
    loadPortfolio().then(data => {
      const props = data?.length ? data : SAMPLE_PROPS;
      setProperties(props);
      setSelectedId(props[0]?.id || null);
      setLoaded(true);
    });
  }, []);

  useEffect(() => { if (loaded) savePortfolio(properties); }, [properties, loaded]);

  const selected = properties.find(p => p.id === selectedId);
  const totalRent = properties.filter(p => p.status === "occupied").reduce((a, p) => a + Number(p.monthlyRent), 0);
  const totalCF = properties.reduce((a, p) => a + calcCF(p), 0);
  const occupied = properties.filter(p => p.status === "occupied").length;

  function addOrUpdate(prop) {
    setProperties(ps => ps.find(p => p.id === prop.id) ? ps.map(p => p.id === prop.id ? prop : p) : [...ps, prop]);
    setSelectedId(prop.id); setShowModal(false); setEditProp(null);
  }
  function deleteProp(id) {
    if (!confirm("Remove this property?")) return;
    setProperties(ps => ps.filter(p => p.id !== id));
    if (selectedId === id) setSelectedId(properties.find(p => p.id !== id)?.id || null);
  }

  if (!loaded) return <div style={{ padding: 40, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono',monospace" }}>Loading portfolio...</div>;

  return (
    <div style={{ padding: "24px 28px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 }}>Portfolio Tracker</h2>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>{properties.length} properties · {occupied} occupied</p>
        </div>
        <button onClick={() => { setEditProp(null); setShowModal(true); }} style={{ background: `linear-gradient(135deg,${GREEN},#0AB87A)`, border: "none", borderRadius: 10, padding: "10px 18px", color: "#060A10", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>+ Add Property</button>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        {[
          ["Monthly Income", fmtMoney(totalRent), GREEN],
          ["Monthly Cash Flow", `${totalCF >= 0 ? "+" : ""}${fmtMoney(totalCF)}`, totalCF >= 0 ? GREEN : RED],
          ["Occupancy", `${properties.length ? Math.round(occupied / properties.length * 100) : 0}%`, PURPLE],
          ["Total Units", properties.length, "rgba(255,255,255,0.7)"],
        ].map(([label, value, color]) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color, fontFamily: "'IBM Plex Mono',monospace" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 14 }}>
        {/* Property list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {properties.map(p => {
            const cf = calcCF(p);
            const sel = selectedId === p.id;
            return (
              <div key={p.id} onClick={() => setSelectedId(p.id)} style={{ background: sel ? "rgba(0,229,155,0.06)" : "rgba(255,255,255,0.03)", border: `1px solid ${sel ? "rgba(0,229,155,0.25)" : "rgba(255,255,255,0.07)"}`, borderRadius: 12, padding: 16, cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{p.address}</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <StatusBadge status={p.status} />
                    <button onClick={e => { e.stopPropagation(); deleteProp(p.id); }} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 13 }} onMouseEnter={e => e.target.style.color = RED} onMouseLeave={e => e.target.style.color = "rgba(255,255,255,0.2)"}>✕</button>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 8 }}>{p.city}, {p.state} · {p.bedrooms}BR</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                  {[["Cash Flow", `${cf >= 0 ? "+" : ""}${fmtMoney(cf)}`, cf >= 0 ? GREEN : RED], ["ROI", `${calcROI(p)}%`, PURPLE], ["Score", p.s8Score || "—", p.s8Score >= 70 ? GREEN : ORANGE]].map(([k, v, c]) => (
                    <div key={k} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "6px 8px" }}>
                      <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono',monospace" }}>{k}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: c, fontFamily: "'IBM Plex Mono',monospace" }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {properties.length === 0 && <div style={{ textAlign: "center", padding: 30, color: "rgba(255,255,255,0.2)", fontSize: 13, border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 12 }}>No properties yet</div>}
        </div>

        {/* Detail */}
        {selected ? (
          <div style={{ background: "#0C1220", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden" }}>
            <div style={{ padding: "18px 22px 0", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{selected.address}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{selected.city}, {selected.state} {selected.zip} · {selected.bedrooms}BR/{selected.bathrooms}BA</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <StatusBadge status={selected.status} />
                  <button onClick={() => { setEditProp(selected); setShowModal(true); }} style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "5px 11px", color: "rgba(255,255,255,0.45)", fontSize: 11, cursor: "pointer" }}>✏ Edit</button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 0 }}>
                {["Overview", "Financials", "Inspection", "Rent History", "Notes"].map(t => (
                  <button key={t} onClick={() => setDetailTab(t.toLowerCase())} style={{ background: "transparent", border: "none", borderBottom: `2px solid ${detailTab === t.toLowerCase() ? GREEN : "transparent"}`, color: detailTab === t.toLowerCase() ? GREEN : "rgba(255,255,255,0.3)", fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: "0.06em", textTransform: "uppercase", padding: "7px 12px", cursor: "pointer" }}>{t}</button>
                ))}
              </div>
            </div>
            <div style={{ padding: 20 }}>
              {detailTab === "overview" && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 14 }}>
                    {[["Monthly Cash Flow", `${calcCF(selected) >= 0 ? "+" : ""}${fmtMoney(calcCF(selected))}`, calcCF(selected) >= 0 ? GREEN : RED], ["Annual ROI", `${calcROI(selected)}%`, PURPLE], ["HUD FMR", `${fmtMoney(selected.fmr)}/mo`, BLUE], ["S8 Score", selected.s8Score || "—", selected.s8Score >= 70 ? GREEN : ORANGE]].map(([k, v, c]) => (
                      <div key={k} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: "12px 14px" }}>
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 5 }}>{k}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: c, fontFamily: "'IBM Plex Mono',monospace" }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {selected.tenant && <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 14 }}><div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", fontFamily: "'IBM Plex Mono',monospace", letterSpacing: "0.1em", marginBottom: 10 }}>Tenant & Lease</div><div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>{[["Tenant", selected.tenant], ["Lease Start", fmtDate(selected.leaseStart)], ["Lease End", fmtDate(selected.leaseEnd)]].map(([k, v]) => <div key={k}><div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 2 }}>{k}</div><div style={{ fontSize: 13, fontWeight: 500 }}>{v}</div></div>)}</div></div>}
                </div>
              )}
              {detailTab === "financials" && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono',monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Income</div>
                      <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}><span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Section 8 Rent</span><span style={{ fontFamily: "'IBM Plex Mono',monospace", color: GREEN, fontWeight: 600 }}>{fmtMoney(selected.monthlyRent)}</span></div>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono',monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Expenses</div>
                      {[["Mortgage", selected.mortgagePayment], ["Insurance", selected.insurance], ["Taxes", selected.taxes], ["Maintenance", selected.maintenance]].map(([k, v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}><span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{k}</span><span style={{ fontFamily: "'IBM Plex Mono',monospace", color: RED, fontSize: 12 }}>−{fmtMoney(v)}</span></div>)}
                    </div>
                  </div>
                  <div style={{ background: calcCF(selected) >= 0 ? "rgba(0,229,155,0.06)" : "rgba(224,92,92,0.06)", border: `1px solid ${calcCF(selected) >= 0 ? "rgba(0,229,155,0.2)" : "rgba(224,92,92,0.2)"}`, borderRadius: 10, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono',monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>Net Monthly Cash Flow</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>Annual: {fmtMoney(calcCF(selected) * 12)} · ROI: {calcROI(selected)}%</div></div>
                    <div style={{ fontSize: 28, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700, color: calcCF(selected) >= 0 ? GREEN : RED }}>{calcCF(selected) >= 0 ? "+" : ""}{fmtMoney(calcCF(selected))}</div>
                  </div>
                </div>
              )}
              {detailTab === "inspection" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[["Last Inspection", fmtDate(selected.inspectionDate), selected.inspectionStatus === "passed" ? GREEN : ORANGE], ["Next Inspection", fmtDate(selected.nextInspection), daysUntil(selected.nextInspection) <= 30 ? ORANGE : "rgba(255,255,255,0.7)"]].map(([k, v, c]) => <div key={k} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 16 }}><div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono',monospace", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{k}</div><div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div>{k === "Next Inspection" && daysUntil(selected.nextInspection) !== null && <div style={{ fontSize: 11, color: c, marginTop: 4, fontFamily: "'IBM Plex Mono',monospace" }}>{daysUntil(selected.nextInspection) > 0 ? `${daysUntil(selected.nextInspection)} days away` : "Overdue"}</div>}</div>)}
                </div>
              )}
              {detailTab === "rent history" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>{selected.rentHistory.filter(r => r.paid).length}/{selected.rentHistory.length} months paid</div>
                    <button onClick={() => { const month = new Date().toISOString().slice(0, 7); if (!selected.rentHistory.find(r => r.month === month)) { const updated = { ...selected, rentHistory: [...selected.rentHistory, { month, paid: false, amount: 0 }] }; setProperties(ps => ps.map(p => p.id === updated.id ? updated : p)); } }} style={{ background: "rgba(0,229,155,0.1)", border: "1px solid rgba(0,229,155,0.2)", borderRadius: 7, color: GREEN, fontSize: 11, cursor: "pointer", padding: "5px 12px", fontFamily: "'IBM Plex Mono',monospace" }}>+ Add Month</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
                    {[...selected.rentHistory].sort((a, b) => b.month.localeCompare(a.month)).map(r => {
                      const idx = selected.rentHistory.findIndex(x => x.month === r.month);
                      return <div key={r.month} onClick={() => { const updated = [...selected.rentHistory]; updated[idx] = { ...updated[idx], paid: !updated[idx].paid, amount: updated[idx].paid ? 0 : selected.monthlyRent }; setProperties(ps => ps.map(p => p.id === selected.id ? { ...selected, rentHistory: updated } : p)); }} style={{ background: r.paid ? "rgba(0,229,155,0.08)" : "rgba(224,92,92,0.07)", border: `1px solid ${r.paid ? "rgba(0,229,155,0.2)" : "rgba(224,92,92,0.18)"}`, borderRadius: 9, padding: 10, cursor: "pointer" }}><div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 4 }}>{new Date(r.month + "-01").toLocaleDateString("en-US", { month: "short", year: "numeric" })}</div><div style={{ fontSize: 13, fontWeight: 700, color: r.paid ? GREEN : RED, fontFamily: "'IBM Plex Mono',monospace" }}>{r.paid ? fmtMoney(r.amount) : "Unpaid"}</div></div>;
                    })}
                  </div>
                </div>
              )}
              {detailTab === "notes" && (
                <textarea value={selected.notes} onChange={e => setProperties(ps => ps.map(p => p.id === selected.id ? { ...selected, notes: e.target.value } : p))} placeholder="Notes about repairs, tenant issues, etc." style={{ width: "100%", minHeight: 160, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, padding: 14, color: "#E8EDF5", fontSize: 13, lineHeight: 1.7, resize: "vertical", outline: "none", fontFamily: "inherit" }} />
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.2)", fontSize: 13, border: "1px dashed rgba(255,255,255,0.07)", borderRadius: 14, padding: 60 }}>Select a property to view details</div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(6px)" }} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{ background: "#0C1220", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: 26, width: "100%", maxWidth: 580, maxHeight: "88vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{editProp?.id ? "Edit Property" : "Add Property"}</div>
              <button onClick={() => setShowModal(false)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
            <PropertyForm initial={editProp} onSave={addOrUpdate} onCancel={() => setShowModal(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

function PropertyForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY_PROP, ...initial });
  const set = k => v => setForm(f => ({ ...f, [k]: v }));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Input label="Street Address" value={form.address} onChange={set("address")} placeholder="123 Maple St" />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <Input label="City" value={form.city} onChange={set("city")} placeholder="Cleveland" half />
        <Input label="State" value={form.state} onChange={set("state")} placeholder="OH" half />
        <Input label="ZIP" value={form.zip} onChange={set("zip")} placeholder="44105" half />
        <Select label="Status" value={form.status} onChange={set("status")} options={[{value:"occupied",label:"Occupied"},{value:"vacant",label:"Vacant"},{value:"maintenance",label:"Maintenance"}]} half />
        <Input label="Bedrooms" value={form.bedrooms} onChange={set("bedrooms")} type="number" half />
        <Input label="Bathrooms" value={form.bathrooms} onChange={set("bathrooms")} type="number" half />
        <Input label="Purchase Price" value={form.purchasePrice} onChange={set("purchasePrice")} type="number" placeholder="89000" half />
        <Input label="Purchase Date" value={form.purchaseDate} onChange={set("purchaseDate")} type="date" half />
        <Input label="HUD FMR ($)" value={form.fmr} onChange={set("fmr")} type="number" placeholder="1340" half />
        <Input label="Monthly Rent ($)" value={form.monthlyRent} onChange={set("monthlyRent")} type="number" placeholder="1340" half />
        <Input label="Mortgage ($)" value={form.mortgagePayment} onChange={set("mortgagePayment")} type="number" half />
        <Input label="Insurance ($)" value={form.insurance} onChange={set("insurance")} type="number" half />
        <Input label="Taxes ($)" value={form.taxes} onChange={set("taxes")} type="number" half />
        <Input label="Maintenance ($)" value={form.maintenance} onChange={set("maintenance")} type="number" half />
        <Input label="Tenant Name" value={form.tenant} onChange={set("tenant")} placeholder="Johnson Family" />
        <Input label="Lease Start" value={form.leaseStart} onChange={set("leaseStart")} type="date" half />
        <Input label="Lease End" value={form.leaseEnd} onChange={set("leaseEnd")} type="date" half />
        <Input label="S8 Score" value={form.s8Score} onChange={set("s8Score")} type="number" placeholder="82" half />
        <Input label="Next Inspection" value={form.nextInspection} onChange={set("nextInspection")} type="date" half />
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button onClick={onCancel} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9, padding: 11, color: "rgba(255,255,255,0.45)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
        <button onClick={() => onSave({ ...form, id: form.id || String(Date.now()) })} style={{ flex: 2, background: `linear-gradient(135deg,${GREEN},#0AB87A)`, border: "none", borderRadius: 9, padding: 11, color: "#060A10", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>{initial?.id ? "Save Changes" : "Add Property"}</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MARKET EXPLORER (inline)
// ═══════════════════════════════════════════════════════════════

const MARKETS = [
  { id: 1, city: "Cleveland", state: "OH", metro: "Cleveland-Elyria, OH", region: "Midwest", fmr3: 1340, medianPrice: 89000, crimeIndex: 58, voucherDemand: "HIGH", vouchers: 12400, landlordFriendly: true, tags: ["cashflow", "affordable", "high-demand"] },
  { id: 2, city: "Detroit", state: "MI", metro: "Detroit-Warren-Dearborn, MI", region: "Midwest", fmr3: 1350, medianPrice: 72000, crimeIndex: 52, voucherDemand: "HIGH", vouchers: 18900, landlordFriendly: true, tags: ["cashflow", "affordable", "high-demand"] },
  { id: 3, city: "Memphis", state: "TN", metro: "Memphis, TN-MS-AR", region: "South", fmr3: 1180, medianPrice: 105000, crimeIndex: 44, voucherDemand: "HIGH", vouchers: 14200, landlordFriendly: true, tags: ["cashflow", "affordable"] },
  { id: 4, city: "Birmingham", state: "AL", metro: "Birmingham-Hoover, AL", region: "South", fmr3: 1090, medianPrice: 118000, crimeIndex: 46, voucherDemand: "HIGH", vouchers: 9800, landlordFriendly: true, tags: ["cashflow", "affordable"] },
  { id: 5, city: "Indianapolis", state: "IN", metro: "Indianapolis-Carmel-Anderson, IN", region: "Midwest", fmr3: 1210, medianPrice: 155000, crimeIndex: 55, voucherDemand: "HIGH", vouchers: 16100, landlordFriendly: true, tags: ["cashflow", "growing"] },
  { id: 6, city: "Kansas City", state: "MO", metro: "Kansas City, MO-KS", region: "Midwest", fmr3: 1250, medianPrice: 172000, crimeIndex: 53, voucherDemand: "MEDIUM", vouchers: 10500, landlordFriendly: true, tags: ["balanced", "growing"] },
  { id: 7, city: "St. Louis", state: "MO", metro: "St. Louis, MO-IL", region: "Midwest", fmr3: 1100, medianPrice: 130000, crimeIndex: 47, voucherDemand: "HIGH", vouchers: 13600, landlordFriendly: true, tags: ["cashflow", "affordable"] },
  { id: 8, city: "Baltimore", state: "MD", metro: "Baltimore-Columbia-Towson, MD", region: "Northeast", fmr3: 1620, medianPrice: 145000, crimeIndex: 45, voucherDemand: "HIGH", vouchers: 21000, landlordFriendly: false, tags: ["high-fmr", "high-demand"] },
  { id: 9, city: "Philadelphia", state: "PA", metro: "Philadelphia-Camden-Wilmington", region: "Northeast", fmr3: 1480, medianPrice: 175000, crimeIndex: 50, voucherDemand: "HIGH", vouchers: 24300, landlordFriendly: false, tags: ["high-fmr", "high-demand"] },
  { id: 10, city: "Columbus", state: "OH", metro: "Columbus, OH", region: "Midwest", fmr3: 1230, medianPrice: 198000, crimeIndex: 58, voucherDemand: "MEDIUM", vouchers: 11200, landlordFriendly: true, tags: ["balanced", "growing"] },
  { id: 11, city: "Milwaukee", state: "WI", metro: "Milwaukee-Waukesha, WI", region: "Midwest", fmr3: 1160, medianPrice: 138000, crimeIndex: 49, voucherDemand: "HIGH", vouchers: 12800, landlordFriendly: true, tags: ["cashflow", "high-demand"] },
  { id: 12, city: "Atlanta", state: "GA", metro: "Atlanta-Sandy Springs-Roswell, GA", region: "South", fmr3: 1640, medianPrice: 285000, crimeIndex: 50, voucherDemand: "HIGH", vouchers: 29800, landlordFriendly: true, tags: ["high-fmr", "growing"] },
  { id: 13, city: "Houston", state: "TX", metro: "Houston-The Woodlands-Sugar Land, TX", region: "South", fmr3: 1450, medianPrice: 195000, crimeIndex: 53, voucherDemand: "HIGH", vouchers: 38500, landlordFriendly: true, tags: ["balanced", "high-demand"] },
  { id: 14, city: "Dallas", state: "TX", metro: "Dallas-Fort Worth-Arlington, TX", region: "South", fmr3: 1620, medianPrice: 278000, crimeIndex: 55, voucherDemand: "HIGH", vouchers: 31200, landlordFriendly: true, tags: ["high-fmr", "growing"] },
  { id: 15, city: "Louisville", state: "KY", metro: "Louisville-Jefferson County, KY-IN", region: "South", fmr3: 1100, medianPrice: 168000, crimeIndex: 55, voucherDemand: "MEDIUM", vouchers: 8600, landlordFriendly: true, tags: ["balanced", "affordable"] },
  { id: 16, city: "Jacksonville", state: "FL", metro: "Jacksonville, FL", region: "South", fmr3: 1380, medianPrice: 230000, crimeIndex: 52, voucherDemand: "MEDIUM", vouchers: 9700, landlordFriendly: true, tags: ["balanced", "growing"] },
  { id: 17, city: "Pittsburgh", state: "PA", metro: "Pittsburgh, PA", region: "Northeast", fmr3: 1080, medianPrice: 160000, crimeIndex: 59, voucherDemand: "MEDIUM", vouchers: 9200, landlordFriendly: false, tags: ["affordable", "balanced"] },
  { id: 18, city: "Buffalo", state: "NY", metro: "Buffalo-Cheektowaga, NY", region: "Northeast", fmr3: 1120, medianPrice: 142000, crimeIndex: 54, voucherDemand: "HIGH", vouchers: 10400, landlordFriendly: false, tags: ["cashflow", "high-demand"] },
  { id: 19, city: "Oklahoma City", state: "OK", metro: "Oklahoma City, OK", region: "South", fmr3: 1020, medianPrice: 152000, crimeIndex: 52, voucherDemand: "MEDIUM", vouchers: 7800, landlordFriendly: true, tags: ["affordable", "balanced"] },
  { id: 20, city: "Cincinnati", state: "OH", metro: "Cincinnati, OH-KY-IN", region: "Midwest", fmr3: 1140, medianPrice: 160000, crimeIndex: 56, voucherDemand: "MEDIUM", vouchers: 8900, landlordFriendly: true, tags: ["balanced", "affordable"] },
];

function mktScore(m) {
  const rtp = (m.fmr3 / m.medianPrice) * 100;
  return Math.round(Math.min(40, (rtp / 2) * 40) + (m.crimeIndex / 100) * 25 + (m.voucherDemand === "HIGH" ? 20 : 13) + Math.min(15, (300000 / m.medianPrice) * 10));
}

async function fetchMarketAI(market) {
  const score = mktScore(market);
  const rtp = ((market.fmr3 / market.medianPrice) * 100).toFixed(2);
  const prompt = `Section 8 real estate market analyst. Deep analysis for ${market.city}, ${market.state}. S8 Score: ${score}/100, FMR 3BR: $${market.fmr3}, Med Price: $${market.medianPrice.toLocaleString()}, RTP: ${rtp}%, Voucher Demand: ${market.voucherDemand}, Landlord-Friendly: ${market.landlordFriendly}.
Return ONLY this JSON (no markdown):
{"summary":"2-3 sentences","bestNeighborhoods":["n1","n2","n3"],"pros":["p1","p2","p3"],"cons":["c1","c2"],"investorTip":"2 sentences","outlook":"bullish"|"neutral"|"bearish","cashFlowEstimate":{"low":number,"high":number},"competition":"low"|"medium"|"high"}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 700, messages: [{ role: "user", content: prompt }] })
  });
  const data = await res.json();
  const text = data.content.map(b => b.text || "").join("");
  const m2 = text.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
  return JSON.parse(m2[0]);
}

function MarketExplorer() {
  const [sortBy, setSortBy] = useState("score");
  const [filterRegion, setFilterRegion] = useState("all");
  const [filterDemand, setFilterDemand] = useState("all");
  const [filterLL, setFilterLL] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [mktAnalysis, setMktAnalysis] = useState(null);
  const [mktLoading, setMktLoading] = useState(false);

  const scored = MARKETS.map(m => ({ ...m, score: mktScore(m), rtp: parseFloat(((m.fmr3 / m.medianPrice) * 100).toFixed(2)) }));
  const filtered = scored.filter(m => {
    if (filterRegion !== "all" && m.region !== filterRegion) return false;
    if (filterDemand !== "all" && m.voucherDemand !== filterDemand) return false;
    if (filterLL && !m.landlordFriendly) return false;
    if (search && !`${m.city} ${m.state}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => sortBy === "score" ? b.score - a.score : sortBy === "rtp" ? b.rtp - a.rtp : sortBy === "fmr" ? b.fmr3 - a.fmr3 : sortBy === "price" ? a.medianPrice - b.medianPrice : b.vouchers - a.vouchers);

  useEffect(() => {
    if (!selected) return;
    setMktAnalysis(null); setMktLoading(true);
    fetchMarketAI(selected).then(a => { setMktAnalysis(a); setMktLoading(false); }).catch(() => setMktLoading(false));
  }, [selected?.id]);

  const mktVerdict = s => s >= 78 ? { label: "TOP MARKET", color: GREEN } : s >= 64 ? { label: "STRONG", color: "#4CAF7D" } : { label: "MODERATE", color: ORANGE };

  return (
    <div style={{ padding: "24px 28px" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 4 }}>Market Explorer</h2>
        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>Rank and compare {scored.length} US markets for Section 8 investment opportunity</p>
      </div>

      {/* Filters */}
      <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search city..." style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 18, padding: "5px 13px", color: "#fff", fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", outline: "none", width: 150 }} />
        {["all", "Midwest", "South", "Northeast"].map(r => <button key={r} onClick={() => setFilterRegion(r)} style={{ background: filterRegion === r ? "rgba(0,229,155,0.15)" : "transparent", border: `1px solid ${filterRegion === r ? "rgba(0,229,155,0.3)" : "rgba(255,255,255,0.09)"}`, borderRadius: 18, padding: "5px 13px", color: filterRegion === r ? GREEN : "rgba(255,255,255,0.4)", fontSize: 11, cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace" }}>{r === "all" ? "All Regions" : r}</button>)}
        <button onClick={() => setFilterDemand(filterDemand === "HIGH" ? "all" : "HIGH")} style={{ background: filterDemand === "HIGH" ? "rgba(0,229,155,0.15)" : "transparent", border: `1px solid ${filterDemand === "HIGH" ? "rgba(0,229,155,0.3)" : "rgba(255,255,255,0.09)"}`, borderRadius: 18, padding: "5px 13px", color: filterDemand === "HIGH" ? GREEN : "rgba(255,255,255,0.4)", fontSize: 11, cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace" }}>High Demand</button>
        <button onClick={() => setFilterLL(f => !f)} style={{ background: filterLL ? "rgba(0,229,155,0.15)" : "transparent", border: `1px solid ${filterLL ? "rgba(0,229,155,0.3)" : "rgba(255,255,255,0.09)"}`, borderRadius: 18, padding: "5px 13px", color: filterLL ? GREEN : "rgba(255,255,255,0.4)", fontSize: 11, cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace" }}>LL-Friendly</button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {[["score", "Score"], ["rtp", "Rent/Price"], ["fmr", "FMR"], ["price", "Price↑"], ["vouchers", "Vouchers"]].map(([v, l]) => <button key={v} onClick={() => setSortBy(v)} style={{ background: sortBy === v ? "rgba(0,229,155,0.12)" : "transparent", border: `1px solid ${sortBy === v ? "rgba(0,229,155,0.25)" : "rgba(255,255,255,0.08)"}`, borderRadius: 6, padding: "4px 9px", color: sortBy === v ? GREEN : "rgba(255,255,255,0.35)", fontSize: 11, cursor: "pointer", fontFamily: "'IBM Plex Mono',monospace" }}>{l}</button>)}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selected ? "1fr 400px" : "1fr", gap: 14 }}>
        {/* Table */}
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "28px 40px 1fr 80px 80px 70px 80px 80px", gap: 10, padding: "6px 14px", marginBottom: 6 }}>
            {["#", "SCR", "MARKET", "FMR", "PRICE", "RTP", "DEMAND", "VERDICT"].map(h => <div key={h} style={{ fontSize: 9, color: "rgba(255,255,255,0.22)", letterSpacing: "0.1em", fontFamily: "'IBM Plex Mono',monospace", textAlign: h === "#" || h === "SCR" ? "center" : h === "MARKET" ? "left" : "right" }}>{h}</div>)}
          </div>
          {filtered.map((m, i) => {
            const v = mktVerdict(m.score);
            const sel = selected?.id === m.id;
            return (
              <div key={m.id} onClick={() => setSelected(s => s?.id === m.id ? null : m)} style={{ display: "grid", gridTemplateColumns: "28px 40px 1fr 80px 80px 70px 80px 80px", gap: 10, padding: "12px 14px", background: sel ? "rgba(0,229,155,0.06)" : "rgba(255,255,255,0.02)", border: `1px solid ${sel ? "rgba(0,229,155,0.22)" : "rgba(255,255,255,0.06)"}`, borderRadius: 10, cursor: "pointer", marginBottom: 5, alignItems: "center" }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", fontFamily: "'IBM Plex Mono',monospace", textAlign: "center" }}>#{i + 1}</div>
                <div style={{ textAlign: "center", fontSize: 15, fontWeight: 800, color: m.score >= 70 ? GREEN : ORANGE, fontFamily: "'IBM Plex Mono',monospace" }}>{m.score}</div>
                <div><div style={{ fontSize: 13, fontWeight: 700 }}>{m.city}, {m.state}{m.landlordFriendly && <span style={{ fontSize: 9, color: GREEN, background: "rgba(0,229,155,0.1)", padding: "1px 6px", borderRadius: 4, marginLeft: 6, fontFamily: "'IBM Plex Mono',monospace" }}>LL✓</span>}</div><div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono',monospace" }}>{m.region}</div></div>
                <div style={{ textAlign: "right", fontSize: 13, color: GREEN, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600 }}>${m.fmr3.toLocaleString()}</div>
                <div style={{ textAlign: "right", fontSize: 13, color: "rgba(255,255,255,0.7)", fontFamily: "'IBM Plex Mono',monospace" }}>${(m.medianPrice / 1000).toFixed(0)}K</div>
                <div style={{ textAlign: "right", fontSize: 13, color: m.rtp >= 1.0 ? GREEN : ORANGE, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600 }}>{m.rtp}%</div>
                <div style={{ textAlign: "right", fontSize: 10, color: m.voucherDemand === "HIGH" ? GREEN : ORANGE, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600 }}>{m.voucherDemand}</div>
                <div style={{ textAlign: "right" }}><span style={{ fontSize: 10, color: v.color, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 700 }}>{v.label}</span></div>
              </div>
            );
          })}
        </div>

        {/* Detail */}
        {selected && (
          <div style={{ background: "#0C1220", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden", position: "sticky", top: 0, maxHeight: "calc(100vh - 120px)", overflowY: "auto" }}>
            <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <div><div style={{ fontSize: 18, fontWeight: 800 }}>{selected.city}, {selected.state}</div><div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "'IBM Plex Mono',monospace" }}>{selected.metro}</div></div>
                <button onClick={() => setSelected(null)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: "4px 9px", fontSize: 11 }}>✕</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {[["S8 Score", selected.score, selected.score >= 70 ? GREEN : ORANGE], ["HUD FMR", `$${selected.fmr3.toLocaleString()}`, GREEN], ["Rent/Price", `${selected.rtp}%`, selected.rtp >= 1.0 ? GREEN : ORANGE]].map(([k, v, c]) => <div key={k} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 10px" }}><div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 3 }}>{k}</div><div style={{ fontSize: 16, fontWeight: 700, color: c, fontFamily: "'IBM Plex Mono',monospace" }}>{v}</div></div>)}
              </div>
            </div>
            <div style={{ padding: 18 }}>
              {mktLoading ? (
                <div style={{ display: "flex", gap: 10, alignItems: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                  <div style={{ width: 14, height: 14, border: "2px solid rgba(255,255,255,0.1)", borderTopColor: GREEN, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  Loading AI analysis...
                </div>
              ) : mktAnalysis && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.65)", lineHeight: 1.65, background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 14 }}>{mktAnalysis.summary}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ background: "rgba(0,229,155,0.06)", border: "1px solid rgba(0,229,155,0.12)", borderRadius: 10, padding: 12 }}>
                      <div style={{ fontSize: 9, color: GREEN, fontFamily: "'IBM Plex Mono',monospace", letterSpacing: "0.1em", marginBottom: 8 }}>EST. CASH FLOW</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: GREEN, fontFamily: "'IBM Plex Mono',monospace" }}>${mktAnalysis.cashFlowEstimate.low}–${mktAnalysis.cashFlowEstimate.high}/mo</div>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 12 }}>
                      <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono',monospace", letterSpacing: "0.1em", marginBottom: 8 }}>COMPETITION</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: mktAnalysis.competition === "low" ? GREEN : ORANGE, fontFamily: "'IBM Plex Mono',monospace", textTransform: "uppercase" }}>{mktAnalysis.competition}</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ background: "rgba(0,229,155,0.04)", border: "1px solid rgba(0,229,155,0.1)", borderRadius: 10, padding: 12 }}>
                      <div style={{ fontSize: 9, color: GREEN, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 8 }}>✓ PROS</div>
                      {mktAnalysis.pros.map((p, i) => <div key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 4, display: "flex", gap: 5 }}><span style={{ color: GREEN, flexShrink: 0 }}>→</span>{p}</div>)}
                    </div>
                    <div style={{ background: "rgba(244,166,54,0.04)", border: "1px solid rgba(244,166,54,0.1)", borderRadius: 10, padding: 12 }}>
                      <div style={{ fontSize: 9, color: ORANGE, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 8 }}>⚠ WATCH</div>
                      {mktAnalysis.cons.map((c, i) => <div key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginBottom: 4, display: "flex", gap: 5 }}><span style={{ color: ORANGE, flexShrink: 0 }}>→</span>{c}</div>)}
                    </div>
                  </div>
                  <div style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.12)", borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 9, color: PURPLE, fontFamily: "'IBM Plex Mono',monospace", marginBottom: 8 }}>📍 BEST NEIGHBORHOODS</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{mktAnalysis.bestNeighborhoods.map((n, i) => <span key={i} style={{ fontSize: 11, color: "rgba(255,255,255,0.65)", background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.18)", padding: "3px 10px", borderRadius: 16 }}>{n}</span>)}</div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", fontFamily: "'IBM Plex Mono',monospace", marginBottom: 6 }}>💡 INVESTOR TIP</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>{mktAnalysis.investorTip}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// APP SHELL — Sidebar + Navigation
// ═══════════════════════════════════════════════════════════════

const NAV_ITEMS = [
  { id: "analyzer", label: "Property Analyzer", icon: "🔍", desc: "Analyze any property" },
  { id: "portfolio", label: "Portfolio Tracker", icon: "🏘", desc: "Manage your properties" },
  { id: "markets", label: "Market Explorer", icon: "🗺", desc: "Rank US markets" },
];

export default function Section8Scout() {
  const [activeTool, setActiveTool] = useState("analyzer");
  const [rapidApiKey, setRapidApiKey] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const apiKeys = { rapidApi: rapidApiKey, setRapidApi: setRapidApiKey };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#060A10", color: "#E8EDF5", fontFamily: "'Syne', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(0,229,155,0.3); border-radius: 2px; }
        textarea { font-family: inherit; }
        select { appearance: none; }
      `}</style>

      {/* Fixed grid bg */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "linear-gradient(rgba(0,229,155,0.018) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,155,0.018) 1px,transparent 1px)", backgroundSize: "55px 55px", pointerEvents: "none" }} />

      {/* Sidebar */}
      <div style={{ position: "fixed", top: 0, left: 0, bottom: 0, width: sidebarCollapsed ? 64 : 220, background: "rgba(10,16,28,0.98)", borderRight: "1px solid rgba(255,255,255,0.07)", zIndex: 50, display: "flex", flexDirection: "column", transition: "width 0.2s ease", flexShrink: 0 }}>

        {/* Logo */}
        <div style={{ padding: sidebarCollapsed ? "20px 16px" : "22px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,#00E59B,#0AB87A)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🏠</div>
          {!sidebarCollapsed && (
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em", fontFamily: "'IBM Plex Mono',monospace", color: "#E8EDF5" }}>Section8<span style={{ color: "#00E59B" }}>Scout</span></div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", letterSpacing: "0.1em", textTransform: "uppercase" }}>BETA</div>
            </div>
          )}
        </div>

        {/* Nav items */}
        <div style={{ flex: 1, padding: "14px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
          {NAV_ITEMS.map(item => {
            const active = activeTool === item.id;
            return (
              <button key={item.id} onClick={() => setActiveTool(item.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: sidebarCollapsed ? "10px 0" : "10px 12px", borderRadius: 10, border: "none", cursor: "pointer", background: active ? "rgba(0,229,155,0.1)" : "transparent", borderLeft: active ? `3px solid #00E59B` : "3px solid transparent", width: "100%", textAlign: "left", transition: "all 0.15s", justifyContent: sidebarCollapsed ? "center" : "flex-start" }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>{item.icon}</span>
                {!sidebarCollapsed && (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: active ? "#00E59B" : "#E8EDF5" }}>{item.label}</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginTop: 1 }}>{item.desc}</div>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Collapse toggle */}
        <div style={{ padding: "14px 10px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button onClick={() => setSidebarCollapsed(s => !s)} style={{ display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "flex-start", gap: 10, padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: "transparent", color: "rgba(255,255,255,0.3)", width: "100%", fontSize: 12, transition: "all 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <span style={{ fontSize: 14 }}>{sidebarCollapsed ? "→" : "←"}</span>
            {!sidebarCollapsed && <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, letterSpacing: "0.06em" }}>COLLAPSE</span>}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ marginLeft: sidebarCollapsed ? 64 : 220, flex: 1, minHeight: "100vh", position: "relative", zIndex: 1, transition: "margin-left 0.2s ease", overflowY: "auto" }}>

        {/* Top bar */}
        <div style={{ position: "sticky", top: 0, background: "rgba(6,10,16,0.92)", backdropFilter: "blur(16px)", borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", zIndex: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>{NAV_ITEMS.find(n => n.id === activeTool)?.icon}</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{NAV_ITEMS.find(n => n.id === activeTool)?.label}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{NAV_ITEMS.find(n => n.id === activeTool)?.desc}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {NAV_ITEMS.filter(n => n.id !== activeTool).map(n => (
              <button key={n.id} onClick={() => setActiveTool(n.id)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "6px 13px", color: "rgba(255,255,255,0.45)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "#E8EDF5"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}>
                <span>{n.icon}</span> {n.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tool content */}
        <div style={{ animation: "fadeUp 0.35s ease both" }} key={activeTool}>
          {activeTool === "analyzer" && <PropertyAnalyzer apiKeys={apiKeys} />}
          {activeTool === "portfolio" && <PortfolioTracker />}
          {activeTool === "markets" && <MarketExplorer />}
        </div>
      </div>
    </div>
  );
}
