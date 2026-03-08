// api/market.js
// AI market analysis with real web search for Section 8 market deep dives
// Env vars required: ANTHROPIC_API_KEY

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { city, state, fmr3, medianPrice, vouchers, voucherDemand, score, landlordFriendly } = req.body;
  if (!city || !state) return res.status(400).json({ error: "city and state required" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" });

  const rtp = fmr3 && medianPrice ? ((fmr3 / medianPrice) * 100).toFixed(2) : "N/A";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "tools-2024-04-04"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{
          role: "user",
          content: `You are a Section 8 real estate market analyst. Research and analyze ${city}, ${state} as a Section 8 investment market.

Known data:
- HUD FMR (3BR): $${fmr3}/mo
- Median Home Price: $${Number(medianPrice).toLocaleString()}
- Rent-to-Price Ratio: ${rtp}%
- Active Vouchers: ${Number(vouchers).toLocaleString()}
- Voucher Demand: ${voucherDemand}
- Landlord-Friendly State: ${landlordFriendly ? "Yes" : "No"}
- S8 Market Score: ${score}/100

IMPORTANT: Use web search to find REAL current data:
1. Search "${city} ${state} Section 8 housing authority 2024" for current voucher program info
2. Search "${city} ${state} crime statistics 2024" for real crime data
3. Search "${city} ${state} real estate market 2024" for current market conditions
4. Search "${city} ${state} best neighborhoods Section 8 landlord" for neighborhood info

Return ONLY this JSON (no markdown, no backticks):
{
  "summary": "2-3 sentence market overview with real current data",
  "bestNeighborhoods": ["neighborhood 1", "neighborhood 2", "neighborhood 3"],
  "pros": ["specific pro with data", "specific pro with data", "specific pro with data"],
  "cons": ["specific con with data", "specific con with data"],
  "investorTip": "one highly specific tactical tip based on real current market conditions",
  "outlook": "bullish" | "neutral" | "bearish",
  "cashFlowEstimate": { "low": <number>, "high": <number> },
  "competition": "low" | "medium" | "high",
  "avgDaysOnMarket": <number or null>,
  "currentCrimeRating": "low" | "moderate" | "high",
  "housingAuthorityNotes": "one sentence about local PHA — waitlist status, payment standards, landlord reputation",
  "recentNews": "one sentence about any recent relevant housing/landlord news in this market",
  "data_sources": ["source1", "source2", "source3"]
}`
        }]
      })
    });

    const data = await response.json();
    const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
    const match = text.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);

    if (!match) throw new Error("Could not parse market analysis");
    const analysis = JSON.parse(match[0]);

    function deepClean(obj) {
      if (typeof obj === 'string') {
        return obj.replace(/<cite[^>]*>([\s\S]*?)<\/cite>/g, '$1').replace(/<\/?cite[^>]*>/g, '');
      }
      if (Array.isArray(obj)) return obj.map(deepClean);
      if (obj && typeof obj === 'object') {
        const cleaned = {};
        for (const key of Object.keys(obj)) cleaned[key] = deepClean(obj[key]);
        return cleaned;
      }
      return obj;
    }

    return res.status(200).json(deepClean(analysis));

  } catch (err) {
    console.error("Market analysis error:", err);
    return res.status(500).json({ error: err.message });
  }
}
