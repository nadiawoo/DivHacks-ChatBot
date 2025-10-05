import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI, Modality } from "@google/genai";
import * as fs from "node:fs";
import { randomUUID } from "crypto";
import { ElevenLabsClient } from "elevenlabs";
import {
  appendTranscriptTurn,
  createSessionForUser,
  findActiveSessionForUser,
  getSessionLastActivity,
  getProgressSnapshots,
  getSessionById,
  getTranscriptForSession,
  getUserProfile,
  getUserProgress,
  getUserRecord,
  listUsers,
  sanitizeSessionId,
  sanitizeUserId,
} from "./db.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
let index = 0;

// Keep light-weight session state in memory so illustrations evolve with the story.
const illustrationSessions = new Map();

const ACTION_UPDATE = "update";
const ACTION_EXPAND = "expand";

const sanitize = (value) => (typeof value === "string" ? value.trim() : "");

const SESSION_IDLE_TIMEOUT_MS = Number(
  process.env.SESSION_IDLE_TIMEOUT_MS || 5 * 60 * 1000
);

const clientIpFromRequest = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "";
};

const userIdFromRequest = (req) => {
  const rawIp = clientIpFromRequest(req).toLowerCase();
  const normalized = rawIp.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const baseId = normalized ? `ip-${normalized}` : "ip-unknown";
  return sanitizeUserId(baseId);
};

const keywordsFrom = (text) =>
  sanitize(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3);

const resolveAction = (history, latestPrompt, requestedAction) => {
  if (requestedAction && requestedAction !== "auto") return requestedAction;
  if (!history.length) return ACTION_UPDATE;

  const previousTerms = new Set(
    history.flatMap(({ prompt }) => keywordsFrom(prompt))
  );
  const latestTerms = keywordsFrom(latestPrompt);
  const hasNewTopic = latestTerms.some((term) => !previousTerms.has(term));
  return hasNewTopic ? ACTION_EXPAND : ACTION_UPDATE;
};

const ensureSession = (sessionId, { reset, newId } = {}) => {
  let effectiveId = sanitize(sessionId);
  if (reset && newId) {
    const sanitizedNewId = sanitize(newId);
    effectiveId = sanitizedNewId || randomUUID();
  } else if (reset || !effectiveId) {
    effectiveId = randomUUID();
  }

  if (!illustrationSessions.has(effectiveId) || reset) {
    illustrationSessions.set(effectiveId, {
      history: [],
      conversation: [],
      lastChildUtterance: "",
      lastAssistantReply: "",
      lastImage: null,
      lastUpdated: Date.now(),
    });
  }

  return { id: effectiveId, state: illustrationSessions.get(effectiveId) };
};

const buildIllustrationPrompt = ({
  history,
  latestPrompt,
  action,
  conversation = [],
}) => {
  const lines = [
    "You are NanoBanana, the Gemini illustration model for live children's storytelling.",
    "Illustrate in a kawaii, picture-book style with soft rounded characters, large expressive eyes, and pastel colors.",
    "Keep lines clean, shading simple, and make everything friendly, cozy, and safe for children aged 3-10.",
    "Ensure characters and props remain consistent between frames unless the story explicitly changes them.",
  ];

  if (history.length) {
    const recap = history
      .map((entry, idx) => ` (${idx + 1}) ${entry.prompt}`)
      .join(";");
    lines.push(
      `So far the story scene includes:${recap}. Respect those established details.`
    );
  }

  if (conversation.length) {
    const recentDialogue = conversation
      .slice(-3)
      .map(
        ({ child, assistant }, idx) =>
          `Turn ${
            idx + 1
          }: child said "${child}" and helper replied "${assistant}".`
      )
      .join(" ");
    lines.push(
      `Recent dialogue to incorporate: ${recentDialogue}. Use the helper's reply to guide the atmosphere and child's intent.`
    );
  }

  if (action === ACTION_EXPAND) {
    lines.push(
      "Expand the existing canvas to keep prior elements visible while adding new subjects."
    );
  } else {
    lines.push(
      "Update existing elements in place, refining colors, props, or expressions if needed."
    );
  }

  lines.push(
    `Focus for this update: ${latestPrompt}. Blend it into the ongoing scene in a playful way.`
  );
  lines.push(
    "Return an updated illustration that reflects the complete scene so far."
  );

  return lines.join("\n");
};

