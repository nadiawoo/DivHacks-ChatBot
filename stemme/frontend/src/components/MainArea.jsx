import CallCanvas from "./CallCanvas";
import StoryPanel from "./StoryPanel";

export default function MainArea({ onUserSpeech }) {
  return (
    <div className="main">
      <CallCanvas onUserSpeech={onUserSpeech} />
      <StoryPanel />
    </div>
  );
}
