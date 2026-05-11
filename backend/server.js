const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  })
);

app.use(express.json());

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

let notesChunks = [];

app.get("/", (req, res) => {
  res.send("StudyMate backend is running");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    gemini: getGeminiConfigSummary(),
  });
});

function getGeminiApiKeys() {
  const primaryKey = process.env.GEMINI_API_KEY || "";
  const keyList = process.env.GEMINI_API_KEYS || "";
  const numberedKeys = Object.keys(process.env)
    .filter((key) => /^GEMINI_API_KEY_\d+$/.test(key))
    .sort()
    .map((key) => process.env[key]);

  return [primaryKey, keyList, ...numberedKeys]
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function getGeminiModel(apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
  });
}

function getGeminiConfigSummary() {
  return {
    model: process.env.GEMINI_MODEL || "gemini-2.0-flash",
    keyCount: getGeminiApiKeys().length,
  };
}

async function generateGeminiAnswer(prompt) {
  const apiKeys = getGeminiApiKeys();

  if (apiKeys.length === 0) {
    const missingKeyError = new Error("GEMINI_API_KEY is missing");
    missingKeyError.status = 500;
    throw missingKeyError;
  }

  let lastError;

  for (const apiKey of apiKeys) {
    try {
      const model = getGeminiModel(apiKey);
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      lastError = error;
      const geminiError = classifyGeminiError(error);

      if (geminiError.status !== 429) {
        throw error;
      }
    }
  }

  throw lastError;
}

function getErrorStatus(error) {
  return error?.status || error?.statusCode || error?.response?.status;
}

function classifyGeminiError(error) {
  const status = getErrorStatus(error);
  const message = String(error?.message || "");
  const lowerMessage = message.toLowerCase();
  const config = getGeminiConfigSummary();

  if (status === 400 || lowerMessage.includes("api key not valid")) {
    return {
      status: 401,
      error: "Gemini API key is invalid.",
      details: `Check GEMINI_API_KEY in your backend environment, then restart or redeploy the backend. Active model: ${config.model}. Keys detected: ${config.keyCount}.`,
    };
  }

  if (status === 401 || status === 403 || lowerMessage.includes("permission")) {
    return {
      status: 403,
      error: "Gemini API key is not authorized for this request.",
      details: `Verify the key belongs to the right Google AI Studio project and has access to the selected Gemini model. Active model: ${config.model}. Keys detected: ${config.keyCount}.`,
    };
  }

  if (status === 429 || lowerMessage.includes("quota") || lowerMessage.includes("rate limit")) {
    return {
      status: 429,
      error: "Gemini usage limit reached.",
      details: `Gemini returned 429 for every configured key. Active model: ${config.model}. Keys detected: ${config.keyCount}. Add keys from a different Google Cloud/AI Studio project in GEMINI_API_KEYS, or set GEMINI_MODEL to a model with available quota, then redeploy the backend.`,
    };
  }

  return {
    status: 500,
    error: "Answer failed",
    details: message || "Unexpected Gemini error",
  };
}

function chunkText(text, size = 500) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];

  for (let i = 0; i < words.length; i += size) {
    chunks.push(words.slice(i, i + size).join(" "));
  }

  return chunks;
}

function findRelevantChunks(question, chunks, limit = 6) {
  const questionWords = question
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2);

  const scoredChunks = chunks.map((chunk) => {
    const lowerChunk = chunk.toLowerCase();
    let score = 0;

    questionWords.forEach((word) => {
      if (lowerChunk.includes(word)) {
        score++;
      }
    });

    return { chunk, score };
  });

  return scoredChunks
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.chunk);
}

app.post("/upload", upload.single("file"), async (req, res) => {
  let filePath;

  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file received" });
    }

    filePath = req.file.path;

    if (req.file.mimetype !== "application/pdf") {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: "Only PDF files are allowed" });
    }

    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);

    if (!pdfData.text || pdfData.text.trim().length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({
        error: "No readable text found in PDF. Use a text-based PDF.",
      });
    }

    notesChunks = chunkText(pdfData.text);

    fs.unlinkSync(filePath);

    return res.json({
      message: "PDF uploaded successfully",
      chunks: notesChunks.length,
    });
  } catch (error) {
    console.log("UPLOAD ERROR:", error);

    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return res.status(500).json({
      error: "Upload failed",
      details: error.message,
    });
  }
});

app.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;

    const apiKeys = getGeminiApiKeys();

    if (apiKeys.length === 0) {
      return res.status(500).json({
        error: "Gemini API key missing.",
        details: "Set GEMINI_API_KEY in your backend environment and restart the backend.",
      });
    }

    if (!question || question.trim() === "") {
      return res.status(400).json({ error: "Question is required" });
    }

    if (notesChunks.length === 0) {
      return res.status(400).json({ error: "Upload notes first" });
    }

    const relevantChunks = findRelevantChunks(question, notesChunks, 6);
    const relevantText = relevantChunks.join("\n\n");

    const prompt = `
You are StudyMate, an AI notes assistant.

Answer using only the relevant notes below.

Rules:
1. Give the answer point-wise.
2. Each point must start on a new line.
3. Use numbering like:
1. Point one
2. Point two
3. Point three
4. Do not combine points into one paragraph.
5. If answer is not found, say:
"I could not find this in the uploaded notes."

Relevant Notes:
${relevantText}

Question:
${question}
`;

    return res.json({
      answer: await generateGeminiAnswer(prompt),
    });
  } catch (error) {
    console.log("ASK ERROR:", error);

    const geminiError = classifyGeminiError(error);

    return res.status(geminiError.status).json({
      error: geminiError.error,
      details: geminiError.details,
    });
  }
});

const PORT = 8000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