const generateImageWithGemini = async (prompt) => {
  try {
    const response = await ai.models.generateContent({
      model: "imagen-3",
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseModalities: [Modality.IMAGE],
      },
    });

    const candidates = response?.candidates || [];
    for (const candidate of candidates) {
      const parts = candidate?.content?.parts || [];
      for (const part of parts) {
        const data = part?.inlineData?.data;
        if (data) {
          const mime = part.inlineData.mimeType || "image/png";
          return `data:${mime};base64,${data}`;
        }
      }
    }
  } catch (err) {
    console.error("Gemini image generation error:", err);
  }

  return null;
};

async function callGeminiWithRetry(
  prompt,
  retries = 3,
  model = "gemini-2.5-flash-image"
) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync(
            "../frontend/public/gemini-native-image-" + index + ".png",
            buffer
          );
          console.log("Image generated");
        }
      }
      if (
        !fs.existsSync(
          "../frontend/public/gemini-native-image-" + index + ".png"
        )
      ) {
        fs.copyFileSync(
          "../frontend/public/blank.png",
          "../frontend/public/gemini-native-image-" + index + ".png"
        );
      }
      index++;
      return response.text;
    } catch (err) {
      if (err.error?.code === 429 && attempt < retries) {
        console.warn(`⚠️ Rate limit hit. Retrying in ${attempt * 5}s...`);
        await new Promise((res) => setTimeout(res, attempt * 5000));
        continue;
      }
      throw err;
    }
  }
}

app.get("/", (req, res) => {
  res.send("✅ Gemini API server is running!");
});

