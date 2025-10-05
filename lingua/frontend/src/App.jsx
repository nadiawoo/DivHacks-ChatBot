import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import "./facetime.css";
import { playVoiceFromText } from "./utils/tts";

// --- CONFIG STUBS (wire later to real services) ---
const BOT_VIDEO_SRC = ""; // e.g., "/bot.mp4" if you drop a loop into public/

const PROGRESS_STORAGE_KEY = "lingua-progress-words";
const NAME_STORAGE_KEY = "lingua-profile-name";
const GROWTH_GOAL = 400; // words spoken to reach full tree

const PLANT_LEVELS = [
  { min: 0, label: "Sprout", stem: 38, canopy: 16, leaves: 1 },
  { min: 80, label: "Sapling", stem: 60, canopy: 24, leaves: 2 },
  { min: 160, label: "Young Tree", stem: 90, canopy: 30, leaves: 3 },
  { min: 260, label: "Blooming Tree", stem: 120, canopy: 38, leaves: 4 },
  { min: 360, label: "Towering Tree", stem: 150, canopy: 48, leaves: 5 },
];

export default function App() {
  const [profileOpen, setProfileOpen] = useState(false);
  const [totalWords, setTotalWords] = useState(() => {
    if (typeof window === "undefined") return 0;
    const stored = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    return stored ? Number(stored) || 0 : 0;
  });
  const [profileName, setProfileName] = useState(() => {
    if (typeof window === "undefined") return "Your Name";
    return window.localStorage.getItem(NAME_STORAGE_KEY)?.trim() || "Your Name";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, String(totalWords));
  }, [totalWords]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(NAME_STORAGE_KEY, profileName);
  }, [profileName]);

  const handleUserSpeech = (transcript) => {
    const count = countWords(transcript);
    if (!count) return;
    setTotalWords((prev) => prev + count);
  };

  return (
    <div className="app">
      <Header
        onProfileClick={() => setProfileOpen(true)}
        profileOpen={profileOpen}
      />
      <MainArea onUserSpeech={handleUserSpeech} />
      {profileOpen && (
        <ProfileModal
          name={profileName}
          onNameChange={setProfileName}
          onClose={() => setProfileOpen(false)}
          totalWords={totalWords}
        />
      )}
    </div>
  );
}

function Header({ onProfileClick, profileOpen }) {
  return (
    <header className="app-header">
      <div className="header-text">
        <div className="brand">Lingua</div>
        <div className="sub">Real-time speech companion</div>
      </div>
      <button
        className="profile-btn"
        onClick={onProfileClick}
        aria-haspopup="dialog"
        aria-expanded={profileOpen}
      >
        Profile
      </button>
    </header>
  );
}

function MainArea({ onUserSpeech }) {
  return (
    <div className="main">
      <CallCanvas onUserSpeech={onUserSpeech} />
      <StoryPanel />
    </div>
  );
}

