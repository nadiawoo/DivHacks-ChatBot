# DivHacks-ChatBot

This is a chatbot application that is used to aid children with speech impediments.

## Setup
1. Clone this repo.
2. Create a file `lingua/server/.env` and add the following text:
   ```
   GEMINI_API_KEY=<your Gemini API key>
   PORT=3001
   ```
   By default the server stores data locally in SQLite. To use a remote MySQL database instead, add:
   ```
   DB_CLIENT=mysql
   DB_HOST=<mysql host>
   DB_PORT=<mysql port>
   DB_USER=<mysql username>
   DB_PASSWORD=<mysql password>
   DB_NAME=<mysql database>
   SESSION_IDLE_TIMEOUT_MS=300000 # optional; new session after 5 minutes idle
   ```
3. Run `npm install` in the `lingua`, `lingua/frontend` and the `lingua/server` directories.
4. In the `lingua` directory, run `npm run dev`.

## Growth Analysis

To generate an offline growth report from stored transcripts:

```
cd lingua/server
node progress-tracker.js <userId>
```

The script pulls all sessions for the given user, scores grammar and core-word usage, and prints a trend summary for easier long-term assessment.
