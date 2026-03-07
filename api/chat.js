// api/chat.js
// AI property advisor chat endpoint
// Env vars required: ANTHROPIC_API_KEY

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages, propertyContext } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "messages array required" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" });

  const systemPrompt = `You are an expert Section 8 real estate investment advisor with 20+ years of experience. You specialize in Housing Choice Voucher (HCV) programs, HUD regulations, property analysis, and cash flow optimization.

${propertyContext ? `CURRENT PROPERTY BEING ANALYZED:
${propertyContext}

Always ground your answers in this specific property's data when relevant.` : ""}

Guidelines:
- Be direct, specific, and actionable — no fluff
- Use real numbers from the property data when answering
- Max 3-4 sentences per response unless a detailed breakdown is explicitly requested
- If asked about inspection, reference actual HUD UPCS inspection criteria
- If asked about cash flow, use the actual FMR and price data provided
- Flag any red flags you notice proactively`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        system: systemPrompt,
        messages: messages.slice(-10) // last 10 messages for context window management
      })
    });

    const data = await response.json();
    const reply = data.content.map(b => b.text || "").join("");
    return res.status(200).json({ reply });

  } catch (err) {
    console.error("Chat error:", err);
    return res.status(500).json({ error: err.message });
  }
}
