import { Link } from "react-router-dom";

export default function LandingPage() {
  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-brand">Stemme.study</div>
      </header>

      <section className="landing-hero">
        <h1 className="landing-title">
          Your AI Speech Therapy Companion
        </h1>
        <p className="landing-subtitle">
          Helping children aged 3-13 build communication skills through gentle,
          playful conversation and visual storytelling.
        </p>
        <Link to="/app" className="landing-cta">
          Start Talking
        </Link>
      </section>

      <section className="landing-features">
        <div className="feature-card">
          <div className="feature-icon">🗣️</div>
          <h3>Speech Practice</h3>
          <p>
            Real-time voice recognition with patient, encouraging responses
            designed for children with communication challenges.
          </p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🌱</div>
          <h3>Track Progress</h3>
          <p>
            Watch your tree grow as you practice. Every word spoken helps your
            plant flourish.
          </p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🎨</div>
          <h3>Visual Stories</h3>
          <p>
            AI-generated illustrations bring conversations to life in a
            kid-friendly, picture-book style.
          </p>
        </div>
      </section>

      <footer className="landing-footer">
        <p>
          Built at DivHacks 2025 — An inclusive speech therapy tool for every
          child.
        </p>
      </footer>
    </div>
  );
}
