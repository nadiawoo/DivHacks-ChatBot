import Database from "better-sqlite3";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "crypto";

const dataDir = path.join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "lingua.sqlite3");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS transcript_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn_index INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  child TEXT,
  assistant TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY,
  display_name TEXT,
  nickname TEXT,
  avatar_url TEXT,
  birthday TEXT,
  grade_level TEXT,
  caregiver_name TEXT,
  caregiver_email TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn_index INTEGER NOT NULL,
  message_index INTEGER NOT NULL,
  speaker TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_messages_session_turn_msg
  ON conversation_messages(session_id, turn_index, message_index, speaker);

CREATE TABLE IF NOT EXISTS progress_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  session_id TEXT,
  created_at INTEGER NOT NULL,
  metric TEXT NOT NULL,
  value REAL,
  notes TEXT,
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);
CREATE INDEX IF NOT EXISTS idx_progress_snapshots_user
  ON progress_snapshots(user_id, created_at DESC);
`);

const ensureUserStmt = db.prepare(
  `INSERT INTO users (user_id, created_at, updated_at)
   VALUES (@userId, @timestamp, @timestamp)
   ON CONFLICT(user_id) DO UPDATE SET updated_at=@timestamp`
);

const ensureProfileStmt = db.prepare(
  `INSERT INTO user_profiles (user_id, created_at, updated_at)
   VALUES (@userId, @timestamp, @timestamp)
   ON CONFLICT(user_id) DO NOTHING`
);

const updateProfileStmt = db.prepare(
  `UPDATE user_profiles
   SET display_name=@displayName,
       nickname=@nickname,
       avatar_url=@avatarUrl,
       birthday=@birthday,
       grade_level=@gradeLevel,
       caregiver_name=@caregiverName,
       caregiver_email=@caregiverEmail,
       notes=@notes,
       updated_at=@timestamp
   WHERE user_id=@userId`
);

const getProfileStmt = db.prepare(
  `SELECT
      user_id AS userId,
      display_name AS displayName,
      nickname,
      avatar_url AS avatarUrl,
      birthday,
      grade_level AS gradeLevel,
      caregiver_name AS caregiverName,
      caregiver_email AS caregiverEmail,
      notes,
      created_at AS createdAt,
      updated_at AS updatedAt
   FROM user_profiles
   WHERE user_id = ?`
);

const insertSessionStmt = db.prepare(
  `INSERT INTO sessions (session_id, user_id, created_at, active)
   VALUES (@sessionId, @userId, @timestamp, 1)`
);

const deactivateSessionsStmt = db.prepare(
  `UPDATE sessions SET active=0 WHERE user_id=@userId`
);

const getSessionStmt = db.prepare(
  `SELECT session_id AS sessionId, user_id AS userId, created_at AS createdAt, active
   FROM sessions WHERE session_id = ?`
);

const insertTurnStmt = db.prepare(
  `INSERT INTO transcript_turns (session_id, turn_index, timestamp, child, assistant)
   VALUES (@sessionId, @turnIndex, @timestamp, @child, @assistant)`
);

const getTurnsStmt = db.prepare(
  `SELECT turn_index AS "index", timestamp, child, assistant
   FROM transcript_turns WHERE session_id = ? ORDER BY turn_index ASC`
);

const getLatestTurnIndexStmt = db.prepare(
  `SELECT COALESCE(MAX(turn_index), 0) AS maxIndex FROM transcript_turns WHERE session_id = ?`
);

const deleteMessagesForTurnStmt = db.prepare(
  `DELETE FROM conversation_messages WHERE session_id=@sessionId AND turn_index=@turnIndex`
);

const insertMessageStmt = db.prepare(
  `INSERT INTO conversation_messages (session_id, turn_index, message_index, speaker, content, timestamp)
   VALUES (@sessionId, @turnIndex, @messageIndex, @speaker, @content, @timestamp)`
);

const getMessagesForSessionStmt = db.prepare(
  `SELECT turn_index AS turnIndex, message_index AS messageIndex, speaker, content, timestamp
   FROM conversation_messages WHERE session_id = ?
   ORDER BY turn_index ASC, message_index ASC`
);

const getSessionsForUserStmt = db.prepare(
  `SELECT session_id AS sessionId, created_at AS createdAt, active
   FROM sessions WHERE user_id = ? ORDER BY created_at DESC`
);

const getUsersStmt = db.prepare(
  `SELECT user_id AS userId, created_at AS createdAt, updated_at AS updatedAt
   FROM users ORDER BY created_at ASC`
);

const getSessionCountStmt = db.prepare(
  `SELECT COUNT(*) AS turnCount FROM transcript_turns WHERE session_id = ?`
);

const insertProgressSnapshotStmt = db.prepare(
  `INSERT INTO progress_snapshots (user_id, session_id, created_at, metric, value, notes)
   VALUES (@userId, @sessionId, @timestamp, @metric, @value, @notes)`
);

const getProgressSnapshotsStmt = db.prepare(
  `SELECT id, session_id AS sessionId, created_at AS createdAt, metric, value, notes
   FROM progress_snapshots
   WHERE user_id = ?
   ORDER BY created_at DESC`
);

export const sanitizeUserId = (value) =>
  typeof value === "string" ? value.trim().slice(0, 128) : "";

export const sanitizeSessionId = (value) =>
  typeof value === "string"
    ? value.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64)
    : "";

const sanitizeText = (value) =>
  typeof value === "string"
    ? value
        .replace(/[\r\n]+/g, " ")
        .replace(/\s+/g, " ")
        .replace(/["\u0000-\u001f]/g, " ")
        .trim()
    : "";

export const createSessionForUser = (userIdRaw) => {
  const userId = sanitizeUserId(userIdRaw);
  if (!userId) throw new Error("Invalid userId");
  const timestamp = Date.now();
  ensureUserStmt.run({ userId, timestamp });
  ensureProfileStmt.run({ userId, timestamp });
  const sessionId = randomUUID();
  deactivateSessionsStmt.run({ userId });
  insertSessionStmt.run({ sessionId, userId, timestamp });
  return { sessionId, userId, createdAt: timestamp };
};

export const upsertUserProfile = (userIdRaw, profile = {}) => {
  const userId = sanitizeUserId(userIdRaw);
  if (!userId) throw new Error("Invalid userId");
  const timestamp = Date.now();
  ensureUserStmt.run({ userId, timestamp });
  ensureProfileStmt.run({ userId, timestamp });
  updateProfileStmt.run({
    userId,
    displayName: sanitizeText(profile.displayName),
    nickname: sanitizeText(profile.nickname),
    avatarUrl: sanitizeText(profile.avatarUrl),
    birthday: sanitizeText(profile.birthday),
    gradeLevel: sanitizeText(profile.gradeLevel),
    caregiverName: sanitizeText(profile.caregiverName),
    caregiverEmail: sanitizeText(profile.caregiverEmail),
    notes: sanitizeText(profile.notes),
    timestamp,
  });
  return getUserProfile(userId);
};

export const getUserProfile = (userIdRaw) => {
  const userId = sanitizeUserId(userIdRaw);
  if (!userId) return null;
  const row = getProfileStmt.get(userId);
  if (!row) return null;
  return {
    ...row,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
};

export const getSessionById = (sessionId) => {
  const normalizedSessionId = sanitizeSessionId(sessionId);
  if (!normalizedSessionId) return null;
  const row = getSessionStmt.get(normalizedSessionId);
  if (!row) return null;
  return {
    ...row,
    createdAt: row.createdAt,
  };
};

export const appendTranscriptTurn = (sessionId, child, assistant) => {
  const normalizedSessionId = sanitizeSessionId(sessionId);
  if (!normalizedSessionId) throw new Error("Invalid sessionId");
  const { maxIndex } = getLatestTurnIndexStmt.get(normalizedSessionId);
  const turnIndex = maxIndex + 1;
  const timestamp = Date.now();
  insertTurnStmt.run({
    sessionId: normalizedSessionId,
    turnIndex,
    timestamp,
    child,
    assistant,
  });

  deleteMessagesForTurnStmt.run({
    sessionId: normalizedSessionId,
    turnIndex,
  });

  let messageIndex = 0;
  const childContent = sanitizeText(child);
  if (childContent) {
    insertMessageStmt.run({
      sessionId: normalizedSessionId,
      turnIndex,
      messageIndex: messageIndex++,
      speaker: "child",
      content: childContent,
      timestamp,
    });
  }
  const assistantContent = sanitizeText(assistant);
  if (assistantContent) {
    insertMessageStmt.run({
      sessionId: normalizedSessionId,
      turnIndex,
      messageIndex: messageIndex++,
      speaker: "assistant",
      content: assistantContent,
      timestamp,
    });
  }

  return { index: turnIndex, timestamp, child, assistant };
};

export const getTranscriptForSession = (sessionId) => {
  const normalizedSessionId = sanitizeSessionId(sessionId);
  if (!normalizedSessionId) return null;
  const session = getSessionById(normalizedSessionId);
  if (!session) return null;
  const turns = getTurnsStmt.all(normalizedSessionId).map((turn) => ({
    ...turn,
    timestampIso: new Date(turn.timestamp).toISOString(),
  }));
  const messages = getMessagesForSessionStmt.all(normalizedSessionId).map((msg) => ({
    ...msg,
    timestampIso: new Date(msg.timestamp).toISOString(),
  }));
  return {
    session: {
      sessionId: session.sessionId,
      userId: session.userId,
      createdAt: session.createdAt,
      createdAtIso: new Date(session.createdAt).toISOString(),
      active: !!session.active,
    },
    turns,
    messages,
  };
};

export const getUserProgress = (userIdRaw) => {
  const userId = sanitizeUserId(userIdRaw);
  if (!userId) return { userId: "", sessions: [] };
  const sessions = getSessionsForUserStmt.all(userId).map((row) => {
    const transcript = getTurnsStmt.all(row.sessionId);
    return {
      sessionId: row.sessionId,
      createdAt: row.createdAt,
      createdAtIso: new Date(row.createdAt).toISOString(),
      active: !!row.active,
      turnCount: transcript.length,
    };
  });
  return { userId, sessions };
};

export const recordProgressSnapshot = ({
  userId,
  sessionId,
  metric,
  value,
  notes,
}) => {
  const sanitizedUserId = sanitizeUserId(userId);
  if (!sanitizedUserId) throw new Error("Invalid userId");
  const sanitizedSessionId = sessionId ? sanitizeSessionId(sessionId) : null;
  const timestamp = Date.now();
  insertProgressSnapshotStmt.run({
    userId: sanitizedUserId,
    sessionId: sanitizedSessionId,
    metric: sanitizeText(metric),
    value: typeof value === "number" ? value : null,
    notes: sanitizeText(notes),
    timestamp,
  });
  return getProgressSnapshots(sanitizedUserId);
};

export const getProgressSnapshots = (userIdRaw) => {
  const userId = sanitizeUserId(userIdRaw);
  if (!userId) return [];
  return getProgressSnapshotsStmt.all(userId).map((row) => ({
    ...row,
    createdAtIso: new Date(row.createdAt).toISOString(),
  }));
};

export const listUsers = () => getUsersStmt.all();

export const getSessionTurnCount = (sessionId) => {
  const row = getSessionCountStmt.get(sessionId);
  return row?.turnCount ?? 0;
};

export { dbPath };
