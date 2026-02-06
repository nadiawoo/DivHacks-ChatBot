import { getTranscriptForSession, getUserProfile, getUserProgress } from "./db.js";

class ProgressTracker {
  constructor(childName) {
    this.childName = childName;
    this.sessions = [];

    this.coreWords = [
      "i",
      "you",
      "he",
      "she",
      "it",
      "we",
      "they",
      "want",
      "need",
      "go",
      "stop",
      "come",
      "look",
      "see",
      "get",
      "give",
      "eat",
      "drink",
      "play",
      "help",
      "do",
      "make",
      "like",
      "dont like",
      "no",
      "yes",
      "more",
      "all done",
      "open",
      "close",
      "turn",
      "in",
      "out",
      "up",
      "down",
      "on",
      "off",
      "big",
      "little",
      "where",
      "what",
      "who",
      "my",
      "your",
      "mine",
      "happy",
      "sad",
      "mad",
      "hurt",
      "bathroom",
    ];

    this.subjects = ["i", "you", "he", "she", "it", "we", "they"];
    this.verbs = [
      "want",
      "need",
      "go",
      "stop",
      "come",
      "look",
      "see",
      "get",
      "give",
      "eat",
      "drink",
      "play",
      "help",
      "do",
      "make",
      "like",
    ];

    this.prepositions = ["to", "from", "in", "out", "on", "off", "with", "by", "under", "over"];
    this.conjunctions = ["and", "but", "because", "so", "or", "if", "when"];
    this.reflexives = ["myself", "yourself", "himself", "herself", "ourselves", "themselves"];
    this.irregularPast = ["went", "ate", "saw", "ran", "took", "made", "came", "said", "got", "gave"];

    this.variations = {
      likes: "like",
      liked: "like",
      liking: "like",
      dont: "dont like",
      cannot: "no",
      yeah: "yes",
      ok: "yes",
      happier: "happy",
      happiest: "happy",
      hurting: "hurt",
      hurts: "hurt",
      drinks: "drink",
      drinking: "drink",
      ate: "eat",
      eating: "eat",
      done: "all done",
    };
  }

  normalizeWord(word) {
    const normalized = word.toLowerCase();
    if (this.variations[normalized]) return this.variations[normalized];
    return normalized;
  }

  tokenize(input) {
    return input
      .toLowerCase()
      .replace(/[^a-z\s]/g, " ")
      .split(/\s+/)
      .map((w) => this.normalizeWord(w))
      .filter((w) => w.length > 0);
  }

  checkGrammarFeatures(words) {
    let points = 0;
    const features = [];

    for (const w of words) {
      if ((w.endsWith("s") || w.endsWith("es")) && !this.verbs.includes(w) && !this.subjects.includes(w)) {
        points++;
        features.push(`plural noun: ${w}`);
      }
      if (this.prepositions.includes(w)) {
        points++;
        features.push(`preposition: ${w}`);
      }
      if (this.conjunctions.includes(w)) {
        points++;
        features.push(`conjunction: ${w}`);
      }
      if (this.reflexives.includes(w)) {
        points++;
        features.push(`reflexive pronoun: ${w}`);
      }
      if (w.endsWith("ed") || this.irregularPast.includes(w)) {
        points++;
        features.push(`past tense: ${w}`);
      }
    }

    if (words.includes("will")) {
      points++;
      features.push("future tense: will");
    }
    if (words.includes("going") && words.includes("to")) {
      points++;
      features.push("future tense: going to");
    }

    return { points, features };
  }

  analyzeUtterance(input, aiResponse = "") {
    const words = this.tokenize(input);
    const grammarFeatures = this.checkGrammarFeatures(words);
    const coreWordsUsed = [...new Set(words.filter((w) => this.coreWords.includes(w)))];

    return {
      text: input,
      aiResponse,
      wordCount: words.length,
      coreWordsUsed,
      advancedGrammar: grammarFeatures,
    };
  }

  startSession(sessionMeta) {
    this.currentSession = {
      sessionId: sessionMeta.sessionId,
      createdAt: sessionMeta.createdAt,
      utterances: [],
    };
  }

  addUtterance(input, aiResponse = "") {
    if (!this.currentSession) throw new Error("Session not started");
    const analysis = this.analyzeUtterance(input, aiResponse);
    this.currentSession.utterances.push(analysis);
  }

