import Database from "better-sqlite3";
import mysql from "mysql2/promise";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { randomUUID } from "crypto";

const DB_CLIENT = (process.env.DB_CLIENT || "sqlite").toLowerCase();
const useMySql = DB_CLIENT === "mysql";

const dataDir = path.join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

const sqliteDbPath = path.join(dataDir, "lingua.sqlite3");

let sqliteDb = null;
let sqliteStatements = null;

if (!useMySql) {
  sqliteDb = new Database(sqliteDbPath);
  sqliteDb.pragma("journal_mode = WAL");
  sqliteDb.exec(`
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

  sqliteStatements = {
    ensureUser: sqliteDb.prepare(
      `INSERT INTO users (user_id, created_at, updated_at)
       VALUES (@userId, @timestamp, @timestamp)
       ON CONFLICT(user_id) DO UPDATE SET updated_at=@timestamp`
    ),
    ensureProfile: sqliteDb.prepare(
      `INSERT INTO user_profiles (user_id, created_at, updated_at)
       VALUES (@userId, @timestamp, @timestamp)
       ON CONFLICT(user_id) DO NOTHING`
    ),
    updateProfile: sqliteDb.prepare(
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
    ),
    getProfile: sqliteDb.prepare(
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
    ),
    insertSession: sqliteDb.prepare(
      `INSERT INTO sessions (session_id, user_id, created_at, active)
       VALUES (@sessionId, @userId, @timestamp, 1)`
    ),
    deactivateSessions: sqliteDb.prepare(
      `UPDATE sessions SET active=0 WHERE user_id=@userId`
    ),
    getSession: sqliteDb.prepare(
      `SELECT session_id AS sessionId, user_id AS userId, created_at AS createdAt, active
       FROM sessions WHERE session_id = ?`
    ),
    getActiveSessionForUser: sqliteDb.prepare(
      `SELECT session_id AS sessionId, user_id AS userId, created_at AS createdAt, active
       FROM sessions
       WHERE user_id = ? AND active = 1
       ORDER BY created_at DESC
       LIMIT 1`
    ),
    getUser: sqliteDb.prepare(
      `SELECT user_id AS userId, created_at AS createdAt, updated_at AS updatedAt
       FROM users
       WHERE user_id = ?`
    ),
    insertTurn: sqliteDb.prepare(
      `INSERT INTO transcript_turns (session_id, turn_index, timestamp, child, assistant)
       VALUES (@sessionId, @turnIndex, @timestamp, @child, @assistant)`
    ),
    getTurns: sqliteDb.prepare(
      `SELECT turn_index AS "index", timestamp, child, assistant
       FROM transcript_turns WHERE session_id = ? ORDER BY turn_index ASC`
    ),
    getLatestTurnIndex: sqliteDb.prepare(
      `SELECT COALESCE(MAX(turn_index), 0) AS maxIndex FROM transcript_turns WHERE session_id = ?`
    ),
    getLastTurnTimestamp: sqliteDb.prepare(
      `SELECT MAX(timestamp) AS lastTimestamp FROM transcript_turns WHERE session_id = ?`
    ),
    deleteMessagesForTurn: sqliteDb.prepare(
      `DELETE FROM conversation_messages WHERE session_id=@sessionId AND turn_index=@turnIndex`
    ),
    insertMessage: sqliteDb.prepare(
      `INSERT INTO conversation_messages (session_id, turn_index, message_index, speaker, content, timestamp)
       VALUES (@sessionId, @turnIndex, @messageIndex, @speaker, @content, @timestamp)`
    ),
    getMessagesForSession: sqliteDb.prepare(
      `SELECT turn_index AS turnIndex, message_index AS messageIndex, speaker, content, timestamp
       FROM conversation_messages WHERE session_id = ?
       ORDER BY turn_index ASC, message_index ASC`
    ),
    getSessionsForUser: sqliteDb.prepare(
      `SELECT session_id AS sessionId, created_at AS createdAt, active
       FROM sessions WHERE user_id = ? ORDER BY created_at DESC`
    ),
    listUsers: sqliteDb.prepare(
      `SELECT user_id AS userId, created_at AS createdAt, updated_at AS updatedAt
       FROM users ORDER BY created_at ASC`
    ),
    getSessionTurnCount: sqliteDb.prepare(
      `SELECT COUNT(*) AS turnCount FROM transcript_turns WHERE session_id = ?`
    ),
    insertProgressSnapshot: sqliteDb.prepare(
      `INSERT INTO progress_snapshots (user_id, session_id, created_at, metric, value, notes)
       VALUES (@userId, @sessionId, @timestamp, @metric, @value, @notes)`
    ),
    getProgressSnapshots: sqliteDb.prepare(
      `SELECT id, session_id AS sessionId, created_at AS createdAt, metric, value, notes
       FROM progress_snapshots
       WHERE user_id = ?
       ORDER BY created_at DESC`
    ),
  };
}

let mysqlPool = null;
let mysqlReadyPromise = null;

const initializeMySqlSchema = async (pool) => {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      user_id VARCHAR(128) PRIMARY KEY,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS user_profiles (
      user_id VARCHAR(128) PRIMARY KEY,
      display_name VARCHAR(255),
      nickname VARCHAR(255),
      avatar_url TEXT,
      birthday VARCHAR(64),
      grade_level VARCHAR(64),
      caregiver_name VARCHAR(255),
      caregiver_email VARCHAR(255),
      notes TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL,
      CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS sessions (
      session_id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(128) NOT NULL,
      created_at BIGINT NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      INDEX idx_sessions_user_created (user_id, created_at DESC)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS transcript_turns (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      session_id VARCHAR(64) NOT NULL,
      turn_index INT NOT NULL,
      timestamp BIGINT NOT NULL,
      child TEXT,
      assistant TEXT,
      CONSTRAINT fk_turns_session FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      UNIQUE KEY uniq_session_turn (session_id, turn_index)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS conversation_messages (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      session_id VARCHAR(64) NOT NULL,
      turn_index INT NOT NULL,
      message_index INT NOT NULL,
      speaker VARCHAR(32) NOT NULL,
      content TEXT NOT NULL,
      timestamp BIGINT NOT NULL,
      CONSTRAINT fk_messages_session FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      UNIQUE KEY uniq_session_turn_msg (session_id, turn_index, message_index, speaker)
    ) ENGINE=InnoDB`,
    `CREATE TABLE IF NOT EXISTS progress_snapshots (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      user_id VARCHAR(128) NOT NULL,
      session_id VARCHAR(64),
      created_at BIGINT NOT NULL,
      metric VARCHAR(255) NOT NULL,
      value DOUBLE,
      notes TEXT,
      CONSTRAINT fk_snapshots_user FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_snapshots_session FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        ON DELETE SET NULL ON UPDATE CASCADE,
      INDEX idx_snapshots_user_created (user_id, created_at DESC)
    ) ENGINE=InnoDB`,
  ];

  for (const statement of statements) {
    await pool.query(statement);
  }
};

