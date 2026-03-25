/**
 * GET /api/site-config
 * Public values only (no secrets). Lets ANAM_PERSONA_ID live in Vercel env instead of script.js.
 */
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const id = (process.env.ANAM_PERSONA_ID || "").trim();
  res.status(200).json({
    anamPersonaId: id
  });
};
