import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import converseRouter from "./routes/converse.js";
import illustrateRouter from "./routes/illustrate.js";
import ttsRouter from "./routes/tts.js";
import dataRouter from "./routes/data.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Gemini API server is running!");
});

app.use("/api/converse", converseRouter);
app.use("/api/illustrate", illustrateRouter);
app.use("/api/tts", ttsRouter);
app.use("/api/data", dataRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server ready on http://localhost:${PORT}`));
