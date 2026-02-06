export default function CartoonAnimal() {
  return (
    <svg
      className="profile-avatar"
      viewBox="0 0 120 120"
      role="img"
      aria-label="Cartoon fox avatar"
    >
      <defs>
        <linearGradient id="foxFur" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stopColor="#f7b267" />
          <stop offset="50%" stopColor="#f79d65" />
          <stop offset="100%" stopColor="#f4845f" />
        </linearGradient>
      </defs>
      <circle
        cx="60"
        cy="60"
        r="54"
        fill="url(#foxFur)"
        stroke="#e26b4c"
        strokeWidth="4"
      />
      <path
        d="M22 42 L40 18 L52 40"
        fill="#fcd9ad"
        stroke="#e26b4c"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M98 42 L80 18 L68 40"
        fill="#fcd9ad"
        stroke="#e26b4c"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="45" cy="60" r="7" fill="#1f2d3d" />
      <circle cx="75" cy="60" r="7" fill="#1f2d3d" />
      <path
        d="M60 70 Q63 78 70 80"
        stroke="#1f2d3d"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M55 90 Q60 96 65 90"
        stroke="#1f2d3d"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <circle
        cx="60"
        cy="72"
        r="5"
        fill="#fcd9ad"
        stroke="#e26b4c"
        strokeWidth="2"
      />
      <path
        d="M40 86 L30 90"
        stroke="#1f2d3d"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M80 86 L90 90"
        stroke="#1f2d3d"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
