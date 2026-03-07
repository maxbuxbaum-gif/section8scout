// api/crime.js
// Fetches real FBI UCR crime data via api.usa.gov
// Falls back to Claude web search if FBI API fails or city not found
// Env vars required: FBI_API_KEY (free at api.data.gov), ANTHROPIC_API_KEY

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { city, state, zip } = req.body;
  if (!city && !state) return res.status(400).json({ error: "city and state required" });

  const fbiKey = process.env.FBI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  // ── Strategy 1: FBI Crime Data API ──────────────────────────────────────
  if (fbiKey) {
    try {
      // Step 1: Find the agency ORI for this city
      const agencyRes = await fetch(
        `https://api.usa.gov/crime/fbi/cde/agency/byStateAbbr/${state}?API_KEY=${fbiKey}`
      );
      const agencyData = await agencyRes.json();
      
      // Find city police department
      const cityNorm = city.toLowerCase().replace(/\s+/g, " ").trim();
      const agency = agencyData?.results?.find(a => {
        const agencyCity = (a.agency_name || "").toLowerCase();
        return agencyCity.includes(cityNorm) && 
               (agencyCity.includes("police") || agencyCity.includes("sheriff") || agencyCity.includes("dept"));
      }) || agencyData?.results?.[0];

      if (agency?.ori) {
        // Step 2: Get crime summary for that agency (last 3 years)
        const crimeRes = await fetch(
          `https://api.usa.gov/crime/fbi/cde/summarized/agency/${agency.ori}/violent-crime?from=2020&to=2023&API_KEY=${fbiKey}`
        );
        const crimeData = await crimeRes.json();
        
        // Step 3: Get population for rate calculation
        const popRes = await fetch(
          `https://api.usa.gov/crime/fbi/cde/agency/${agency.ori}?API_KEY=${fbiKey}`
        );
        const popData = await popRes.json();
        const population = popData?.results?.[0]?.population || 100000;

        // Get most recent year
        const results = crimeData?.results;
        if (results && results.length > 0) {
          const latest = results[results.length - 1];
          const violentCrimes = latest.actual || 0;
          const violentCrimeRate = (violentCrimes / population) * 100000;

          // Convert to 0-100 safety score (lower crime rate = higher safety score)
          // US average violent crime rate ~400/100k
          // Score: 100 = very safe (<100/100k), 0 = very dangerous (>1500/100k)
          const safetyScore = Math.round(Math.max(0, Math.min(100, 
            100 - ((violentCrimeRate / 1500) * 100)
          )));

          const crimeRating = safetyScore >= 70 ? "low" : safetyScore >= 45 ? "moderate" : "high";

          return res.status(200).json({
            crime_score: safetyScore,
            crime_rating: crimeRating,
            violent_crime_rate: Math.round(violentCrimeRate),
            violent_crimes: violentCrimes,
            population,
            year: latest.year || 2023,
            agency_name: agency.agency_name,
            source: "FBI UCR",
            method: "fbi_api"
          });
        }
      }
    } catch (err) {
      console.error("FBI API error:", err.message);
      // Fall through to Claude fallback
    }
  }

  // ── Strategy 2: Claude web search fallback ───────────────────────────────
  if (anthropicKey) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "tools-2024-04-04"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 400,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{
            role: "user",
            content: `Search for the current crime statistics for ${city}, ${state}${zip ? ` (ZIP ${zip})` : ""}.
Find violent crime rate per 100,000 residents from FBI UCR data, local police reports, or NeighborhoodScout.
Return ONLY this JSON (no markdown, no backticks):
{
  "crime_score": <0-100 safety score where 100=safest, 0=most dangerous>,
  "crime_rating": "low" | "moderate" | "high",
  "violent_crime_rate": <per 100k residents as number>,
  "source": "<source name>",
  "year": <data year>,
  "method": "web_search"
}`
          }]
        })
      });

      const data = await response.json();
      const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
      const match = text.replace(/```json|```/g, "").match(/\{[\s\S]*?\}/);

      if (match) {
        const result = JSON.parse(match[0]);
        return res.status(200).json(result);
      }
    } catch (err) {
      console.error("Claude crime fallback error:", err.message);
    }
  }

  // ── Strategy 3: Static fallback by state (last resort) ──────────────────
  // Based on FBI UCR state averages
  const STATE_CRIME_BASELINES = {
    "AL": 45, "AK": 35, "AZ": 52, "AR": 44, "CA": 55, "CO": 58,
    "CT": 65, "DE": 58, "FL": 53, "GA": 50, "HI": 68, "ID": 65,
    "IL": 50, "IN": 58, "IA": 65, "KS": 58, "KY": 55, "LA": 38,
    "ME": 72, "MD": 48, "MA": 62, "MI": 52, "MN": 62, "MS": 40,
    "MO": 48, "MT": 60, "NE": 60, "NV": 48, "NH": 75, "NJ": 60,
    "NM": 38, "NY": 58, "NC": 53, "ND": 68, "OH": 55, "OK": 48,
    "OR": 55, "PA": 55, "RI": 60, "SC": 48, "SD": 65, "TN": 48,
    "TX": 53, "UT": 62, "VT": 78, "VA": 62, "WA": 58, "WV": 52,
    "WI": 60, "WY": 65
  };

  const baseline = STATE_CRIME_BASELINES[state?.toUpperCase()] || 55;
  const crimeRating = baseline >= 65 ? "low" : baseline >= 45 ? "moderate" : "high";

  return res.status(200).json({
    crime_score: baseline,
    crime_rating: crimeRating,
    violent_crime_rate: null,
    source: "State Average Estimate",
    year: 2023,
    method: "static_fallback"
  });
}
