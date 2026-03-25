/**
 * Vercel Serverless Function: POST /api/agent
 * Set GEMINI_API_KEY (or GOOGLE_API_KEY) in Vercel → Environment Variables.
 * Optional: GEMINI_MODEL (default: gemini-1.5-flash — better free-tier quota than gemini-2.0-flash)
 */
const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function safeJson(obj, fallback = {}) {
  if (!obj || typeof obj !== "object") return fallback;
  return obj;
}

/** Gemini function declarations (same tools as the frontend dispatcher expects) */
const functionDeclarations = [
  {
    name: "scrollToSection",
    description: "Scroll to a section on the page by its DOM id (example: 'call', 'contact', 'news').",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        id: { type: SchemaType.STRING, description: "Section id without '#'" }
      },
      required: ["id"]
    }
  },
  {
    name: "setThemeColor",
    description: "Set the site theme color (supported: blue, purple, pink, green, red, navy, teal, orange, yellow).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        color: { type: SchemaType.STRING }
      },
      required: ["color"]
    }
  },
  {
    name: "playMusic",
    description: "Play the website background music (requires user interaction permission, may be blocked).",
    parameters: { type: SchemaType.OBJECT, properties: {} }
  },
  {
    name: "pauseMusic",
    description: "Pause the website background music.",
    parameters: { type: SchemaType.OBJECT, properties: {} }
  },
  {
    name: "refreshLatestNews",
    description: "Refresh the Latest Tech News section.",
    parameters: { type: SchemaType.OBJECT, properties: {} }
  },
  {
    name: "startCall",
    description:
      "Start a live video call flow using the PIN-based signaling (Firebase RTDB on the client). Frontend will generate a PIN if not provided.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        role: {
          type: SchemaType.STRING,
          description: "Either 'host' or 'join' (host starts the WebRTC offer, join answers).",
          enum: ["host", "join"]
        },
        pin: {
          type: SchemaType.STRING,
          description: "Optional 4-digit numeric PIN. If omitted, the frontend will generate one."
        }
      },
      required: ["role"]
    }
  },
  {
    name: "ticTacToeReset",
    description: "Reset the Tic Tac Toe game.",
    parameters: { type: SchemaType.OBJECT, properties: {} }
  },
  {
    name: "snakeStart",
    description: "Start the Snake game.",
    parameters: { type: SchemaType.OBJECT, properties: {} }
  },
  {
    name: "snakeStop",
    description: "Stop the Snake game.",
    parameters: { type: SchemaType.OBJECT, properties: {} }
  },
  {
    name: "snakeReset",
    description: "Reset the Snake game.",
    parameters: { type: SchemaType.OBJECT, properties: {} }
  },
  {
    name: "fillContactForm",
    description: "Fill the contact form fields (does not submit).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING },
        email: { type: SchemaType.STRING },
        message: { type: SchemaType.STRING }
      }
    }
  },
  {
    name: "submitContactForm",
    description: "Submit the contact form (frontend currently shows a local success message).",
    parameters: { type: SchemaType.OBJECT, properties: {} }
  }
];

function toGeminiContents(messages) {
  return messages.map((m) => {
    const role = m.role === "assistant" ? "model" : "user";
    const text = String(m.content ?? "");
    return { role, parts: [{ text }] };
  });
}

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      res.status(500).json({
        error: "Server misconfiguration: set GEMINI_API_KEY (or GOOGLE_API_KEY) in Vercel env"
      });
      return;
    }

    const body = safeJson(req.body);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const userText =
      typeof body.message === "string"
        ? body.message
        : messages.length
          ? String(messages[messages.length - 1].content || "")
          : "";

    if (!userText) {
      res.status(400).json({ error: "Missing message" });
      return;
    }

    const trimmedMessages = messages.length ? messages.slice(-10) : [{ role: "user", content: userText }];

    const systemPrompt =
      "You are the Digvijay portfolio AI agent for a static website. " +
      "You can control the website ONLY by requesting tool calls from the allowed tool list. " +
      "Use tools when user requests actions like: connect to Digvijay (startCall), change theme, play/pause music, refresh latest news, scroll, or interact with games/contact form. " +
      "When you request startCall, prefer role='join' for user requests like 'connect me to Digvijay' or 'join the call'. " +
      "Prefer role='host' when user asks to host or says they are Digvijay. " +
      "If the user asks for information (about skills, projects, etc.), respond normally without tools.";

    const modelName = process.env.GEMINI_MODEL || "gemini-1.5-flash";
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt,
      tools: [{ functionDeclarations }]
    });

    const contents = toGeminiContents(trimmedMessages);

    const result = await model.generateContent({
      contents,
      generationConfig: {
        maxOutputTokens: 600,
        temperature: 0.7
      }
    });

    const response = result.response;
    const parts = response.candidates?.[0]?.content?.parts || [];

    let assistantText = "";
    const toolCalls = [];

    for (const part of parts) {
      if (part.text) assistantText += part.text;
      if (part.functionCall) {
        const fc = part.functionCall;
        toolCalls.push({
          name: fc.name,
          input: fc.args && typeof fc.args === "object" ? fc.args : {}
        });
      }
    }

    if (!assistantText) {
      assistantText = toolCalls.length
        ? "Done. I triggered the requested actions."
        : "Okay. What would you like to do next?";
    }

    res.status(200).json({
      assistantText,
      toolCalls
    });
  } catch (err) {
    console.error("Agent endpoint error:", err);
    const msg = String(err?.message || err);
    const quota =
      /429|Too Many Requests|quota|rate limit|RESOURCE_EXHAUSTED/i.test(msg);
    if (quota) {
      res.status(503).json({
        error: "Gemini quota or rate limit",
        details:
          "Google AI free-tier limits were hit for this model or project. Wait a minute and retry; check quota at https://ai.dev/rate-limit ; or enable billing in Google AI Studio. You can set GEMINI_MODEL to another model (e.g. gemini-1.5-flash or gemini-2.0-flash) in Vercel env.",
        hint: msg.slice(0, 1200)
      });
      return;
    }
    res.status(500).json({ error: "Agent failed", details: msg });
  }
};
