import { useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "../apiBase";
import { playVoiceFromText } from "../utils/tts";
import streamBotCaption from "../utils/streamBotCaption";
import { useStory } from "../context/StoryContext";
import CaptionOverlay from "./CaptionOverlay";
import Controls from "./Controls";

const BOT_VIDEO_SRC = "";

export default function CallCanvas({ onUserSpeech }) {
  const [_userCaption, setUserCaption] = useState({ text: "", final: false });
  const [botCaption, setBotCaption] = useState({ text: "", final: false });
  const [listening, setListening] = useState(false);
  const recognizerRef = useRef(null);
  const lastFinalRef = useRef("");
  const [botSpeaking, setBotSpeaking] = useState(false);

  const [sessionInfo, setSessionInfo] = useState({
    sessionId: null,
    userId: null,
  });

  const { addItem } = useStory();
  const addItemRef = useRef(addItem);
  addItemRef.current = addItem;

  async function getBotReply(text) {
    try {
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
    }
  }

  // --- Speech Recognition ---
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const r = new SR();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = true;

    let sentenceBuffer = "";
    let sendTimeout;

    function sendFullSentence() {
      if (!sentenceBuffer.trim()) return;
      const fullSentence = sentenceBuffer.trim();
      sentenceBuffer = "";
      lastFinalRef.current = "";

      getBotReply(fullSentence).then((reply) => {
        streamBotCaption(reply, setBotCaption, setBotSpeaking, () => {
          addItemRef.current({ prompt: reply });
        });
      });
    }

    r.onresult = (evt) => {
      let interim = "";
      let final = "";
      for (const res of evt.results) {
        const t = res[0].transcript;
        if (res.isFinal) final += t + " ";
        else interim += t + " ";
      }

      const combinedFinal = final.trim();
      const text = (combinedFinal || interim).trim();
      setUserCaption({ text, final: !!combinedFinal });

      if (combinedFinal) {
        const previous = lastFinalRef.current;
        let incremental = combinedFinal;
        if (previous && combinedFinal.startsWith(previous)) {
          incremental = combinedFinal.slice(previous.length).trim();
        }

        if (incremental) {
          sentenceBuffer += " " + incremental;
          onUserSpeech?.(incremental);
        }

        lastFinalRef.current = combinedFinal;

        if (/[.?!]$/.test(combinedFinal)) {
          sendFullSentence();
        } else {
          clearTimeout(sendTimeout);
          sendTimeout = setTimeout(sendFullSentence, 2000);
        }
      }
    };

    r.onerror = (event) => {
      console.error("SpeechRecognition error:", event.error);
      alert("Speech recognition error: " + event.error);
      setListening(false);
      sentenceBuffer = "";
      lastFinalRef.current = "";
    };

    r.onend = () => {
      setListening(false);
      sentenceBuffer = "";
      lastFinalRef.current = "";
    };

    recognizerRef.current = r;

    return () => {
      try {
        r.abort();
      } catch { /* ignore */ }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleListening = () => {
    const r = recognizerRef.current;
    if (!r) {
      alert(
        "SpeechRecognition not supported in this browser. Use Chrome desktop."
      );
      return;
    }
    if (listening) {
      r.stop();
      setListening(false);
    } else {
      setUserCaption({ text: "", final: false });
      lastFinalRef.current = "";
      r.start();
      setListening(true);
    }
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
      </div>

      <Controls listening={listening} onMicToggle={toggleListening} />
    </div>
  );
}
