// api/analyze.js — Haiku + web search for neighborhood quality, static crime/voucher data

// Extract a violent crime rate (per 100k) from free-form narrative text.
// Handles three common phrasings and normalises per-1k rates to per-100k.
export function extractViolentCrimeRate(text) {
  // "X per 100,000" or "X per 100k"
  const m100k = text.match(/(\d[\d,]*(?:\.\d+)?)\s+(?:violent\s+)?(?:crimes?|incidents?)\s+per\s+100[,.]?000/i);
  if (m100k) return parseFloat(m100k[1].replace(/,/g, ""));

  // "X per 1,000" or "X per 1000" → scale up to per-100k
  const m1k = text.match(/(\d[\d,]*(?:\.\d+)?)\s+(?:violent\s+)?(?:crimes?|incidents?)\s+per\s+1[,.]?000\b/i);
  if (m1k) return parseFloat(m1k[1].replace(/,/g, "")) * 100;

  // "violent crime rate of X" — treat < 100 as per-1k, >= 100 as per-100k
  const mRate = text.match(/violent\s+crime\s+rate\s+of\s+(\d[\d,]*(?:\.\d+)?)/i);
  if (mRate) {
    const v = parseFloat(mRate[1].replace(/,/g, ""));
    return v < 100 ? v * 100 : v;
  }

  return null;
}

// Pick the first web-search source from the AI's data_sources list,
// ignoring the pinned backend source names we append ourselves.
const BACKEND_SOURCES = new Set([
  "HUD FMR", "State Estimate", "State Average Estimate",
  "State-Level Estimate", "FBI UCR", "HUD Open Data",
]);
export function pickWebSearchSource(dataSources) {
  if (!Array.isArray(dataSources)) return "Web Search";
  return dataSources.find(s => !BACKEND_SOURCES.has(s)) || "Web Search";
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { address, zip, city, state, fmr, price, bedrooms } = req.body;
  if (!address || !fmr || !price) return res.status(400).json({ error: "address, fmr, price required" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" });

  const rtp = ((fmr / price) * 100).toFixed(2);
  // BASE_URL can be set explicitly (e.g. in .env.local for custom ports).
  // On Vercel, VERCEL_URL is set automatically. Falls back to vercel dev default port 3000.
  const baseUrl = process.env.BASE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  try {
    // Fetch crime + voucher in parallel (static, no Claude tokens)
    const [crimeResult, voucherResult] = await Promise.allSettled([
      fetch(`${baseUrl}/api/crime`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city, state, zip }) }).then(r => r.json()),
      fetch(`${baseUrl}/api/vouchers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zip, city, state }) }).then(r => r.json())
    ]);

    const crimeData = crimeResult.status === "fulfilled" ? crimeResult.value : null;
    const voucherData = voucherResult.status === "fulfilled" ? voucherResult.value : null;

    // Haiku + web search — one focused search query only
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 800,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        tool_choice: { type: "auto" },
        messages: [{
          role: "user",
          content: `You are a Section 8 real estate investment expert. Search the web for current info about this specific neighborhood, then return your analysis.

Property: ${address}, ${city} ${state} ${zip}
Bedrooms: ${bedrooms} | HUD FMR: $${fmr}/mo | Price: $${Number(price).toLocaleString()} | Rent-to-Price: ${rtp}%
Crime safety: ${crimeData?.crime_score || 55}/100 (${crimeData?.crime_rating || "moderate"}) — source: ${crimeData?.source || "estimate"}
Voucher demand: ${voucherData?.voucher_demand || "MEDIUM"} — source: ${voucherData?.source || "estimate"}

Search for: "${city} ${state} ${zip} neighborhood rental market Section 8"

Return ONLY valid JSON, no markdown:
{"headline":"<1 sentence investment verdict>","cashflow_low":<number>,"cashflow_high":<number>,"pros":["<pro1>","<pro2>","<pro3>"],"risks":["<risk1>","<risk2>"],"tip":"<1 specific tactical tip>","inspection_likelihood":"high"|"medium"|"low","recommended_offer":<number>,"neighborhood_notes":"<2 sentences with specific local detail>","market_trend":"appreciating"|"stable"|"declining","landlord_friendly":true|false,"avg_days_on_market":<number|null>,"vacancy_rate":"<string|null>","data_sources":["<source1>","<source2>"]}`
        }]
      })
    });

    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error?.message || `API error ${response.status}`);
    if (!data.content || !Array.isArray(data.content)) throw new Error(`Bad response: ${JSON.stringify(data).slice(0, 150)}`);

    const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
    const match = text.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Could not parse JSON from response");

    const analysis = JSON.parse(match[0]);

    // ── Try to extract a specific crime rate from the AI narrative ────────────
    // Only used when crime.js fell back to the static state-level estimate, since
    // FBI UCR / Claude web-search results from crime.js are more authoritative.
    const crimeIsStatic = !crimeData || crimeData.method === "static_fallback";
    if (crimeIsStatic) {
      const narrativeText = [
        analysis.neighborhood_notes,
        ...(Array.isArray(analysis.pros) ? analysis.pros : []),
        ...(Array.isArray(analysis.risks) ? analysis.risks : []),
      ].filter(Boolean).join(" ");

      const ratePerHundredK = extractViolentCrimeRate(narrativeText);
      if (ratePerHundredK !== null) {
        // Same formula as crime.js FBI strategy so scores are on the same scale
        const score = Math.round(Math.max(0, Math.min(100, 100 - (ratePerHundredK / 1500) * 100)));
        analysis.crime_score = score;
        analysis.crime_rating = score >= 70 ? "low" : score >= 45 ? "moderate" : "high";
        // Credit the web-search source the AI already listed in data_sources
        const webSrc = pickWebSearchSource(analysis.data_sources);
        analysis.crime_source = webSrc;
      }
    }

    // Pin real data — AI cannot freely override these.
    // Crime fields are only pinned when we already have authoritative data from
    // crime.js (FBI API or web search). If the extraction above set them from
    // a specific rate in the AI narrative, those values take priority over the
    // static state-level estimate.
    if (!analysis.crime_score) {
      analysis.crime_score = crimeData?.crime_score || 55;
      analysis.crime_rating = crimeData?.crime_rating || "moderate";
      analysis.crime_source = crimeData?.source || "State Estimate";
    }
    analysis.voucher_demand = voucherData?.voucher_demand || "MEDIUM";
    analysis.voucher_source = voucherData?.source || "State Estimate";
    analysis.voucher_waitlist = voucherData?.waitlist_status || "unknown";
    analysis.total_hcv_units = voucherData?.total_hcv_units || null;
    analysis.housing_authority = voucherData?.housing_authority || "";
    if (!analysis.data_sources) analysis.data_sources = [];
    analysis.data_sources.push(crimeData?.source || "State Estimate", voucherData?.source || "State Estimate", "HUD FMR");

    return res.status(200).json(analysis);

  } catch (err) {
    console.error("Analysis error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
