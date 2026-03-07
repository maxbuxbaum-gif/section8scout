// api/status.js
// Returns which API keys are configured — used by the Settings tab
export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  return res.status(200).json({
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasRapidKey: !!process.env.RAPIDAPI_KEY,
  });
}
