export default function countWords(text) {
  return text
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}
