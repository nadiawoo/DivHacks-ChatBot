
import React, { useState, useEffect, useCallback } from 'react';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis';
import { rephraseText, generateImage } from './services/geminiService';
import { localRephrase } from './utils/localRephrase';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { IconButton } from './components/IconButton';
import { ImageCard } from './components/ImageCard';
import { ProgressBar } from './components/ProgressBar';
import { SettingsPanel } from './components/SettingsPanel';
import { TextArea } from './components/TextArea';
import { Mic, Zap } from 'lucide-react';
import { PROGRESS_KEY, GUARDIAN_MODE_KEY } from './constants';

const App: React.FC = () => {
  const [heardText, setHeardText] = useState<string>('');
  const [rephrasedText, setRephrasedText] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [progressCount, setProgressCount] = useState<number>(() => {
    const savedProgress = localStorage.getItem(PROGRESS_KEY);
    return savedProgress ? parseInt(savedProgress, 10) : 0;
  });

  const [isGuardianMode, setIsGuardianMode] = useState<boolean>(() => {
    const savedMode = localStorage.getItem(GUARDIAN_MODE_KEY);
    return savedMode ? JSON.parse(savedMode) : false;
  });

  const { speak } = useSpeechSynthesis();

  const handleProcessText = useCallback(async (text: string) => {
    if (!text) return;

    setIsLoading(true);
    setError(null);
    setRephrasedText('');
    setImageUrl(null);

    try {
      let newRephrasedText: string;
      if (isGuardianMode) {
        newRephrasedText = localRephrase(text);
      } else {
        newRephrasedText = await rephraseText(text);
      }
      
      setRephrasedText(newRephrasedText);
      speak(newRephrasedText);

      const newProgress = progressCount + 1;
      setProgressCount(newProgress);
      localStorage.setItem(PROGRESS_KEY, newProgress.toString());

      if (!isGuardianMode) {
        setIsGeneratingImage(true);
        try {
          const newImageUrl = await generateImage(newRephrasedText);
          setImageUrl(newImageUrl);
        } catch (imgError) {
          console.error("Image generation error:", imgError);
          setError("I couldn't create a picture, but I hope you liked the sentence!");
        } finally {
          setIsGeneratingImage(false);
        }
      }

    } catch (e) {
      console.error(e);
      setError('Oops! I had a little trouble understanding. Could you try again?');
    } finally {
      setIsLoading(false);
    }
  }, [isGuardianMode, speak, progressCount]);

  const { transcript, isListening, startListening, stopListening, error: speechError } = useSpeechRecognition({
    onTranscript: (text) => setHeardText(text),
    onRecognitionEnd: (finalTranscript) => {
        if(finalTranscript) {
            handleProcessText(finalTranscript);
        }
    }
  });

  useEffect(() => {
    if (speechError) {
      setError(`Speech recognition error: ${speechError}`);
    }
  }, [speechError]);
  
  useEffect(() => {
    localStorage.setItem(GUARDIAN_MODE_KEY, JSON.stringify(isGuardianMode));
  }, [isGuardianMode]);

  const handleMicClick = () => {
    if (isListening) {
      stopListening();
    } else {
      setHeardText('');
      setRephrasedText('');
      setImageUrl(null);
      setError(null);
      startListening();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-between text-gray-800 font-sans p-4 md:p-8">
      <Header />
      
      <main className="w-full max-w-4xl flex-grow flex flex-col items-center justify-center p-4">
        <div className="w-full bg-white/70 backdrop-blur-sm rounded-2xl shadow-lg p-6 md:p-8 space-y-6">
          <SettingsPanel isGuardianMode={isGuardianMode} setIsGuardianMode={setIsGuardianMode} />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <TextArea id="heard-text" label="Heard Sentence" value={isListening ? transcript : heardText} placeholder="Press the mic and start talking..." readOnly />
            <TextArea id="rephrased-text" label="Let's try this!" value={rephrasedText} placeholder="I'll help rephrase your sentence here..." isLoading={isLoading} readOnly />
          </div>

          <div className="text-center">
            <IconButton
              onClick={handleMicClick}
              isListening={isListening}
              disabled={isLoading}
            >
              <Mic size={32} />
            </IconButton>
          </div>

          {error && <p className="text-center text-red-500 font-medium">{error}</p>}
          
          <ImageCard imageUrl={imageUrl} isLoading={isGeneratingImage} />
          
          <ProgressBar count={progressCount} />
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default App;
