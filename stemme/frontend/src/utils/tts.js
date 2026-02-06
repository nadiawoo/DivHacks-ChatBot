import { API_BASE_URL } from "../apiBase";

export async function playVoiceFromText(text) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error("TTS request failed");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    const audio = new Audio(url);
    audio.play();

    audio.onended = () => URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Error playing voice:", err);
  }
}
