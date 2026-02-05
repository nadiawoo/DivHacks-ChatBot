export default function Header({ onProfileClick, profileOpen }) {
  return (
    <header className="app-header">
      <div className="header-text">
        <div className="brand">Stem.me</div>
        <div className="sub">AI-powered speech companion</div>
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
