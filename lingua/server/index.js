import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/", (req, res) => res.send("Server is running ✅"));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ API on http://localhost:${PORT}`));
