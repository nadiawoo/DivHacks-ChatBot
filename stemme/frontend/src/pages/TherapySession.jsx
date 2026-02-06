import { useEffect, useState } from "react";
import { PROGRESS_STORAGE_KEY, NAME_STORAGE_KEY } from "../utils/constants";
import countWords from "../utils/countWords";
import { StoryProvider } from "../context/StoryContext";
import Header from "../components/Header";
import MainArea from "../components/MainArea";
import ProfileModal from "../components/ProfileModal";

export default function TherapySession() {
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
        showBack
      />
      <StoryProvider>
        <MainArea onUserSpeech={handleUserSpeech} />
      </StoryProvider>
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
