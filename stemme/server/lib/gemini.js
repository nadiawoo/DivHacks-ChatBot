import { GoogleGenAI, Modality } from "@google/genai";
import * as fs from "node:fs";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const CONVERSE_MODEL =
  process.env.GEMINI_CONVERSE_MODEL || "gemini-2.5-flash-lite";
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "imagen-3";

let imageIndex = 0;

export async function callGeminiWithRetry(prompt, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: CONVERSE_MODEL,
        contents: prompt,
      });
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          console.log(part.text);
        } else if (part.inlineData) {
          const imageData = part.inlineData.data;
          const buffer = Buffer.from(imageData, "base64");
          fs.writeFileSync(
            "../frontend/public/gemini-native-image-" + imageIndex + ".png",
            buffer
          );
          console.log("Image generated");
        }
      }
      if (
        !fs.existsSync(
          "../frontend/public/gemini-native-image-" + imageIndex + ".png"
        )
      ) {
        fs.copyFileSync(
          "../frontend/public/blank.png",
          "../frontend/public/gemini-native-image-" + imageIndex + ".png"
        );
      }
      imageIndex++;
      return response.text;
    } catch (err) {
      if (err.error?.code === 429 && attempt < retries) {
        console.warn(`Rate limit hit. Retrying in ${attempt * 5}s...`);
        await new Promise((res) => setTimeout(res, attempt * 5000));
        continue;
      }
      throw err;
    }
  }
}

export async function generateImageWithGemini(prompt) {
  try {
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: [Modality.IMAGE] },
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
}
