
export const localRephrase = (text: string): string => {
  if (!text.trim()) {
    return '';
  }

  let processedText = text.trim();
  
  // Capitalize the first letter
  processedText = processedText.charAt(0).toUpperCase() + processedText.slice(1);

  // Add punctuation if it's missing
  const lastChar = processedText.slice(-1);
  if (!['.', '!', '?'].includes(lastChar)) {
    processedText += '.';
  }
  
  return processedText;
};
