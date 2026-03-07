// api/zillow.js
// Fetches live Zillow listing data via ZLLW Working API on RapidAPI
// Env vars required: RAPIDAPI_KEY

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { address } = req.body;
  if (!address) return res.status(400).json({ error: "address required" });

  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey) return res.status(200).json({ error: "No RapidAPI key configured", source: "none" });

  try {
    const encoded = encodeURIComponent(address);
    const response = await fetch(
      `https://zllw-working-api.p.rapidapi.com/property/byaddress?address=${encoded}`,
      {
        method: "GET",
        headers: {
          "X-RapidAPI-Key": apiKey,
          "X-RapidAPI-Host": "zllw-working-api.p.rapidapi.com"
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(200).json({ error: data.message || "Zillow API error", source: "zillow" });
    }

    // Normalize response fields
    const normalized = {
      source: "zillow_live",
      price: data.price || data.listPrice || null,
      zestimate: data.zestimate || data.zestiamte || null,
      rentZestimate: data.rentZestimate || null,
      daysOnMarket: data.daysOnMarket || data.timeOnZillow || null,
      sqft: data.livingArea || data.squareFeet || null,
      bedrooms: data.bedrooms || null,
      bathrooms: data.bathrooms || null,
      yearBuilt: data.yearBuilt || null,
      lotSize: data.lotAreaValue || null,
      homeType: data.homeType || null,
      address: data.address || address,
      zillowUrl: data.url || null,
      pricePerSqft: data.resoFacts?.pricePerSquareFoot || null,
      taxAssessedValue: data.taxAssessedValue || null,
      raw: data
    };

    return res.status(200).json(normalized);
  } catch (err) {
    console.error("Zillow API error:", err);
    return res.status(200).json({ error: err.message, source: "zillow_error" });
  }
}
