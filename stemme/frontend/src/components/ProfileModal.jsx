import { useEffect, useMemo, useRef, useState } from "react";
import { PLANT_LEVELS, GROWTH_GOAL } from "../utils/constants";
import CartoonAnimal from "./CartoonAnimal";
import PlantGrowth from "./PlantGrowth";

export default function ProfileModal({ onClose, totalWords, name, onNameChange }) {
  const [draftName, setDraftName] = useState(name);
  const panelRef = useRef(null);

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

  // Keep a ref so effects always call the latest handleClose
  const closeRef = useRef(handleClose);
  closeRef.current = handleClose;

  // Escape key to close
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Scroll lock
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Focus trap
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const focusableSelector =
      'button, input, [tabindex]:not([tabindex="-1"])';
    const focusables = panel.querySelectorAll(focusableSelector);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    first?.focus();

    const trapFocus = (e) => {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    panel.addEventListener("keydown", trapFocus);
    return () => panel.removeEventListener("keydown", trapFocus);
  }, []);

  return (
    <div className="profile-overlay">
      <div
        className="profile-panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Profile"
      >
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