app.post("/api/converse", async (req, res) => {
  try {
    const { message, sessionId, resetSession = false } = req.body || {};
    if (!message) return res.status(400).json({ error: "Missing message" });

    const userId = userIdFromRequest(req);
    const requestedSessionId = sanitizeSessionId(sessionId);
    let sessionRecord = null;

    if (!resetSession && requestedSessionId) {
      const existing = await getSessionById(requestedSessionId);
      if (existing && existing.userId === userId) sessionRecord = existing;
    }

    if (!resetSession && !sessionRecord) {
      sessionRecord = await findActiveSessionForUser(userId);
    }

    if (sessionRecord) {
      try {
        const lastActivity = await getSessionLastActivity(
          sessionRecord.sessionId
        );
        if (
          lastActivity &&
          Date.now() - Number(lastActivity) >= SESSION_IDLE_TIMEOUT_MS
        ) {
          sessionRecord = null;
        }
      } catch (activityErr) {
        console.warn("Unable to determine session last activity", activityErr);
      }
    }

    if (!sessionRecord) {
      sessionRecord = await createSessionForUser(userId);
    }

    const activeSessionId = sessionRecord.sessionId;

    // Define the therapeutic system prompt
    const prompt = `
You are a virtual therapist and companion designed for children aged 3–13 years old who may have communication difficulties such as Autism Spectrum Disorder (ASD), Social (Pragmatic) Communication Disorder, or Expressive Language Disorder. 

Greeting rule: Only greet the child once at the beginning of a new session. After greeting, do not say “hello” or similar greetings again unless the child explicitly greets you. Continue the conversation naturally instead of restarting it.

Your role is to support speech development, emotional wellbeing, and safe interaction in a gentle, patient, and engaging manner. You should communicate at the child’s level with simple, warm, and encouraging language. Avoid meaningless interjections like “wow” or “oops,” and avoid sarcasm, idioms, or figurative expressions. Use direct, simple, and literal language with short, clear sentences to help understanding and compliance. Prioritize Core words and repeat them often (e.g., I, you, want, look, my turn, eat, hurt, where, I like, I don’t like, drink, bathroom, what, help, no, happy, mad, sad).

Core Functions:
(1) Intelligent Dialogue Continuation: Children’s speech may be fragmented, incomplete, or repetitive. Listen carefully for meaning and context. Reformulate their words into clear, complete sentences that model good communication without sounding critical. If a child says something unclear, you may gently confirm, clarify, or expand: e.g., if they say “dog park,” you can respond, “You want to go to the dog park?” Avoid repeating the same clarification question multiple times.
(2) Language Structuring & Guidance: Encourage turn-taking, descriptive language, and sentence building. If a child gives a short or partial response, add guiding prompts such as “Tell me more” or “What happens next?”
(3) Safety & Dangerous Behavior Alerts: If the child mentions something unsafe, respond calmly, tell them to stop, and reassure them.
(4) Progress Tracking with ICS – Intelligibility in Context Scale: Track internal understanding of how clear and complete the child’s speech is over time (not visible to the child). Use this internally to inform future responses.

Interaction Style: Speak in a kind, patient, playful tone appropriate for children. Adjust complexity by age:
- Ages 3–6: use very simple words and short phrases.
- Ages 7–10: encourage short stories and emotions.
- Ages 11–13: encourage reflection and problem-solving.

If the child is silent or speaks in fragments, repeat their words back gently in full sentences to model structure. Never rush the child. Avoid repeating greetings or long apologies. Keep responses spoken-friendly for text-to-speech output. 

Child said: "${message}"
LinguaGrow should reply:
`;

    // Use gemini-2.5-flash-lite for conversational response
    const text = await callGeminiWithRetry(prompt, 3, "gemini-2.5-flash-lite");
    console.log("Gemini →", text);

    const { state } = ensureSession(activeSessionId, {
      reset: resetSession,
      newId: activeSessionId,
    });

    state.lastChildUtterance = sanitize(message);
    state.lastAssistantReply = sanitize(text);
    state.conversation.push({
      child: state.lastChildUtterance,
      assistant: state.lastAssistantReply,
      timestamp: Date.now(),
    });
    if (state.conversation.length > 12) state.conversation.shift();
    state.lastUpdated = Date.now();

    try {
      await appendTranscriptTurn(
        activeSessionId,
        state.lastChildUtterance,
        state.lastAssistantReply
      );
    } catch (dbErr) {
      console.error("Failed to persist transcript turn", dbErr);
    }

    res.json({ reply: text, sessionId: activeSessionId, userId });
  } catch (err) {
    console.error("❌ Gemini API error:", err);
    res.status(500).json({ error: "Failed to get Gemini reply" });
  }
});

app.get("/api/data/users", async (req, res) => {
  try {
    const rawUsers = await listUsers();
    const users = await Promise.all(
      rawUsers.map(async (user) => {
        const progress = await getUserProgress(user.userId);
        const createdAtIso = new Date(user.createdAt).toISOString();
        const updatedAtIso = new Date(user.updatedAt).toISOString();
        return {
          userId: user.userId,
          createdAt: user.createdAt,
          createdAtIso,
          updatedAt: user.updatedAt,
          updatedAtIso,
          sessionCount: progress.sessions.length,
          activeSessions: progress.sessions
            .filter((session) => session.active)
            .map((session) => session.sessionId),
        };
      })
    );

    res.json({ users });
  } catch (err) {
    console.error("Failed to list users", err);
    res.status(500).json({ error: "Failed to list users" });
  }
});

