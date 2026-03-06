// netlify/functions/subscribe.js
// ─────────────────────────────────────────────────────────────────────────────
// Mailchimp waitlist subscription handler for Section8Scout
//
// Environment variables required (set in Netlify dashboard → Site Settings → Env):
//   MAILCHIMP_API_KEY   → your Mailchimp API key  (e.g. abc123def456-us14)
//   MAILCHIMP_LIST_ID   → your Audience/List ID   (e.g. a1b2c3d4e5)
//
// The datacenter (us14, us21, etc.) is extracted automatically from the API key.
// ─────────────────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // CORS headers — allow requests from your domain
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // Parse request body
  let email, source, tags;
  try {
    ({ email, source, tags = [] } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  // Validate email
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid email address" }) };
  }

  // Read env vars
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const listId = process.env.MAILCHIMP_LIST_ID;

  if (!apiKey || !listId) {
    console.error("Missing MAILCHIMP_API_KEY or MAILCHIMP_LIST_ID env vars");
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server configuration error" }) };
  }

  // Extract datacenter from API key (everything after the last hyphen: abc123-us14 → us14)
  const dc = apiKey.split("-").pop();
  const url = `https://${dc}.api.mailchimp.com/3.0/lists/${listId}/members`;

  // Build Mailchimp member payload
  const payload = {
    email_address: email,
    status: "subscribed",           // use "pending" to require double opt-in
    tags: tags,
    merge_fields: {
      SOURCE: source || "landing-page",
      SIGNUP_DT: new Date().toISOString().split("T")[0],
    },
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`anystring:${apiKey}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    // Handle already-subscribed gracefully
    if (data.title === "Member Exists") {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: "already_subscribed", message: "Already on the list!" }),
      };
    }

    if (!response.ok) {
      console.error("Mailchimp error:", data);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: data.detail || data.title || "Mailchimp error" }),
      };
    }

    console.log(`✓ New subscriber: ${email} (source: ${source})`);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: "subscribed", email }),
    };

  } catch (err) {
    console.error("Network error calling Mailchimp:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Failed to reach Mailchimp API" }),
    };
  }
};
