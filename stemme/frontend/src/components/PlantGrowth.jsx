import { PLANT_LEVELS } from "../utils/constants";

export default function PlantGrowth({ stageIndex, percent }) {
  const stage = PLANT_LEVELS[stageIndex];
  const baseY = 168;
  const stemTop = baseY - stage.stem;
  const leafSlots = Array.from({ length: stage.leaves });

  return (
    <div className="plant-wrapper">
      <svg
        className="plant-graphic"
        viewBox="0 0 160 200"
        role="img"
        aria-label={`Plant growth stage: ${stage.label}`}
      >
        <defs>
          <linearGradient id="leafGradient" x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#8cd790" />
            <stop offset="100%" stopColor="#4f9d69" />
          </linearGradient>
          <linearGradient id="potGradient" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#a9745b" />
            <stop offset="100%" stopColor="#8b5a44" />
          </linearGradient>
        </defs>
        <rect
          x="54"
          y="168"
          width="52"
          height="22"
          fill="url(#potGradient)"
          rx="8"
        />
        <rect x="48" y="160" width="64" height="12" fill="#b8836d" rx="6" />
        <path
          d={`M80 ${baseY} Q78 ${stemTop + 10} 80 ${stemTop}`}
          stroke="#3b6c44"
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
        />
        {leafSlots.map((_, index) => {
          const offset = index + 1;
          const y = baseY - offset * (stage.stem / (stage.leaves + 1));
          const direction = index % 2 === 0 ? -1 : 1;
          const leafWidth = 28 - index * 3;
          const cx = 80 + direction * (18 + index * 4);
          const rotation = direction * (18 - index * 2);
          return (
            <ellipse
              key={index}
              cx={cx}
              cy={y}
              rx={leafWidth / 2}
              ry={12}
              fill="url(#leafGradient)"
              transform={`rotate(${rotation} ${cx} ${y})`}
              opacity={0.9 - index * 0.08}
            />
          );
        })}
        <circle
          cx="80"
          cy={stemTop - stage.canopy * 0.2}
          r={stage.canopy}
          fill="url(#leafGradient)"
          stroke="#3b6c44"
          strokeWidth="4"
        />
      </svg>
      <div className="plant-stage">{stage.label}</div>
      <div className="plant-progress-bar" aria-hidden="true">
        <div className="plant-progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
