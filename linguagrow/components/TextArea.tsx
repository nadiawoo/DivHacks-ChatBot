
import React from 'react';
import { Zap } from 'lucide-react';

interface TextAreaProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  isLoading?: boolean;
  readOnly?: boolean;
}

export const TextArea: React.FC<TextAreaProps> = ({ id, label, value, placeholder, isLoading = false, readOnly = true }) => {
  return (
    <div className="relative w-full">
      <label htmlFor={id} className="block text-sm font-semibold text-emerald-700 mb-2">
        {label}
      </label>
      <div className="relative">
        <textarea
          id={id}
          value={value}
          placeholder={placeholder}
          readOnly={readOnly}
          className="w-full h-32 p-4 text-gray-700 bg-emerald-50 border-2 border-emerald-200 rounded-lg focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-colors duration-300 resize-none"
        />
        {isLoading && (
          <div className="absolute inset-0 bg-white/50 flex items-center justify-center rounded-lg">
            <Zap className="text-emerald-500 animate-pulse" size={24} />
          </div>
        )}
      </div>
    </div>
  );
};
