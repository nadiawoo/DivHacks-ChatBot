
import { useCallback } from 'react';

export const useSpeechSynthesis = () => {
  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis || !text) {
      console.warn('Speech synthesis not supported or text is empty.');
      return;
    }
    
    // Cancel any ongoing speech to prevent overlap
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Optional: Find a friendly voice
    const voices = window.speechSynthesis.getVoices();
    const friendlyVoice = voices.find(voice => 
      voice.name.includes('Google US English') || 
      voice.name.includes('Samantha') || 
      voice.name.includes('Daniel')
    );
    if (friendlyVoice) {
      utterance.voice = friendlyVoice;
    }

    utterance.pitch = 1.1;
    utterance.rate = 0.95;
    
    window.speechSynthesis.speak(utterance);
  }, []);

  // Pre-load voices
  if (window.speechSynthesis && typeof window.speechSynthesis.getVoices === 'function') {
      window.speechSynthesis.onvoiceschanged = () => {
          window.speechSynthesis.getVoices();
      };
  }


  return { speak };
};
