
import React from 'react';

interface ProgressBarProps {
  count: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ count }) => {
  const progressPercentage = Math.min((count / 10) * 100, 100); // Example: goal of 10 for a full bar

  return (
    <div className="w-full max-w-md mx-auto mt-4">
      <p className="text-center text-emerald-700 font-semibold mb-2">
        You've improved {count} {count === 1 ? 'sentence' : 'sentences'} today! 🌱
      </p>
      <div className="w-full bg-emerald-200 rounded-full h-4">
        <div
          className="bg-emerald-500 h-4 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progressPercentage}%` }}
        ></div>
      </div>
    </div>
  );
};