const ensureMysqlPool = () => {
  if (!useMySql) return null;
  if (!mysqlPool) {
    const {
      DB_HOST = "localhost",
      DB_PORT,
      DB_USER,
      DB_PASSWORD,
      DB_NAME,
      DB_CONNECTION_LIMIT,
    } = process.env;

    if (!DB_USER || !DB_NAME) {
      throw new Error(
        "MySQL configuration missing. Set DB_USER and DB_NAME (and optionally DB_PASSWORD, DB_HOST, DB_PORT)."
      );
    }

    mysqlPool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT ? Number(DB_PORT) : 3306,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: DB_CONNECTION_LIMIT ? Number(DB_CONNECTION_LIMIT) : 10,
      charset: "utf8mb4",
    });

    mysqlReadyPromise = initializeMySqlSchema(mysqlPool).catch((err) => {
      console.error("Failed to initialize MySQL schema", err);
      throw err;
    });
  }
  return mysqlPool;
};

if (useMySql) {
  ensureMysqlPool();
}

const withMysql = async (fn) => {
  if (!useMySql) throw new Error("MySQL backend not enabled");
  const pool = ensureMysqlPool();
  if (mysqlReadyPromise) await mysqlReadyPromise;
  return await fn(pool);
};

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

// --- SQLite adapter -------------------------------------------------------

