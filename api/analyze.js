// api/analyze.js — Haiku + web search for neighborhood quality, static crime/voucher data
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
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";

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

    // Pin real data — AI cannot override these
    analysis.crime_score = crimeData?.crime_score || 55;
    analysis.crime_rating = crimeData?.crime_rating || "moderate";
    analysis.crime_source = crimeData?.source || "State Estimate";
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
