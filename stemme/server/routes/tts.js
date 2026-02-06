import { Router } from "express";
import { ElevenLabsClient } from "elevenlabs";

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

const router = Router();

router.post("/", async (req, res) => {
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

export default router;
