import { useEffect, useRef, useState } from "react";

export default function useSpeechRecognition({ onSentence, onNewWords, onError }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognizerRef = useRef(null);
  const lastFinalRef = useRef("");

  const onSentenceRef = useRef(onSentence);
  const onNewWordsRef = useRef(onNewWords);
  const onErrorRef = useRef(onError);
  onSentenceRef.current = onSentence;
  onNewWordsRef.current = onNewWords;
  onErrorRef.current = onError;

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }

    const r = new SR();
    r.lang = "en-US";
    r.interimResults = true;
    r.continuous = true;

    let sentenceBuffer = "";
    let sendTimeout;

    function sendFullSentence() {
      if (!sentenceBuffer.trim()) return;
      const fullSentence = sentenceBuffer.trim();
      sentenceBuffer = "";
      lastFinalRef.current = "";
      onSentenceRef.current?.(fullSentence);
    }

    r.onresult = (evt) => {
      let final = "";
      for (const res of evt.results) {
        if (res.isFinal) final += res[0].transcript + " ";
      }

      const combinedFinal = final.trim();

      if (combinedFinal) {
        const previous = lastFinalRef.current;
        let incremental = combinedFinal;
        if (previous && combinedFinal.startsWith(previous)) {
          incremental = combinedFinal.slice(previous.length).trim();
        }

        if (incremental) {
          sentenceBuffer += " " + incremental;
          onNewWordsRef.current?.(incremental);
        }

        lastFinalRef.current = combinedFinal;

        if (/[.?!]$/.test(combinedFinal)) {
          sendFullSentence();
        } else {
          clearTimeout(sendTimeout);
          sendTimeout = setTimeout(sendFullSentence, 2000);
        }
      }
    };

    r.onerror = (event) => {
      console.error("SpeechRecognition error:", event.error);
      onErrorRef.current?.(event.error);
      setListening(false);
      sentenceBuffer = "";
      lastFinalRef.current = "";
    };

    r.onend = () => {
      setListening(false);
      sentenceBuffer = "";
      lastFinalRef.current = "";
    };

    recognizerRef.current = r;

    return () => {
      clearTimeout(sendTimeout);
      try {
        r.abort();
      } catch { /* ignore */ }
    };
  }, []);

  const toggleListening = () => {
    const r = recognizerRef.current;
    if (!r) return false;
    if (listening) {
      r.stop();
      setListening(false);
    } else {
      lastFinalRef.current = "";
      r.start();
      setListening(true);
    }
    return true;
  };

  return { listening, supported, toggleListening };
}
