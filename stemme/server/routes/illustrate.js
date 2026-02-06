import { Router } from "express";
import { generateImageWithGemini } from "../lib/gemini.js";
import {
  ensureSession,
  resolveAction,
  buildIllustrationPrompt,
  sanitize,
} from "../lib/illustration.js";

const router = Router();

router.post("/", async (req, res) => {
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
    const resolvedAction = resolveAction(
      state.history,
      cleanedPrompt,
      action
    );

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

export default router;
