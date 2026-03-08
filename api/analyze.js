// api/analyze.js
// Full AI property analysis using Claude with web search for real neighborhood stats
// Env vars required: ANTHROPIC_API_KEY

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { address, zip, city, state, fmr, price, bedrooms, s8Score } = req.body;
  if (!address || !fmr || !price) return res.status(400).json({ error: "address, fmr, price required" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" });

  const rtp = ((fmr / price) * 100).toFixed(2);

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
        max_tokens: 1200,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{
          role: "user",
          content: `You are a Section 8 real estate investment expert. Analyze this property using real web data.

Property: ${address}
ZIP: ${zip} | City: ${city}, ${state} | Bedrooms: ${bedrooms}
HUD Fair Market Rent: $${fmr}/mo
Purchase Price: $${Number(price).toLocaleString()}
Rent-to-Price Ratio: ${rtp}%
S8 Score: ${s8Score}/100

IMPORTANT: Use your web search tool to find REAL current data:
1. Search for crime statistics for "${city}, ${state}" or ZIP ${zip}
2. Search for Section 8 / HCV voucher availability in "${city} housing authority vouchers"
3. Search for average days on market and rental vacancy rates in "${city} ${state} rental market"
4. Search for any recent news about "${city} ${state} Section 8 landlord" or housing policy

Then return ONLY this JSON (no markdown, no backticks, no explanation):
{
  "headline": "one powerful sentence investment verdict for this specific property",
  "cashflow_low": <conservative monthly cashflow after mortgage+insurance+taxes+maintenance>,
  "cashflow_high": <optimistic monthly cashflow>,
  "pros": ["specific pro 1", "specific pro 2", "specific pro 3"],
  "risks": ["specific risk 1", "specific risk 2"],
  "tip": "one highly specific tactical tip for this exact property and market",
  "inspection_likelihood": "high" | "medium" | "low",
  "recommended_offer": <suggested offer price as number>,
  "crime_rating": "low" | "moderate" | "high",
  "crime_score": <number 0-100 where 100 is safest>,
  "voucher_demand": "HIGH" | "MEDIUM" | "LOW",
  "voucher_waitlist": "open" | "closed" | "unknown",
  "avg_days_on_market": <number or null>,
  "vacancy_rate": "<percentage string or null>",
  "neighborhood_notes": "2 sentences about this specific neighborhood based on real data",
  "market_trend": "appreciating" | "stable" | "declining",
  "landlord_friendly": true | false,
  "data_sources": ["source1", "source2"]
}`
        }]
      })
    });

    const data = await response.json();
   if (!data || !data.content) throw new Error("Bad API response: " + JSON.stringify(data).slice(0,150));
   const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
    const match = text.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
    
    if (!match) throw new Error("Could not parse analysis");
    return res.status(200).json(JSON.parse(match[0]));

  } catch (err) {
    console.error("Analysis error:", err);
    return res.status(500).json({ error: err.message });
  }
}
