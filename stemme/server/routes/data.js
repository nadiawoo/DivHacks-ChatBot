import { Router } from "express";
import {
  getProgressSnapshots,
  getTranscriptForSession,
  getUserProfile,
  getUserProgress,
  getUserRecord,
  listUsers,
  sanitizeSessionId,
  sanitizeUserId,
} from "../db.js";
import { analyzeUserGrowth } from "../progress-tracker.js";

const router = Router();

router.get("/users", async (req, res) => {
  try {
    const rawUsers = await listUsers();
    const users = await Promise.all(
      rawUsers.map(async (user) => {
        const progress = await getUserProgress(user.userId);
        const createdAtIso = new Date(user.createdAt).toISOString();
        const updatedAtIso = new Date(user.updatedAt).toISOString();
        return {
          userId: user.userId,
          createdAt: user.createdAt,
          createdAtIso,
          updatedAt: user.updatedAt,
          updatedAtIso,
          sessionCount: progress.sessions.length,
          activeSessions: progress.sessions
            .filter((session) => session.active)
            .map((session) => session.sessionId),
        };
      })
    );

    res.json({ users });
  } catch (err) {
    console.error("Failed to list users", err);
    res.status(500).json({ error: "Failed to list users" });
  }
});

router.get("/users/:userId", async (req, res) => {
  try {
    const userId = sanitizeUserId(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Invalid userId" });

    const userRecord = await getUserRecord(userId);
    if (!userRecord) return res.status(404).json({ error: "User not found" });

    const [profile, snapshots, progress] = await Promise.all([
      getUserProfile(userId),
      getProgressSnapshots(userId),
      getUserProgress(userId),
    ]);

    const sessions = await Promise.all(
      progress.sessions.map(async (session) => {
        const transcript = await getTranscriptForSession(session.sessionId);
        return {
          sessionId: session.sessionId,
          createdAt: session.createdAt,
          createdAtIso: session.createdAtIso,
          active: session.active,
          turnCount: session.turnCount,
          transcript: transcript
            ? {
                session: transcript.session,
                turns: transcript.turns,
                messages: transcript.messages,
              }
            : null,
        };
      })
    );

    res.json({
      user: {
        userId: userRecord.userId,
        createdAt: userRecord.createdAt,
        createdAtIso: new Date(userRecord.createdAt).toISOString(),
        updatedAt: userRecord.updatedAt,
        updatedAtIso: new Date(userRecord.updatedAt).toISOString(),
      },
      profile,
      sessions,
      progressSnapshots: snapshots,
    });
  } catch (err) {
    console.error("Failed to fetch user data", err);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
});

router.get("/users/:userId/growth", async (req, res) => {
  try {
    const userId = sanitizeUserId(req.params.userId);
    if (!userId) return res.status(400).json({ error: "Invalid userId" });

    const summary = await analyzeUserGrowth(userId);
    res.json(summary);
  } catch (err) {
    console.error("Failed to analyze user growth", err);
    res.status(500).json({ error: "Failed to analyze user growth" });
  }
});

router.get("/sessions/:sessionId", async (req, res) => {
  try {
    const sessionId = sanitizeSessionId(req.params.sessionId);
    if (!sessionId)
      return res.status(400).json({ error: "Invalid sessionId" });

    const transcript = await getTranscriptForSession(sessionId);
    if (!transcript)
      return res.status(404).json({ error: "Session not found" });

    res.json(transcript);
  } catch (err) {
    console.error("Failed to fetch session transcript", err);
    res.status(500).json({ error: "Failed to fetch session transcript" });
  }
});

export default router;