const sqliteAdapter = {
  async createSessionForUser(userIdRaw) {
    const userId = sanitizeUserId(userIdRaw);
    if (!userId) throw new Error("Invalid userId");
    const timestamp = Date.now();
    sqliteStatements.ensureUser.run({ userId, timestamp });
    sqliteStatements.ensureProfile.run({ userId, timestamp });
    const sessionId = randomUUID();
    sqliteStatements.deactivateSessions.run({ userId });
    sqliteStatements.insertSession.run({ sessionId, userId, timestamp });
    return { sessionId, userId, createdAt: timestamp };
  },

  async upsertUserProfile(userIdRaw, profile = {}) {
    const userId = sanitizeUserId(userIdRaw);
    if (!userId) throw new Error("Invalid userId");
    const timestamp = Date.now();
    sqliteStatements.ensureUser.run({ userId, timestamp });
    sqliteStatements.ensureProfile.run({ userId, timestamp });
    sqliteStatements.updateProfile.run({
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
    return await sqliteAdapter.getUserProfile(userId);
  },

  async getUserProfile(userIdRaw) {
    const userId = sanitizeUserId(userIdRaw);
    if (!userId) return null;
    const row = sqliteStatements.getProfile.get(userId);
    if (!row) return null;
    return {
      ...row,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },

  async getSessionById(sessionId) {
    const normalized = sanitizeSessionId(sessionId);
    if (!normalized) return null;
    const row = sqliteStatements.getSession.get(normalized);
    if (!row) return null;
    return {
      ...row,
      createdAt: row.createdAt,
    };
  },

  async findActiveSessionForUser(userIdRaw) {
    const userId = sanitizeUserId(userIdRaw);
    if (!userId) return null;
    const row = sqliteStatements.getActiveSessionForUser.get(userId);
    if (!row) return null;
    return {
      ...row,
      createdAt: row.createdAt,
    };
  },

  async getUserRecord(userIdRaw) {
    const userId = sanitizeUserId(userIdRaw);
    if (!userId) return null;
    const row = sqliteStatements.getUser.get(userId);
    if (!row) return null;
    return {
      ...row,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  },

  async getSessionLastActivity(sessionId) {
    const session = await this.getSessionById(sessionId);
    if (!session) return null;
    const row = sqliteStatements.getLastTurnTimestamp.get(sessionId);
    const lastTimestamp = row?.lastTimestamp ?? null;
    return lastTimestamp ? Math.max(Number(lastTimestamp), session.createdAt) : session.createdAt;
  },

  async appendTranscriptTurn(sessionId, child, assistant) {
    const normalizedSessionId = sanitizeSessionId(sessionId);
    if (!normalizedSessionId) throw new Error("Invalid sessionId");
    const { maxIndex } = sqliteStatements.getLatestTurnIndex.get(normalizedSessionId);
    const turnIndex = maxIndex + 1;
    const timestamp = Date.now();
    sqliteStatements.insertTurn.run({
      sessionId: normalizedSessionId,
      turnIndex,
      timestamp,
      child,
      assistant,
    });

    sqliteStatements.deleteMessagesForTurn.run({
      sessionId: normalizedSessionId,
      turnIndex,
    });

    let messageIndex = 0;
    const childContent = sanitizeText(child);
    if (childContent) {
      sqliteStatements.insertMessage.run({
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
      sqliteStatements.insertMessage.run({
        sessionId: normalizedSessionId,
        turnIndex,
        messageIndex: messageIndex++,
        speaker: "assistant",
        content: assistantContent,
        timestamp,
      });
    }

    return { index: turnIndex, timestamp, child, assistant };
  },

  async getTranscriptForSession(sessionId) {
    const normalizedSessionId = sanitizeSessionId(sessionId);
    if (!normalizedSessionId) return null;
    const session = await sqliteAdapter.getSessionById(normalizedSessionId);
    if (!session) return null;
    const turns = sqliteStatements.getTurns
      .all(normalizedSessionId)
      .map((turn) => ({
        ...turn,
        timestampIso: new Date(turn.timestamp).toISOString(),
      }));
    const messages = sqliteStatements.getMessagesForSession
      .all(normalizedSessionId)
      .map((msg) => ({
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
  },

  async getUserProgress(userIdRaw) {
    const userId = sanitizeUserId(userIdRaw);
    if (!userId) return { userId: "", sessions: [] };
    const sessions = sqliteStatements.getSessionsForUser
      .all(userId)
      .map((row) => {
        const transcript = sqliteStatements.getTurns.all(row.sessionId);
        return {
          sessionId: row.sessionId,
          createdAt: row.createdAt,
          createdAtIso: new Date(row.createdAt).toISOString(),
          active: !!row.active,
          turnCount: transcript.length,
        };
      });
    return { userId, sessions };
  },

  async recordProgressSnapshot({ userId, sessionId, metric, value, notes }) {
    const sanitizedUserId = sanitizeUserId(userId);
    if (!sanitizedUserId) throw new Error("Invalid userId");
    const sanitizedSessionId = sessionId ? sanitizeSessionId(sessionId) : null;
    const timestamp = Date.now();
    sqliteStatements.insertProgressSnapshot.run({
      userId: sanitizedUserId,
      sessionId: sanitizedSessionId,
      metric: sanitizeText(metric),
      value: typeof value === "number" ? value : null,
      notes: sanitizeText(notes),
      timestamp,
    });
    return await sqliteAdapter.getProgressSnapshots(sanitizedUserId);
  },

  async getProgressSnapshots(userIdRaw) {
    const userId = sanitizeUserId(userIdRaw);
    if (!userId) return [];
    return sqliteStatements.getProgressSnapshots.all(userId).map((row) => ({
      ...row,
      createdAtIso: new Date(row.createdAt).toISOString(),
    }));
  },

  async listUsers() {
    return sqliteStatements.listUsers.all();
  },

  async getSessionTurnCount(sessionId) {
    const row = sqliteStatements.getSessionTurnCount.get(sessionId);
    return row?.turnCount ?? 0;
  },
};

// --- MySQL adapter --------------------------------------------------------

const ensureMysqlUserShell = async (pool, userId, timestamp) => {
  await pool.execute(
    `INSERT INTO users (user_id, created_at, updated_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE updated_at=VALUES(updated_at)`,
    [userId, timestamp, timestamp]
  );
  await pool.execute(
    `INSERT INTO user_profiles (user_id, created_at, updated_at)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE updated_at=VALUES(updated_at)`,
    [userId, timestamp, timestamp]
  );
};

const mysqlAdapter = {
  async createSessionForUser(userIdRaw) {
    const userId = sanitizeUserId(userIdRaw);
    if (!userId) throw new Error("Invalid userId");
    const timestamp = Date.now();
    const sessionId = randomUUID();
    return withMysql(async (pool) => {
      await ensureMysqlUserShell(pool, userId, timestamp);
      await pool.execute(`UPDATE sessions SET active=0 WHERE user_id=?`, [userId]);
      await pool.execute(
        `INSERT INTO sessions (session_id, user_id, created_at, active)
         VALUES (?, ?, ?, 1)`,
        [sessionId, userId, timestamp]
      );
      return { sessionId, userId, createdAt: timestamp };
    });
  },

  async upsertUserProfile(userIdRaw, profile = {}) {
    const userId = sanitizeUserId(userIdRaw);
    if (!userId) throw new Error("Invalid userId");
    const timestamp = Date.now();
    await withMysql(async (pool) => {
      await ensureMysqlUserShell(pool, userId, timestamp);
      await pool.execute(
        `INSERT INTO user_profiles (
            user_id, display_name, nickname, avatar_url, birthday, grade_level,
            caregiver_name, caregiver_email, notes, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            display_name=VALUES(display_name),
            nickname=VALUES(nickname),
            avatar_url=VALUES(avatar_url),
            birthday=VALUES(birthday),
            grade_level=VALUES(grade_level),
            caregiver_name=VALUES(caregiver_name),
            caregiver_email=VALUES(caregiver_email),
            notes=VALUES(notes),
            updated_at=VALUES(updated_at)`,
        [
          userId,
          sanitizeText(profile.displayName) || null,
          sanitizeText(profile.nickname) || null,
          sanitizeText(profile.avatarUrl) || null,
          sanitizeText(profile.birthday) || null,
          sanitizeText(profile.gradeLevel) || null,
          sanitizeText(profile.caregiverName) || null,
          sanitizeText(profile.caregiverEmail) || null,
          sanitizeText(profile.notes) || null,
          timestamp,
          timestamp,
        ]
      );
    });
    return await mysqlAdapter.getUserProfile(userId);
  },

  async getUserProfile(userIdRaw) {
    const userId = sanitizeUserId(userIdRaw);
    if (!userId) return null;
    return withMysql(async (pool) => {
      const [rows] = await pool.execute(
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
         WHERE user_id = ?`,
        [userId]
      );
      const row = rows[0];
      if (!row) return null;
      return {
        ...row,
        createdAt: Number(row.createdAt),
        updatedAt: Number(row.updatedAt),
      };
    });
  },

  async getSessionById(sessionId) {
    const normalized = sanitizeSessionId(sessionId);
    if (!normalized) return null;
    return withMysql(async (pool) => {
      const [rows] = await pool.execute(
        `SELECT session_id AS sessionId, user_id AS userId, created_at AS createdAt, active
         FROM sessions WHERE session_id = ?`,
        [normalized]
      );
      const row = rows[0];
      if (!row) return null;
      return {
        ...row,
        createdAt: Number(row.createdAt),
      };
    });
  },

  async findActiveSessionForUser(userIdRaw) {
    const userId = sanitizeUserId(userIdRaw);
    if (!userId) return null;
    return withMysql(async (pool) => {
      const [rows] = await pool.execute(
        `SELECT session_id AS sessionId, user_id AS userId, created_at AS createdAt, active
         FROM sessions
         WHERE user_id = ? AND active = 1
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId]
      );
      const row = rows[0];
      if (!row) return null;
      return {
        ...row,
        createdAt: Number(row.createdAt),
      };
    });
  },

  async getUserRecord(userIdRaw) {
    const userId = sanitizeUserId(userIdRaw);
    if (!userId) return null;
    return withMysql(async (pool) => {
      const [rows] = await pool.execute(
        `SELECT user_id AS userId, created_at AS createdAt, updated_at AS updatedAt
         FROM users WHERE user_id = ?`,
        [userId]
      );
      const row = rows[0];
      if (!row) return null;
      return {
        ...row,
        createdAt: Number(row.createdAt),
        updatedAt: Number(row.updatedAt),
      };
    });
  },

  async getSessionLastActivity(sessionId) {
    return withMysql(async (pool) => {
      const [sessionRows] = await pool.execute(
        `SELECT session_id AS sessionId, created_at AS createdAt
         FROM sessions WHERE session_id = ?`,
        [sessionId]
      );
      const sessionRow = sessionRows[0];
      if (!sessionRow) return null;
      const [turnRows] = await pool.execute(
        `SELECT MAX(timestamp) AS lastTimestamp FROM transcript_turns WHERE session_id = ?`,
        [sessionId]
      );
      const turnRow = turnRows[0];
      const lastTimestamp = turnRow?.lastTimestamp ? Number(turnRow.lastTimestamp) : null;
      const createdAt = Number(sessionRow.createdAt);
      return lastTimestamp ? Math.max(lastTimestamp, createdAt) : createdAt;
    });
  },

  async appendTranscriptTurn(sessionId, child, assistant) {
    const normalizedSessionId = sanitizeSessionId(sessionId);
    if (!normalizedSessionId) throw new Error("Invalid sessionId");
    const timestamp = Date.now();
    return withMysql(async (pool) => {
      const [rows] = await pool.execute(
        `SELECT COALESCE(MAX(turn_index), 0) AS maxIndex
         FROM transcript_turns WHERE session_id = ?`,
        [normalizedSessionId]
      );
      const maxIndex = Number(rows[0]?.maxIndex || 0);
      const turnIndex = maxIndex + 1;
      await pool.execute(
        `INSERT INTO transcript_turns (session_id, turn_index, timestamp, child, assistant)
         VALUES (?, ?, ?, ?, ?)`,
        [normalizedSessionId, turnIndex, timestamp, child, assistant]
      );

      await pool.execute(
        `DELETE FROM conversation_messages WHERE session_id=? AND turn_index=?`,
        [normalizedSessionId, turnIndex]
      );

      let messageIndex = 0;
      const childContent = sanitizeText(child);
      if (childContent) {
        await pool.execute(
          `INSERT INTO conversation_messages (session_id, turn_index, message_index, speaker, content, timestamp)
           VALUES (?, ?, ?, 'child', ?, ?)`,
          [normalizedSessionId, turnIndex, messageIndex++, childContent, timestamp]
        );
      }
      const assistantContent = sanitizeText(assistant);
      if (assistantContent) {
        await pool.execute(
          `INSERT INTO conversation_messages (session_id, turn_index, message_index, speaker, content, timestamp)
           VALUES (?, ?, ?, 'assistant', ?, ?)`,
          [normalizedSessionId, turnIndex, messageIndex++, assistantContent, timestamp]
        );
      }

      return { index: turnIndex, timestamp, child, assistant };
    });
  },

  async getTranscriptForSession(sessionId) {
    const normalizedSessionId = sanitizeSessionId(sessionId);
    if (!normalizedSessionId) return null;
    return withMysql(async (pool) => {
      const [sessionRows] = await pool.execute(
        `SELECT session_id AS sessionId, user_id AS userId, created_at AS createdAt, active
         FROM sessions WHERE session_id = ?`,
        [normalizedSessionId]
      );
      const session = sessionRows[0];
      if (!session) return null;

      const [turnRows] = await pool.execute(
        `SELECT turn_index AS \`index\`, timestamp, child, assistant
         FROM transcript_turns WHERE session_id = ? ORDER BY turn_index ASC`,
        [normalizedSessionId]
      );
      const turns = turnRows.map((turn) => ({
        ...turn,
        timestamp: Number(turn.timestamp),
        timestampIso: new Date(Number(turn.timestamp)).toISOString(),
      }));

      const [messageRows] = await pool.execute(
        `SELECT turn_index AS turnIndex, message_index AS messageIndex, speaker, content, timestamp
         FROM conversation_messages WHERE session_id = ?
         ORDER BY turn_index ASC, message_index ASC`,
        [normalizedSessionId]
      );
      const messages = messageRows.map((msg) => ({
        ...msg,
        timestamp: Number(msg.timestamp),
        timestampIso: new Date(Number(msg.timestamp)).toISOString(),
      }));

      return {
        session: {
          sessionId: session.sessionId,
          userId: session.userId,
          createdAt: Number(session.createdAt),
          createdAtIso: new Date(Number(session.createdAt)).toISOString(),
          active: !!session.active,
        },
        turns,
        messages,
      };
    });
  },

  async getUserProgress(userIdRaw) {
    const userId = sanitizeUserId(userIdRaw);
    if (!userId) return { userId: "", sessions: [] };
    return withMysql(async (pool) => {
      const [rows] = await pool.execute(
        `SELECT s.session_id AS sessionId,
                s.created_at AS createdAt,
                s.active,
                COALESCE(t.turnCount, 0) AS turnCount
         FROM sessions s
         LEFT JOIN (
           SELECT session_id, COUNT(*) AS turnCount
           FROM transcript_turns
           GROUP BY session_id
         ) t ON t.session_id = s.session_id
         WHERE s.user_id = ?
         ORDER BY s.created_at DESC`,
        [userId]
      );
      const sessions = rows.map((row) => ({
        sessionId: row.sessionId,
        createdAt: Number(row.createdAt),
        createdAtIso: new Date(Number(row.createdAt)).toISOString(),
        active: !!row.active,
        turnCount: Number(row.turnCount || 0),
      }));
      return { userId, sessions };
    });
  },

  async recordProgressSnapshot({ userId, sessionId, metric, value, notes }) {
    const sanitizedUserId = sanitizeUserId(userId);
    if (!sanitizedUserId) throw new Error("Invalid userId");
    const sanitizedSessionId = sessionId ? sanitizeSessionId(sessionId) : null;
    const timestamp = Date.now();
    await withMysql(async (pool) => {
      await pool.execute(
        `INSERT INTO progress_snapshots (user_id, session_id, created_at, metric, value, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          sanitizedUserId,
          sanitizedSessionId || null,
          timestamp,
          sanitizeText(metric),
          typeof value === "number" ? value : null,
          sanitizeText(notes),
        ]
      );
    });
    return await mysqlAdapter.getProgressSnapshots(sanitizedUserId);
  },

  async getProgressSnapshots(userIdRaw) {
    const userId = sanitizeUserId(userIdRaw);
    if (!userId) return [];
    return withMysql(async (pool) => {
      const [rows] = await pool.execute(
        `SELECT id, session_id AS sessionId, created_at AS createdAt, metric, value, notes
         FROM progress_snapshots WHERE user_id = ? ORDER BY created_at DESC`,
        [userId]
      );
      return rows.map((row) => ({
        ...row,
        createdAt: Number(row.createdAt),
        createdAtIso: new Date(Number(row.createdAt)).toISOString(),
      }));
    });
  },

  async listUsers() {
    return withMysql(async (pool) => {
      const [rows] = await pool.execute(
        `SELECT user_id AS userId, created_at AS createdAt, updated_at AS updatedAt
         FROM users ORDER BY created_at ASC`
      );
      return rows.map((row) => ({
        ...row,
        createdAt: Number(row.createdAt),
        updatedAt: Number(row.updatedAt),
      }));
    });
  },

  async getSessionTurnCount(sessionId) {
    return withMysql(async (pool) => {
      const [rows] = await pool.execute(
        `SELECT COUNT(*) AS turnCount FROM transcript_turns WHERE session_id = ?`,
        [sessionId]
      );
      return Number(rows[0]?.turnCount ?? 0);
    });
  },
};

// --- Public API -----------------------------------------------------------

const adapter = useMySql ? mysqlAdapter : sqliteAdapter;

export const createSessionForUser = (userIdRaw) =>
  adapter.createSessionForUser(userIdRaw);

export const upsertUserProfile = (userIdRaw, profile = {}) =>
  adapter.upsertUserProfile(userIdRaw, profile);

export const getUserProfile = (userIdRaw) => adapter.getUserProfile(userIdRaw);

export const getSessionById = (sessionId) => adapter.getSessionById(sessionId);

export const findActiveSessionForUser = (userIdRaw) =>
  adapter.findActiveSessionForUser(userIdRaw);

export const getUserRecord = (userIdRaw) => adapter.getUserRecord(userIdRaw);

export const getSessionLastActivity = (sessionId) =>
  adapter.getSessionLastActivity(sessionId);

export const appendTranscriptTurn = (sessionId, child, assistant) =>
  adapter.appendTranscriptTurn(sessionId, child, assistant);

export const getTranscriptForSession = (sessionId) =>
  adapter.getTranscriptForSession(sessionId);

export const getUserProgress = (userIdRaw) =>
  adapter.getUserProgress(userIdRaw);

export const recordProgressSnapshot = (payload) =>
  adapter.recordProgressSnapshot(payload);

export const getProgressSnapshots = (userIdRaw) =>
  adapter.getProgressSnapshots(userIdRaw);

export const listUsers = () => adapter.listUsers();

export const getSessionTurnCount = (sessionId) =>
  adapter.getSessionTurnCount(sessionId);

export const dbPath = useMySql ? null : sqliteDbPath;
