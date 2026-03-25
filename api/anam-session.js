/**
 * GET /api/anam-session
 * Server-side only: exchanges ANAM_API_KEY for a short-lived session token (never expose the API key to the browser).
 * Requires: ANAM_API_KEY + ANAM_PERSONA_ID in env (Vercel or .env.local with vercel dev).
 */
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = (process.env.ANAM_API_KEY || "").trim();
  const personaId = (process.env.ANAM_PERSONA_ID || "").trim();

  if (!apiKey) {
    res.status(200).json({
      sessionToken: null,
      mode: "agent-id",
      message: "ANAM_API_KEY not set — widget will use agent-id + Lab allowlist if persona id is set"
    });
    return;
  }

  if (!personaId) {
    res.status(400).json({
      error: "ANAM_PERSONA_ID is required when using ANAM_API_KEY"
    });
    return;
  }

  try {
    const anamRes = await fetch("https://api.anam.ai/v1/auth/session-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        personaConfig: {
          personaId
        }
      })
    });

    const text = await anamRes.text();
    if (!anamRes.ok) {
      console.error("Anam session-token error:", anamRes.status, text);
      res.status(502).json({
        error: "Anam API rejected session token request",
        details: text.slice(0, 800)
      });
      return;
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      res.status(502).json({ error: "Invalid JSON from Anam API" });
      return;
    }

    const sessionToken = data.sessionToken || data.token || null;
    if (!sessionToken) {
      res.status(502).json({ error: "No sessionToken in Anam response", raw: text.slice(0, 400) });
      return;
    }

    res.status(200).json({ sessionToken, mode: "session-token" });
  } catch (err) {
    console.error("anam-session:", err);
    res.status(500).json({ error: "Failed to create Anam session", details: String(err?.message || err) });
  }
};
