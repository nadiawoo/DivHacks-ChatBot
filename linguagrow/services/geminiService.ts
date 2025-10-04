
import { GoogleGenAI } from "@google/genai";

if (!process.env.API_KEY) {
  console.warn("API_KEY environment variable not set. Guardian Mode will be required.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

const REPHRASE_PROMPT_TEMPLATE = `
You are a friendly and encouraging AI speech companion helping children aged 5-13 form full sentences.
Rewrite the child's utterance clearly and kindly. Keep it encouraging and brief.
The response should only contain the rephrased sentence, without any preamble.

Examples:
Input: "Park, I, tomorrow, play"
Output: "You want to play in the park tomorrow, that sounds fun!"

Input: "I saw a bird, I want ice cream"
Output: "You saw a bird! After that, would you like some ice cream?"

Input: "I go zoo tomorrow"
Output: "Are you excited to go to the zoo tomorrow?"

Input: "dog run fast"
Output: "Yes, the dog is running very fast!"

Input: "{TEXT}"
Output:
`;


export const rephraseText = async (text: string): Promise<string> => {
  if (!process.env.API_KEY) {
    throw new Error("Gemini API key is not configured.");
  }
  
  const prompt = REPHRASE_PROMPT_TEMPLATE.replace('{TEXT}', text);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
          // Disable thinking for faster, more direct responses appropriate for a child's companion.
          thinkingConfig: { thinkingBudget: 0 }
      }
    });

    const rephrased = response.text.trim();
    if (!rephrased) {
        throw new Error("Received an empty response from the API.");
    }
    return rephrased;
  } catch (error) {
    console.error("Error calling Gemini API for rephrasing:", error);
    throw new Error("Failed to rephrase text.");
  }
};

export const generateImage = async (prompt: string): Promise<string> => {
  if (!process.env.API_KEY) {
    throw new Error("Gemini API key is not configured.");
  }

  const imagePrompt = `A simple, friendly, and colorful cartoon illustration for a child, showing: ${prompt}. Use a clean style with soft edges and a happy tone.`;
  
  try {
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: imagePrompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/png',
        aspectRatio: '1:1',
      },
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
      const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
      return `data:image/png;base64,${base64ImageBytes}`;
    } else {
      throw new Error("No image was generated.");
    }
  } catch (error) {
    console.error("Error calling Gemini API for image generation:", error);
    throw new Error("Failed to generate image.");
  }
};