  endSession() {
    if (!this.currentSession) return;
    this.sessions.push(this.currentSession);
    this.currentSession = null;
  }

  summarizeSessions() {
    return this.sessions.map((session) => {
      const totalWords = session.utterances.reduce((sum, u) => sum + u.wordCount, 0);
      const totalGrammar = session.utterances.reduce((sum, u) => sum + u.advancedGrammar.points, 0);
      const uniqueCoreWords = new Set();
      session.utterances.forEach((u) => u.coreWordsUsed.forEach((word) => uniqueCoreWords.add(word)));

      return {
        sessionId: session.sessionId,
        createdAt: session.createdAt,
        utteranceCount: session.utterances.length,
        averageWords: session.utterances.length ? totalWords / session.utterances.length : 0,
        totalGrammarPoints: totalGrammar,
        coreWordDiversity: uniqueCoreWords.size,
      };
    });
  }

  buildGrowthSummary() {
    const summaries = this.summarizeSessions();
    if (!summaries.length) {
      return {
        childName: this.childName,
        sessions: [],
        trends: {},
      };
    }

    const grammarTrend = summaries.map((s) => s.totalGrammarPoints);
    const coreWordTrend = summaries.map((s) => s.coreWordDiversity);
    const utteranceTrend = summaries.map((s) => s.utteranceCount);

    return {
      childName: this.childName,
      sessions: summaries,
      trends: {
        grammarPoints: grammarTrend,
        coreWordDiversity: coreWordTrend,
        utteranceCount: utteranceTrend,
      },
    };
  }

  static renderReport(summary) {
    if (!summary.sessions.length) {
      return `No sessions available for ${summary.childName}.`;
    }

    const lines = [`Growth Report for ${summary.childName}`, ""]; 
    summary.sessions.forEach((session, index) => {
      lines.push(
        `Session ${index + 1} (${new Date(session.createdAt).toLocaleString()}):`,
        `  Utterances: ${session.utteranceCount}`,
        `  Avg words per utterance: ${session.averageWords.toFixed(2)}`,
        `  Total grammar points: ${session.totalGrammarPoints}`,
        `  Core word diversity: ${session.coreWordDiversity}`,
        ""
      );
    });

    lines.push(
      "Trends:",
      `  Grammar points per session: ${summary.trends.grammarPoints.join(", ")}`,
      `  Core word diversity per session: ${summary.trends.coreWordDiversity.join(", ")}`,
      `  Utterance count per session: ${summary.trends.utteranceCount.join(", ")}`
    );

    return lines.join("\n");
  }
}

export const analyzeUserGrowth = async (userId) => {
  const sanitizedUserId = userId?.trim();
  if (!sanitizedUserId) throw new Error("User ID is required");

  const [profile, progress] = await Promise.all([
    getUserProfile(sanitizedUserId),
    getUserProgress(sanitizedUserId),
  ]);

  const tracker = new ProgressTracker(profile?.displayName || sanitizedUserId);

  for (const sessionInfo of progress.sessions.sort((a, b) => a.createdAt - b.createdAt)) {
    const transcript = await getTranscriptForSession(sessionInfo.sessionId);
    if (!transcript || !transcript.turns.length) continue;
    tracker.startSession({
      sessionId: transcript.session.sessionId,
      createdAt: transcript.session.createdAt,
    });

    transcript.turns.forEach((turn) => {
      const childUtterance = turn.child?.trim();
      const assistantReply = turn.assistant?.trim();
      if (childUtterance) {
        tracker.addUtterance(childUtterance, assistantReply || "");
      }
    });

    tracker.endSession();
  }

  return tracker.buildGrowthSummary();
};

export const generateUserGrowthReport = async (userId) => {
  const summary = await analyzeUserGrowth(userId);
  return ProgressTracker.renderReport(summary);
};

export default ProgressTracker;

if (import.meta.url === `file://${process.argv[1]}`) {
  const userId = process.argv[2];
  if (!userId) {
    console.error("Usage: node progress-tracker.js <userId>");
    process.exit(1);
  }

  generateUserGrowthReport(userId)
    .then((report) => {
      console.log(report);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Failed to generate growth report", err);
      process.exit(1);
    });
}
