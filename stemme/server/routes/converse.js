import { Router } from "express";
import {
  appendTranscriptTurn,
  createSessionForUser,
  findActiveSessionForUser,
  getSessionById,
  getSessionLastActivity,
  sanitizeSessionId,
} from "../db.js";
import { userIdFromRequest, SESSION_IDLE_TIMEOUT_MS } from "../lib/auth.js";
import { callGeminiWithRetry } from "../lib/gemini.js";
import { ensureSession, sanitize } from "../lib/illustration.js";
import buildConversePrompt from "../lib/systemPrompt.js";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { message, sessionId, resetSession = false } = req.body || {};
    if (!message) return res.status(400).json({ error: "Missing message" });

    const userId = userIdFromRequest(req);
    const requestedSessionId = sanitizeSessionId(sessionId);
    let sessionRecord = null;

    if (!resetSession && requestedSessionId) {
      const existing = await getSessionById(requestedSessionId);
      if (existing && existing.userId === userId) sessionRecord = existing;
    }

    if (!resetSession && !sessionRecord) {
      sessionRecord = await findActiveSessionForUser(userId);
    }

    if (sessionRecord) {
      try {
        const lastActivity = await getSessionLastActivity(
          sessionRecord.sessionId
        );
        if (
          lastActivity &&
          Date.now() - Number(lastActivity) >= SESSION_IDLE_TIMEOUT_MS
        ) {
          sessionRecord = null;
        }
      } catch (activityErr) {
        console.warn(
          "Unable to determine session last activity",
          activityErr
        );
      }
    }

    if (!sessionRecord) {
      sessionRecord = await createSessionForUser(userId);
    }

    const activeSessionId = sessionRecord.sessionId;

    const prompt = buildConversePrompt(message);
    const text = await callGeminiWithRetry(prompt, 3);
    console.log("Gemini ->", text);

    const { state } = ensureSession(activeSessionId, {
      reset: resetSession,
      newId: activeSessionId,
    });

    state.lastChildUtterance = sanitize(message);
    state.lastAssistantReply = sanitize(text);
    state.conversation.push({
      child: state.lastChildUtterance,
      assistant: state.lastAssistantReply,
      timestamp: Date.now(),
    });
    if (state.conversation.length > 12) state.conversation.shift();
    state.lastUpdated = Date.now();

    try {
      await appendTranscriptTurn(
        activeSessionId,
        state.lastChildUtterance,
        state.lastAssistantReply
      );
    } catch (dbErr) {
      console.error("Failed to persist transcript turn", dbErr);
    }

    res.json({ reply: text, sessionId: activeSessionId, userId });
  } catch (err) {
    console.error("Gemini API error:", err);
    res.status(500).json({ error: "Failed to get Gemini reply" });
  }
});

export default router;
