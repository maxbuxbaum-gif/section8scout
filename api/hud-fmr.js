// api/hud-fmr.js
// Fetches real HUD Fair Market Rent data using Claude's web search tool
// Env vars required: ANTHROPIC_API_KEY

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { zip, bedrooms } = req.body;
  if (!zip || !bedrooms) return res.status(400).json({ error: "zip and bedrooms required" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" });

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
        max_tokens: 500,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{
          role: "user",
          content: `Search for the current HUD Fair Market Rent for ZIP code ${zip} for ${bedrooms} bedrooms. 
Look up the official HUD FMR data at huduser.gov or from reliable sources. 
Return ONLY this JSON object, no markdown, no explanation:
{
  "fmr": <monthly dollar amount as number>,
  "county": "<county name>",
  "metro": "<metro area name>",
  "state": "<2-letter state code>",
  "year": <FMR year as number>,
  "bedrooms": ${bedrooms},
  "source": "HUD"
}`
        }]
      })
    });

    const data = await response.json();
    const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
    const match = text.replace(/```json|```/g, "").match(/\{[\s\S]*?\}/);
    
    if (!match) throw new Error("Could not parse FMR data");
    const fmrData = JSON.parse(match[0]);
    
    // Validate fmr is a reasonable number
    if (!fmrData.fmr || fmrData.fmr < 400 || fmrData.fmr > 5000) {
      throw new Error("FMR value out of expected range");
    }

    return res.status(200).json(fmrData);
  } catch (err) {
    console.error("HUD FMR error:", err);
    // Return fallback estimate based on bedrooms
    const fallbacks = { 1: 900, 2: 1100, 3: 1300, 4: 1600 };
    return res.status(200).json({
      fmr: fallbacks[bedrooms] || 1200,
      county: "Unknown",
      metro: "Unknown",
      state: "",
      year: 2024,
      bedrooms: parseInt(bedrooms),
      source: "Estimated",
      error: "Could not fetch live data"
    });
  }
}
