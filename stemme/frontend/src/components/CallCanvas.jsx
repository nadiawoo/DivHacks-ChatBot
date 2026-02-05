import { useRef, useState } from "react";
import { API_BASE_URL } from "../apiBase";
import { playVoiceFromText } from "../utils/tts";
import streamBotCaption from "../utils/streamBotCaption";
import { useStory } from "../context/StoryContext";
import { useToast } from "../context/ToastContext";
import useSpeechRecognition from "../hooks/useSpeechRecognition";
import CaptionOverlay from "./CaptionOverlay";
import Controls from "./Controls";

const BOT_VIDEO_SRC = "";

export default function CallCanvas({ onUserSpeech }) {
  const [botCaption, setBotCaption] = useState({ text: "", final: false });
  const [botSpeaking, setBotSpeaking] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [sessionInfo, setSessionInfo] = useState({
    sessionId: null,
    userId: null,
  });

  const { addItem } = useStory();
  const addItemRef = useRef(addItem);
  addItemRef.current = addItem;

  const { addToast } = useToast();

  async function getBotReply(text) {
    try {
      setThinking(true);
      const payload = { message: text };
      if (sessionInfo.sessionId) payload.sessionId = sessionInfo.sessionId;

      const res = await fetch(`${API_BASE_URL}/api/converse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.sessionId || data.userId) {
        setSessionInfo((prev) => ({
          sessionId: data.sessionId ?? prev.sessionId,
          userId: data.userId ?? prev.userId,
        }));
      }

      const reply = (data.reply || "").trim();
      if (reply) playVoiceFromText(reply);
      return reply;
    } catch (err) {
      console.error("API error:", err);
      return "Sorry, I am having trouble connecting to the server.";
    } finally {
      setThinking(false);
    }
  }

  const { listening, supported, toggleListening } = useSpeechRecognition({
    onSentence(text) {
      getBotReply(text).then((reply) => {
        streamBotCaption(reply, setBotCaption, setBotSpeaking, () => {
          addItemRef.current({ prompt: reply });
        });
      });
    },
    onNewWords(words) {
      onUserSpeech?.(words);
    },
    onError(error) {
      addToast("Speech recognition error: " + error, "error");
    },
  });

  const handleMicToggle = () => {
    if (!supported) {
      addToast(
        "Speech recognition is not supported in this browser. Use Chrome desktop.",
        "error"
      );
      return;
    }
    toggleListening();
  };

  return (
    <div className="call-canvas">
      <div className="bot-tile">
        {BOT_VIDEO_SRC ? (
          <video
            className="bot-video"
            src={BOT_VIDEO_SRC}
            autoPlay
            loop
            muted
            playsInline
          />
        ) : (
          <div className="bot-fallback">
            <img
              src="/treebot-1.png"
              alt="TreeBot Avatar"
              className="bot-avatar"
              style={{ width: "250px", height: "auto" }}
            />
          </div>
        )}
        <CaptionOverlay
          text={botCaption.text}
          role="bot"
          speaking={botSpeaking}
        />
        {thinking && (
          <div className="thinking-indicator">
            <span className="thinking-dot" />
            <span className="thinking-dot" />
            <span className="thinking-dot" />
          </div>
        )}
      </div>

      <Controls listening={listening} onMicToggle={handleMicToggle} />
    </div>
  );
}
