export default function Controls({ listening, onMicToggle }) {
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
