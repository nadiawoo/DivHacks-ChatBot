
import React from 'react';

interface IconButtonProps {
  onClick: () => void;
  isListening: boolean;
  disabled: boolean;
  children: React.ReactNode;
}

export const IconButton: React.FC<IconButtonProps> = ({ onClick, isListening, disabled, children }) => {
  const baseClasses = "relative rounded-full p-6 text-white transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-opacity-50 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed";
  
  const listeningClasses = isListening 
    ? "bg-red-500 hover:bg-red-600 focus:ring-red-400" 
    : "bg-emerald-500 hover:bg-emerald-600 focus:ring-emerald-400";

  const animationSpan = isListening ? (
    <span className="absolute h-full w-full rounded-full bg-red-400 animate-ping opacity-75"></span>
  ) : null;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${listeningClasses}`}
      aria-label={isListening ? 'Stop Listening' : 'Start Talking'}
    >
      {animationSpan}
      <span className="relative z-10">{children}</span>
    </button>
  );
};
