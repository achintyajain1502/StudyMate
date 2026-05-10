const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

const app = express();

app.use(cors({origin: "*",methods: ["GET", "POST"],}));
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

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

app.get("/", (req, res) => {
  res.send("StudyMate backend is running");
});

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

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Gemini API key missing in .env file",
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

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return res.json({
      answer: response.text,
    });
  } catch (error) {
    if (error.message && error.message.includes("429")) {
      return res.status(429).json({
        error: "Daily Gemini quota exceeded. Try again later.",
      });
    }

    return res.status(500).json({
      error: "Answer failed",
      details: error.message,
    });
  }
});

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});