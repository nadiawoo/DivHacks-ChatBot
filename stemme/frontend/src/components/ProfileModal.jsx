import { useEffect, useMemo, useState } from "react";
import { PLANT_LEVELS, GROWTH_GOAL } from "../utils/constants";
import CartoonAnimal from "./CartoonAnimal";
import PlantGrowth from "./PlantGrowth";

export default function ProfileModal({ onClose, totalWords, name, onNameChange }) {
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
