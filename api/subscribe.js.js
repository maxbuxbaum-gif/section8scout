// api/subscribe.js
// Vercel serverless function — Mailchimp waitlist handler for Section8Scout
//
// Environment variables (set in Vercel dashboard → Project Settings → Environment Variables):
//   MAILCHIMP_API_KEY   → your Mailchimp API key  (e.g. abc123def456-us14)
//   MAILCHIMP_LIST_ID   → your Audience ID        (e.g. a1b2c3d4)

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, source, tags = [] } = req.body;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  const apiKey = process.env.MAILCHIMP_API_KEY;
  const listId = process.env.MAILCHIMP_LIST_ID;

  if (!apiKey || !listId) {
    return res.status(500).json({ error: "Server configuration error" });
  }

  const dc = apiKey.split("-").pop();
  const url = `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email_address: email,
      status: "subscribed",
      tags,
      merge_fields: {
        SOURCE: source || "landing-page",
        SIGNUP_DT: new Date().toISOString().split("T")[0],
      },
    }),
  });

  const data = await response.json();

  if (data.title === "Member Exists") {
    return res.status(200).json({ status: "already_subscribed" });
  }

  if (!response.ok) {
    return res.status(400).json({ error: data.detail || data.title || "Mailchimp error" });
  }

  return res.status(200).json({ status: "subscribed", email });
}
