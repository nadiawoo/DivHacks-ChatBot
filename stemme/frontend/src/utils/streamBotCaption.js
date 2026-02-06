export default function streamBotCaption(text, setBotCaption, setBotSpeaking, onDone) {
  const words = text.split(/\s+/);
  let i = 0;
  setBotSpeaking(true);

  const interval = setInterval(() => {
    i++;
    setBotCaption({
      text: words.slice(0, i).join(" "),
      final: i === words.length,
    });
    if (i >= words.length) {
      clearInterval(interval);
      setBotSpeaking(false);
      onDone?.();
    }
  }, 80);
}