app.get("/api/data/users/:userId", async (req, res) => {
  try {
    const userId = sanitizeUserId(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Invalid userId" });

    const userRecord = await getUserRecord(userId);
    if (!userRecord) return res.status(404).json({ error: "User not found" });

    const [profile, snapshots, progress] = await Promise.all([
      getUserProfile(userId),
      getProgressSnapshots(userId),
      getUserProgress(userId),
    ]);

    const sessions = await Promise.all(
      progress.sessions.map(async (session) => {
        const transcript = await getTranscriptForSession(session.sessionId);
        return {
          sessionId: session.sessionId,
          createdAt: session.createdAt,
          createdAtIso: session.createdAtIso,
          active: session.active,
          turnCount: session.turnCount,
          transcript: transcript
            ? {
                session: transcript.session,
                turns: transcript.turns,
                messages: transcript.messages,
              }
            : null,
        };
      })
    );

    res.json({
      user: {
        userId: userRecord.userId,
        createdAt: userRecord.createdAt,
        createdAtIso: new Date(userRecord.createdAt).toISOString(),
        updatedAt: userRecord.updatedAt,
        updatedAtIso: new Date(userRecord.updatedAt).toISOString(),
      },
      profile,
      sessions,
      progressSnapshots: snapshots,
    });
  } catch (err) {
    console.error("Failed to fetch user data", err);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
});

app.get("/api/data/sessions/:sessionId", async (req, res) => {
  try {
    const sessionId = sanitizeSessionId(req.params.sessionId);
    if (!sessionId) return res.status(400).json({ error: "Invalid sessionId" });

    const transcript = await getTranscriptForSession(sessionId);
    if (!transcript)
      return res.status(404).json({ error: "Session not found" });

    res.json(transcript);
  } catch (err) {
    console.error("Failed to fetch session transcript", err);
    res.status(500).json({ error: "Failed to fetch session transcript" });
  }
});

app.post("/api/illustrate", async (req, res) => {
  try {
    const {
      prompt,
      sessionId,
      action = "auto",
      reset = false,
    } = req.body || {};

    const cleanedPrompt = sanitize(prompt);
    if (!cleanedPrompt)
      return res.status(400).json({ error: "Missing prompt" });

    const { id: effectiveId, state } = ensureSession(sessionId, { reset });
    const resolvedAction = resolveAction(state.history, cleanedPrompt, action);

    const composedPrompt = buildIllustrationPrompt({
      history: state.history,
      latestPrompt: cleanedPrompt,
      action: resolvedAction,
    });

    let serviceImage = await generateImageWithGemini(composedPrompt);

    const historyPreview = [
      ...state.history.map(({ prompt: p }) => p),
      cleanedPrompt,
    ]
      .map((entry, idx) => `${idx + 1}. ${entry}`)
      .join(" | ");

    const responseImage =
      serviceImage ||
      (() => {
        const safeText = historyPreview
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

        const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'>
  <rect width='100%' height='100%' fill='#f8f9fa'/>
  <foreignObject x='5%' y='10%' width='90%' height='80%'>
    <div xmlns='http://www.w3.org/1999/xhtml' style='font-family: Verdana,Arial; font-size: 16px; color: #333;'>
      <strong>Storyboard so far:</strong><br/>${safeText}
    </div>
  </foreignObject>
</svg>`;

        return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      })();

    state.history.push({
      prompt: cleanedPrompt,
      action: resolvedAction,
      timestamp: Date.now(),
    });
    state.lastImage = responseImage;
    state.lastUpdated = Date.now();

    res.json({
      image: responseImage,
      sessionId: effectiveId,
      action: resolvedAction,
      history: state.history,
      usedService: Boolean(serviceImage),
    });
  } catch (err) {
    console.error("Illustrate error:", err);
    res.status(500).json({ error: "Failed to generate illustration" });
  }
});

app.post("/api/tts", async (req, res) => {
  try {
    const text = (req.body?.text || "").trim();
    const voiceId = process.env.ELEVENLABS_VOICE_ID;

    if (!text) return res.status(400).json({ error: "Missing text" });
    if (!voiceId) return res.status(400).json({ error: "Missing voice ID" });

    const response = await elevenlabs.textToSpeech.convert(voiceId, {
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.8,
      },
      output_format: "mp3_44100_128",
    });

    const chunks = [];
    for await (const chunk of response) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    res.setHeader("Content-Type", "audio/mpeg");
    res.send(buffer);
  } catch (err) {
    console.error("TTS Error:", err);
    res.status(500).json({ error: "TTS failed" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>
  console.log(`🚀 Server ready on http://localhost:${PORT}`)
);
