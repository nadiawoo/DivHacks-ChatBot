import { useStory } from "../context/StoryContext";

export default function StoryPanel() {
  const { items } = useStory();

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
                src={`/gemini-native-image-${items.length - index - 1}.png`}
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