/** CallCanvas holds the FaceTime-style layout */
function CallCanvas({ onUserSpeech }) {
  // Captions
  const [userCaption, setUserCaption] = useState({ text: "", final: false });
  const [botCaption, setBotCaption] = useState({ text: "", final: false });

  // Speech recognition state
  const [listening, setListening] = useState(false);
  const recognizerRef = useRef(null);
  const lastFinalRef = useRef("");

  // Bot speaking state (browser TTS for now)
  const [botSpeaking, setBotSpeaking] = useState(false);

  // Conversation session info persisted between turns
  const [sessionInfo, setSessionInfo] = useState({
    sessionId: null,
    userId: null,
  });

  // Right panel event hook
  const pushStoryItemRef = useRef(null); // StoryPanel injects a setter

  // Inject hook for StoryPanel to register its adder
  const registerStoryAdder = (fn) => (pushStoryItemRef.current = fn);

  // Async helper to get bot reply from backend
  async function getBotReply(text) {
    try {
      const payload = { message: text };
      if (sessionInfo.sessionId) payload.sessionId = sessionInfo.sessionId;

      const res = await fetch("http://localhost:3001/api/converse", {
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

  // --- Speech Recognition (user) with interim results ---
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
      console.log("📤 Sending full sentence:", fullSentence);

      getBotReply(fullSentence).then((reply) => {
        streamBotCaption(reply, setBotCaption, setBotSpeaking, () => {
          pushStoryItemRef.current?.({
            prompt: reply,
          });
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

        // If user ends with punctuation, send immediately
        if (/[.?!]$/.test(combinedFinal)) {
          sendFullSentence();
        } else {
          // Otherwise wait 2s after last final result before sending
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

    r.onend = (event) => {
      console.warn("SpeechRecognition ended:", event);
      setListening(false);
      sentenceBuffer = "";
      lastFinalRef.current = "";
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

      {/* User video tile removed */}

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

function ProfileModal({ onClose, totalWords, name, onNameChange }) {
  const [draftName, setDraftName] = useState(name);

  useEffect(() => {
    setDraftName(name);
  }, [name]);

  const stageIndex = useMemo(() => {
    let idx = 0;
    for (let i = 0; i < PLANT_LEVELS.length; i++) {
      if (totalWords >= PLANT_LEVELS[i].min) idx = i;
    }
    return idx;
  }, [totalWords]);

  const stage = PLANT_LEVELS[stageIndex];
  const progressPercent = Math.min((totalWords / GROWTH_GOAL) * 100, 100);
  const wordsRemaining = Math.max(GROWTH_GOAL - totalWords, 0);

  const handleNameCommit = () => {
    const trimmed = draftName.trim();
    onNameChange(trimmed || "Your Name");
  };

  const handleClose = () => {
    handleNameCommit();
    onClose();
  };

  return (
    <div
      className="profile-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Profile"
    >
      <div className="profile-panel">
        <button
          className="profile-close"
          onClick={handleClose}
          aria-label="Close profile"
        >
          X
        </button>
        <div className="profile-identity">
          <CartoonAnimal />
          <div className="profile-meta">
            <input
              className="profile-name-input"
              value={draftName}
              onChange={(evt) => setDraftName(evt.target.value)}
              onBlur={handleNameCommit}
              onKeyDown={(evt) => {
                if (evt.key === "Enter") {
                  evt.preventDefault();
                  handleNameCommit();
                }
              }}
              aria-label="Profile name"
            />
            <div className="profile-subtitle">{stage.label}</div>
          </div>
        </div>
        <div className="profile-progress">
          <PlantGrowth stageIndex={stageIndex} percent={progressPercent} />
          <div className="progress-stats">
            <div className="progress-primary">{totalWords} words spoken</div>
            <div className="progress-secondary">
              {wordsRemaining > 0
                ? `${wordsRemaining} words until your ${
                    PLANT_LEVELS[PLANT_LEVELS.length - 1].label
                  }.`
                : "Your tree is fully grown! Keep chatting to keep it thriving."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CartoonAnimal() {
  return (
    <svg
      className="profile-avatar"
      viewBox="0 0 120 120"
      role="img"
      aria-label="Cartoon fox avatar"
    >
      <defs>
        <linearGradient id="foxFur" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#f7b267" />
          <stop offset="50%" stopColor="#f79d65" />
          <stop offset="100%" stopColor="#f4845f" />
        </linearGradient>
      </defs>
      <circle
        cx="60"
        cy="60"
        r="54"
        fill="url(#foxFur)"
        stroke="#e26b4c"
        strokeWidth="4"
      />
      <path
        d="M22 42 L40 18 L52 40"
        fill="#fcd9ad"
        stroke="#e26b4c"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M98 42 L80 18 L68 40"
        fill="#fcd9ad"
        stroke="#e26b4c"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="45" cy="60" r="7" fill="#1f2d3d" />
      <circle cx="75" cy="60" r="7" fill="#1f2d3d" />
      <path
        d="M60 70 Q63 78 70 80"
        stroke="#1f2d3d"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M55 90 Q60 96 65 90"
        stroke="#1f2d3d"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <circle
        cx="60"
        cy="72"
        r="5"
        fill="#fcd9ad"
        stroke="#e26b4c"
        strokeWidth="2"
      />
      <path
        d="M40 86 L30 90"
        stroke="#1f2d3d"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M80 86 L90 90"
        stroke="#1f2d3d"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PlantGrowth({ stageIndex, percent }) {
  const stage = PLANT_LEVELS[stageIndex];
  const baseY = 168;
  const stemTop = baseY - stage.stem;
  const leafSlots = Array.from({ length: stage.leaves });

  return (
    <div className="plant-wrapper">
      <svg
        className="plant-graphic"
        viewBox="0 0 160 200"
        role="img"
        aria-label={`Plant growth stage: ${stage.label}`}
      >
        <defs>
          <linearGradient id="leafGradient" x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#8cd790" />
            <stop offset="100%" stopColor="#4f9d69" />
          </linearGradient>
          <linearGradient id="potGradient" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#a9745b" />
            <stop offset="100%" stopColor="#8b5a44" />
          </linearGradient>
        </defs>
        <rect
          x="54"
          y="168"
          width="52"
          height="22"
          fill="url(#potGradient)"
          rx="8"
        />
        <rect x="48" y="160" width="64" height="12" fill="#b8836d" rx="6" />
        <path
          d={`M80 ${baseY} Q78 ${stemTop + 10} 80 ${stemTop}`}
          stroke="#3b6c44"
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
        />
        {leafSlots.map((_, index) => {
          const offset = index + 1;
          const y = baseY - offset * (stage.stem / (stage.leaves + 1));
          const direction = index % 2 === 0 ? -1 : 1;
          const leafWidth = 28 - index * 3;
          const cx = 80 + direction * (18 + index * 4);
          const rotation = direction * (18 - index * 2);
          return (
            <ellipse
              key={index}
              cx={cx}
              cy={y}
              rx={leafWidth / 2}
              ry={12}
              fill="url(#leafGradient)"
              transform={`rotate(${rotation} ${cx} ${y})`}
              opacity={0.9 - index * 0.08}
            />
          );
        })}
        <circle
          cx="80"
          cy={stemTop - stage.canopy * 0.2}
          r={stage.canopy}
          fill="url(#leafGradient)"
          stroke="#3b6c44"
          strokeWidth="4"
        />
      </svg>
      <div className="plant-stage">{stage.label}</div>
      <div className="plant-progress-bar" aria-hidden="true">
        <div className="plant-progress-fill" style={{ width: `${percent}%` }} />
      </div>
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
        {items.map((it, index) => (
          <li key={it.id} className="story-card">
            <div className="story-image">
              <img
                src={`http://localhost:5173/gemini-native-image-${
                  items.length - index - 1
                }.png`}
                alt="Generated Scene"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  borderRadius: "8px",
                }}
              />
            </div>
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

  // Build up the caption gradually
  const interval = setInterval(() => {
    i++;
    setBotCaption({
      text: words.slice(0, i).join(" "),
      final: i === words.length,
    });
    if (i >= words.length) {
      clearInterval(interval);
      setBotSpeaking(false);
      onDone?.();
    }
  }, 80); // token streaming speed
}

function countWords(text) {
  return text
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}
