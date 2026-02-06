import { randomUUID } from "crypto";

const MAX_SESSIONS = 100;
const SESSION_TTL_MS = 30 * 60 * 1000;

const ACTION_UPDATE = "update";
const ACTION_EXPAND = "expand";

export const illustrationSessions = new Map();

export const sanitize = (value) =>
  typeof value === "string" ? value.trim() : "";

const keywordsFrom = (text) =>
  sanitize(text)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 3);

function cleanupSessions() {
  const now = Date.now();
  for (const [id, state] of illustrationSessions) {
    if (now - state.lastUpdated > SESSION_TTL_MS) {
      illustrationSessions.delete(id);
    }
  }
  if (illustrationSessions.size > MAX_SESSIONS) {
    const sorted = [...illustrationSessions.entries()].sort(
      ([, a], [, b]) => a.lastUpdated - b.lastUpdated
    );
    const toRemove = sorted.slice(
      0,
      illustrationSessions.size - MAX_SESSIONS
    );
    for (const [id] of toRemove) {
      illustrationSessions.delete(id);
    }
  }
}

export const ensureSession = (sessionId, { reset, newId } = {}) => {
  cleanupSessions();

  let effectiveId = sanitize(sessionId);
  if (reset && newId) {
    const sanitizedNewId = sanitize(newId);
    effectiveId = sanitizedNewId || randomUUID();
  } else if (reset || !effectiveId) {
    effectiveId = randomUUID();
  }

  if (!illustrationSessions.has(effectiveId) || reset) {
    illustrationSessions.set(effectiveId, {
      history: [],
      conversation: [],
      lastChildUtterance: "",
      lastAssistantReply: "",
      lastImage: null,
      lastUpdated: Date.now(),
    });
  }

  return { id: effectiveId, state: illustrationSessions.get(effectiveId) };
};

export const resolveAction = (history, latestPrompt, requestedAction) => {
  if (requestedAction && requestedAction !== "auto") return requestedAction;
  if (!history.length) return ACTION_UPDATE;

  const previousTerms = new Set(
    history.flatMap(({ prompt }) => keywordsFrom(prompt))
  );
  const latestTerms = keywordsFrom(latestPrompt);
  const hasNewTopic = latestTerms.some((term) => !previousTerms.has(term));
  return hasNewTopic ? ACTION_EXPAND : ACTION_UPDATE;
};

export const buildIllustrationPrompt = ({
  history,
  latestPrompt,
  action,
  conversation = [],
}) => {
  const lines = [
    "You are NanoBanana, the Gemini illustration model for live children's storytelling.",
    "Illustrate in a kawaii, picture-book style with soft rounded characters, large expressive eyes, and pastel colors.",
    "Keep lines clean, shading simple, and make everything friendly, cozy, and safe for children aged 3-10.",
    "Ensure characters and props remain consistent between frames unless the story explicitly changes them.",
  ];

  if (history.length) {
    const recap = history
      .map((entry, idx) => ` (${idx + 1}) ${entry.prompt}`)
      .join(";");
    lines.push(
      `So far the story scene includes:${recap}. Respect those established details.`
    );
  }

  if (conversation.length) {
    const recentDialogue = conversation
      .slice(-3)
      .map(
        ({ child, assistant }, idx) =>
          `Turn ${idx + 1}: child said "${child}" and helper replied "${assistant}".`
      )
      .join(" ");
    lines.push(
      `Recent dialogue to incorporate: ${recentDialogue}. Use the helper's reply to guide the atmosphere and child's intent.`
    );
  }

  if (action === ACTION_EXPAND) {
    lines.push(
      "Expand the existing canvas to keep prior elements visible while adding new subjects."
    );
  } else {
    lines.push(
      "Update existing elements in place, refining colors, props, or expressions if needed."
    );
  }

  lines.push(
    `Focus for this update: ${latestPrompt}. Blend it into the ongoing scene in a playful way.`
  );
  lines.push(
    "Return an updated illustration that reflects the complete scene so far."
  );

  return lines.join("\n");
};
