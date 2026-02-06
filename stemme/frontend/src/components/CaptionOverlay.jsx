export default function CaptionOverlay({ text, role, speaking }) {
  const empty = !text?.trim();
  return (
    <div className={`caption ${role}`}>
      {empty ? <span className="ghost"> </span> : <span>{text}</span>}
      {speaking ? <span className="cursor">▌</span> : null}
    </div>
  );
}
