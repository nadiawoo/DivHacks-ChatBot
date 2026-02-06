import { Link } from "react-router-dom";

export default function Header({ onProfileClick, profileOpen, showBack }) {
  return (
    <header className="app-header">
      {showBack && (
        <Link to="/" className="back-link" aria-label="Back to home">
          &larr;
        </Link>
      )}
      <div className="header-text">
        <div className="brand">Stemme.study</div>
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
