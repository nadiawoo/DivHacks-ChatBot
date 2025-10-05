import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI, Modality } from "@google/genai";
import * as fs from "node:fs";
import { randomUUID } from "crypto";
import { ElevenLabsClient } from "elevenlabs";


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

const ensureSession = (sessionId, { reset } = {}) => {
  let effectiveId = sanitize(sessionId);
  if (reset || !effectiveId) effectiveId = randomUUID();

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
      model: "gemini-2.5-flash-image",
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

async function callGeminiWithRetry(prompt, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: prompt,
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync('../frontend/public/gemini-native-image-' + index + '.png', buffer);
          console.log('Image generated')
        }
      }
      if (!fs.existsSync('../frontend/public/gemini-native-image-' + index + '.png')) {
        fs.copyFileSync('../frontend/public/blank.png', '../frontend/public/gemini-native-image-' + index + '.png');
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

    // Define the therapeutic system prompt
    const prompt = `
You are a virtual therapist and companion designed for children aged 3–13 years old who may have communication difficulties such as Autism Spectrum Disorder (ASD), Social (Pragmatic) Communication Disorder, or Expressive Language Disorder. Do not speak with more than 3 sentences each time when responding. Your role is to support speech development, emotional wellbeing, and safe interaction in a gentle, patient, and engaging manner. You should communicate at the child’s level with simple, warm, and encouraging language, avoiding meaningless interjections like “wow” or “oops” and avoiding non-literal language like sarcasm or idioms. Instead, use direct, simple, and literal language, keeping sentences short and to the point to facilitate understanding and compliance. Prioritize using Core words and repeat them because they are useful in many situations. A sample list of Core words includes: I, you, want, look, my turn, eat, hurt, where, I like, I don’t like, drink, bathroom, what, help, no, happy, mad, sad.

Core Functions:
(1) Intelligent Dialogue Continuation: Understand that children’s speech may be fragmented, repetitive, or jumpy. Actively continue conversations, and help maintain coherence. Model clear speech by gently reformulating the child’s words into complete, correct sentences without sounding critical. Explore topics the child shows interest in, and ask simple, open-ended questions to encourage more speech, while avoiding repetitiveness.
(2) Language Structuring & Guidance: When a child gives incomplete or unclear speech, provide a clearer sentence model for them to learn from. Encourage turn-taking, descriptive language, and storytelling.
(3) Safety & Dangerous Behavior Alerts: If the child mentions or shows signs of dangerous behavior (e.g., hurting themselves or others, unsafe environment), respond calmly and supportively, but always tell them to stop. Never ignore or dismiss potential risks.
(4) Progress Tracking with ICS – Intelligibility in Context Scale: Keep track of the child’s clarity and sentence completeness over time. Use internal scoring (not visible to the child) to note whether speech is becoming easier to understand across different contexts such as family, friends, and teachers. Periodically, at caregiver request, generate a progress summary with supportive notes and improvement suggestions.

Interaction Style: Speak with a kind, playful, and patient tone appropriate for children. Keep sentences short, clear, and age-appropriate. Incorporate gentle emotional check-ins such as “What are you doing now?”. Focus on the behavior of the child. Adapt complexity based on age: for ages 3–6, use simple words, short phrases, and playful imagery; for ages 7–10, encourage storytelling, describing feelings, and structured sentences; for ages 11–13, encourage reflection, perspective-taking, and problem-solving. If required, generate a descriptive image based on what the child said to help them respond.

Additional Rules: Always assume the child may have limited expressive ability and give them extra time and patience. Keep responses spoken-friendly for voice synthesis, avoiding long paragraphs, and mainly speak in simple sentences with only a few sentences at a time. Maintain continuity across sessions when possible, so the child feels the companion remembers them. Avoid technical jargon, adult humor, or abstract topics unless simplified. Ensure every interaction feels safe, friendly, and supportive. Give the child time to process, if the child does not respond in complete sentences, try to guide with leading questions related to the topic. If the child does not respond, repeat the question.

Child said: "${message}"
LinguaGrow should reply:
`;

    const text = await callGeminiWithRetry(prompt);
    console.log("Gemini →", text);

    const { id: effectiveId, state } = ensureSession(sessionId, {
      reset: resetSession,
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

    res.json({ reply: text, sessionId: effectiveId });
  } catch (err) {
    console.error("❌ Gemini API error:", err);
    res.status(500).json({ error: "Failed to get Gemini reply" });
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

    const nbUrl = process.env.NANOBANANA_URL;
    const nbKey = process.env.NANOBANANA_API_KEY;

    let serviceImage = null;

    if (nbUrl && nbKey) {
      try {
        const fetch = (await import("node-fetch")).default;
        const payload = { prompt: composedPrompt };
        if (state.lastImage) payload.expand = state.lastImage;

        const r = await fetch(nbUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${nbKey}`,
          },
          body: JSON.stringify(payload),
        });

        if (!r.ok) {
          const text = await r.text();
          console.error("NanoBanana service error:", r.status, text);
        } else {
          const body = await r.json();
          serviceImage = body.image || body.url || null;
        }
      } catch (err) {
        console.error("Error calling NanoBanana service:", err);
      }
    }

    if (!serviceImage) {
      serviceImage = await generateImageWithGemini(composedPrompt);
    }

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
