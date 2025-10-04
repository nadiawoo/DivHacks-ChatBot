import { useEffect, useMemo, useRef, useState } from "react";
import "./facetime.css";

// --- CONFIG STUBS (wire later to real services) ---
const BOT_VIDEO_SRC = ""; // e.g., "/bot.mp4" if you drop a loop into public/

export default function App() {
  return (
    <div className="app">
      <Header />
      <MainArea />
    </div>
  );
}

function Header() {
  return (
    <header className="app-header">
      <div className="brand">LinguaGrow</div>
      <div className="sub">Real-time speech companion</div>
    </header>
  );
}

function MainArea() {
  return (
    <div className="main">
      <CallCanvas />
      <StoryPanel />
    </div>
  );
}

/** CallCanvas holds the FaceTime-style layout */
function CallCanvas() {
  const userVideoRef = useRef(null);
  const [userStreamError, setUserStreamError] = useState("");

  // Captions
  const [userCaption, setUserCaption] = useState({ text: "", final: false });
  const [botCaption, setBotCaption] = useState({ text: "", final: false });

  // Speech recognition state
  const [listening, setListening] = useState(false);
  const recognizerRef = useRef(null);

  // Bot speaking state (browser TTS for now)
  const [botSpeaking, setBotSpeaking] = useState(false);

  // Right panel event hook
  const pushStoryItemRef = useRef(null); // StoryPanel injects a setter

  // Camera: user PIP video
  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false, // audio taken by SpeechRecognition instead
        });
        if (userVideoRef.current) userVideoRef.current.srcObject = stream;
      } catch (e) {
        setUserStreamError(e?.message || String(e));
      }
    })();
    return () => {
      if (userVideoRef.current?.srcObject) {
        for (const t of userVideoRef.current.srcObject.getTracks()) t.stop();
      }
    };
  }, []);

  // Inject hook for StoryPanel to register its adder
  const registerStoryAdder = (fn) => (pushStoryItemRef.current = fn);

  // --- Speech Recognition (user) with interim results ---
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const r = new SR();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = true;

    r.onresult = (evt) => {
      let interim = "";
      let final = "";
      for (const res of evt.results) {
        const t = res[0].transcript;
        if (res.isFinal) final += t + " ";
        else interim += t + " ";
      }
      const text = (final || interim).trim();
      setUserCaption({ text, final: !!final });

      // When a final user utterance arrives, produce a bot reply
      if (final.trim()) {
        const reply = naiveRephrase(final.trim());
        streamBotCaption(reply, setBotCaption, setBotSpeaking, () => {
          // when bot finishes, push a story tile
          pushStoryItemRef.current?.({
            prompt: reply,
            // image: to be filled later when Nano-Banana connected
          });
        });
      }
    };

    r.onerror = (event) => {
      console.error("SpeechRecognition error:", event.error);
      alert("Speech recognition error: " + event.error);
      setListening(false);
    };

    r.onend = (event) => {
      console.warn("SpeechRecognition ended:", event);
      setListening(false);
    };
    recognizerRef.current = r;

    return () => {
      try {
        r.abort();
      } catch {}
    };
  }, []);

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
            <div className="bot-avatar" aria-label="Bot avatar" />
          </div>
        )}
        <CaptionOverlay
          text={botCaption.text}
          role="bot"
          speaking={botSpeaking}
        />
      </div>

      <div className="pip-tile">
        <video
          ref={userVideoRef}
          className="pip-video"
          autoPlay
          muted
          playsInline
        />
        <CaptionOverlay text={userCaption.text} role="user" />
        {userStreamError && <div className="error">{userStreamError}</div>}
      </div>

      <Controls listening={listening} onMicToggle={toggleListening} />
      <StoryPanelBridge register={registerStoryAdder} />
    </div>
  );
}

/** Caption overlay for bot/user */
function CaptionOverlay({ text, role, speaking }) {
  const empty = !text?.trim();
  return (
    <div className={`caption ${role}`}>
      {empty ? <span className="ghost"> </span> : <span>{text}</span>}
      {speaking ? <span className="cursor">▌</span> : null}
    </div>
  );
}

/** Simple controls bar */
function Controls({ listening, onMicToggle }) {
  return (
    <div className="controls">
      <button
        className={`btn ${listening ? "active" : ""}`}
        onClick={onMicToggle}
      >
        {listening ? "Stop Mic" : "Start Mic"}
      </button>
    </div>
  );
}

/** Right side story panel */
function StoryPanel() {
  const [items, setItems] = useState([]);
  // expose an adder to CallCanvas via a global
  useEffect(() => {
    window.__addStoryItem = (item) =>
      setItems((prev) => [{ id: Date.now(), ...item }, ...prev]);
    return () => {
      window.__addStoryItem = null;
    };
  }, []);

  return (
    <aside className="story">
      <div className="story-header">Story Panel</div>
      <div className="story-sub">
        Images and prompts build a visual timeline of the conversation.
      </div>
      <ul className="story-list">
        {items.map((it) => (
          <li key={it.id} className="story-card">
            <div className="story-image placeholder" />
            <div className="story-text">{it.prompt}</div>
          </li>
        ))}
        {!items.length && (
          <div className="story-empty">
            As you speak, we will add moments here.
          </div>
        )}
      </ul>
    </aside>
  );
}

/** Bridge lets CallCanvas register a function to push tiles into StoryPanel */
function StoryPanelBridge({ register }) {
  useEffect(() => {
    register((item) => window.__addStoryItem?.(item));
  }, [register]);
  return null;
}

// --- Minimal naive rephrase used until your ML is wired ---
function naiveRephrase(input) {
  const s = input.trim();
  if (!s) return "";
  if (/park/i.test(s)) return "You want to play in the park, right?";
  if (/zoo/i.test(s)) return "You are going to the zoo, right?";
  if (/ice cream/i.test(s)) return "What flavor of ice cream would you like?";
  return s.endsWith("?") ? s : s + " ?";
}

// --- Stream bot caption word by word and speak it ---
function streamBotCaption(text, setBotCaption, setBotSpeaking, onDone) {
  const words = text.split(/\s+/);
  let i = 0;
  setBotSpeaking(true);
  const synth = window.speechSynthesis;

  // Build up the caption gradually
  const interval = setInterval(() => {
    i++;
    setBotCaption({
      text: words.slice(0, i).join(" "),
      final: i === words.length,
    });
    if (i >= words.length) {
      clearInterval(interval);
      // Speak full line once caption finished
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.95;
      u.onend = () => {
        setBotSpeaking(false);
        onDone?.();
      };
      try {
        synth.cancel();
      } catch {}
      synth.speak(u);
    }
  }, 80); // token streaming speed
}
