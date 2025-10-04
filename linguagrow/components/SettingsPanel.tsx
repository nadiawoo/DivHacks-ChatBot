
import React from 'react';
import { Shield } from 'lucide-react';

interface SettingsPanelProps {
  isGuardianMode: boolean;
  setIsGuardianMode: (value: boolean) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ isGuardianMode, setIsGuardianMode }) => {
  const handleToggle = () => {
    setIsGuardianMode(!isGuardianMode);
  };

  return (
    <div className="flex items-center justify-end p-2 rounded-lg bg-emerald-50/50">
      <div className="flex items-center space-x-3 cursor-pointer" onClick={handleToggle}>
        <Shield className={`transition-colors duration-300 ${isGuardianMode ? 'text-emerald-600' : 'text-gray-400'}`} />
        <div className="text-sm">
          <p className={`font-semibold transition-colors duration-300 ${isGuardianMode ? 'text-emerald-700' : 'text-gray-600'}`}>Guardian Mode</p>
          <p className={`text-xs transition-colors duration-300 ${isGuardianMode ? 'text-emerald-600' : 'text-gray-500'}`}>
            {isGuardianMode ? 'On (Privacy-focused, no cloud AI)' : 'Off (Cloud AI features enabled)'}
          </p>
        </div>
        <div
          role="switch"
          aria-checked={isGuardianMode}
          className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-300 ${isGuardianMode ? 'bg-emerald-500' : 'bg-gray-300'}`}
        >
          <span
            className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-300 ${isGuardianMode ? 'translate-x-6' : 'translate-x-1'}`}
          />
        </div>
      </div>
    </div>
  );
};
