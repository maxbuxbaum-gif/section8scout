// api/vouchers.js
// Fetches real HUD Housing Choice Voucher demand data
// Uses HUD Open Data ArcGIS API (free, no key needed) + Claude web search fallback
// Env vars required: ANTHROPIC_API_KEY (for fallback)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { zip, city, state } = req.body;
  if (!zip && !city) return res.status(400).json({ error: "zip or city required" });

  // ── Strategy 1: HUD Open Data ArcGIS API (free, no auth) ─────────────────
  // Housing Choice Vouchers by Census Tract dataset
  if (zip) {
    try {
      // Query HUD's open ARCGIS endpoint for HCV data by ZIP-adjacent tracts
      // Use the HUD USPS ZIP-Tract crosswalk to get tract IDs, then query vouchers
      const hudRes = await fetch(
        `https://hudgis-hud.opendata.arcgis.com/datasets/HUD::housing-choice-vouchers-by-tract.geojson?where=1%3D1&outFields=*&resultRecordCount=1`,
        { headers: { "Accept": "application/json" } }
      );

      // If that works, use it; otherwise fall through
      if (hudRes.ok) {
        // Try the Feature Service directly with ZIP code filter
        const featureRes = await fetch(
          `https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Housing_Choice_Vouchers_by_Tract/FeatureServer/0/query?where=ZIP_CODE='${zip}'&outFields=tot_hcv_units,pct_hcv,ZIP_CODE,GEOID&f=json`
        );
        
        if (featureRes.ok) {
          const featureData = await featureRes.json();
          const features = featureData?.features;

          if (features && features.length > 0) {
            const totalVouchers = features.reduce((sum, f) => sum + (f.attributes?.tot_hcv_units || 0), 0);
            const avgPctHCV = features.reduce((sum, f) => sum + (f.attributes?.pct_hcv || 0), 0) / features.length;

            // Classify demand
            let demand, demandScore;
            if (avgPctHCV >= 15 || totalVouchers >= 500) {
              demand = "HIGH"; demandScore = 20;
            } else if (avgPctHCV >= 7 || totalVouchers >= 150) {
              demand = "MEDIUM"; demandScore = 13;
            } else {
              demand = "LOW"; demandScore = 7;
            }

            return res.status(200).json({
              voucher_demand: demand,
              demand_score: demandScore,
              total_hcv_units: totalVouchers,
              pct_hcv: Math.round(avgPctHCV * 10) / 10,
              zip,
              source: "HUD Open Data",
              method: "hud_arcgis"
            });
          }
        }
      }
    } catch (err) {
      console.error("HUD ArcGIS error:", err.message);
    }
  }

  // ── Strategy 2: HUD Picture of Subsidized Households via Claude web search ─
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 500,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{
            role: "user",
            content: `Search for Section 8 Housing Choice Voucher data for ${city || ""} ${state || ""} ZIP code ${zip || ""}.
Find information about:
1. How many active HCV/Section 8 vouchers are in use in this area
2. Whether the housing authority waitlist is open or closed
3. How long the waitlist is (if available)
4. Overall voucher demand level for landlords

Use HUD data, housing authority websites, or reliable sources.

Return ONLY this JSON (no markdown, no backticks):
{
  "voucher_demand": "HIGH" | "MEDIUM" | "LOW",
  "demand_score": <20 for HIGH, 13 for MEDIUM, 7 for LOW>,
  "total_hcv_units": <estimated number of active vouchers in area or null>,
  "waitlist_status": "open" | "closed" | "unknown",
  "waitlist_length": <number or null>,
  "housing_authority": "<name of local PHA>",
  "landlord_friendly_pha": true | false | null,
  "notes": "one sentence about voucher availability in this market",
  "source": "<source name>",
  "method": "web_search"
}`
          }]
        })
      });

      const data = await response.json();
      const text = data.content.filter(b => b.type === "text").map(b => b.text).join("");
      const match = text.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);

      if (match) {
        return res.status(200).json(JSON.parse(match[0]));
      }
    } catch (err) {
      console.error("Claude voucher fallback error:", err.message);
    }
  }

  // ── Strategy 3: Derive from FMR level (last resort) ──────────────────────
  // Higher FMR areas tend to have more demand
  const FMR_DEMAND_MAP = {
    // High demand metros based on HUD utilization data
    "NY": "HIGH", "CA": "HIGH", "IL": "HIGH", "TX": "HIGH",
    "PA": "HIGH", "MD": "HIGH", "GA": "HIGH", "OH": "HIGH",
    "MI": "HIGH", "MO": "HIGH", "TN": "HIGH", "WI": "HIGH",
    "IN": "HIGH", "AL": "HIGH",
    // Medium demand
    "FL": "MEDIUM", "NC": "MEDIUM", "VA": "MEDIUM", "WA": "MEDIUM",
    "CO": "MEDIUM", "AZ": "MEDIUM", "MN": "MEDIUM", "KY": "MEDIUM",
    "SC": "MEDIUM", "LA": "MEDIUM",
    // Lower demand (rural/smaller markets)
    "MT": "LOW", "WY": "LOW", "ND": "LOW", "SD": "LOW", "VT": "LOW",
    "NH": "LOW", "ME": "LOW", "ID": "LOW"
  };

  const demand = FMR_DEMAND_MAP[state?.toUpperCase()] || "MEDIUM";
  const demandScore = demand === "HIGH" ? 20 : demand === "MEDIUM" ? 13 : 7;

  return res.status(200).json({
    voucher_demand: demand,
    demand_score: demandScore,
    total_hcv_units: null,
    waitlist_status: "unknown",
    source: "State-Level Estimate",
    method: "static_fallback"
  });
}
