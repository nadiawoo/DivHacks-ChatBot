export async function playVoiceFromText(text) {
  try {
    const response = await fetch("http://localhost:3001/api/tts", {
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

    // Optional: auto-clean the URL after playback
    audio.onended = () => URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Error playing voice:", err);
  }
}
