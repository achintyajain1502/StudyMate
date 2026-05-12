const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

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
    ai: getOpenAIConfigSummary(),
  });
});

function getOpenAIApiKey() {
  return (process.env.OPENAI_API_KEY || "").trim();
}

function getOpenAIModel() {
  return process.env.OPENAI_MODEL || "gpt-4.1-mini";
}

function getOpenAIConfigSummary() {
  return {
    provider: "openai",
    model: getOpenAIModel(),
    hasKey: Boolean(getOpenAIApiKey()),
  };
}

async function generateOpenAIAnswer(prompt) {
  const apiKey = getOpenAIApiKey();

  if (!apiKey) {
    const missingKeyError = new Error("OPENAI_API_KEY is missing");
    missingKeyError.status = 500;
    throw missingKeyError;
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getOpenAIModel(),
      messages: [
        {
          role: "system",
          content:
            "You are StudyMate, an AI notes assistant. Answer only from the provided notes.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const apiError = new Error(data?.error?.message || response.statusText);
    apiError.status = response.status;
    apiError.type = data?.error?.type;
    apiError.code = data?.error?.code;
    throw apiError;
  }

  return data?.choices?.[0]?.message?.content?.trim() || "";
}

function getErrorStatus(error) {
  return error?.status || error?.statusCode || error?.response?.status;
}

function classifyOpenAIError(error) {
  const status = getErrorStatus(error);
  const message = String(error?.message || "");
  const lowerMessage = message.toLowerCase();
  const config = getOpenAIConfigSummary();

  if (status === 400) {
    return {
      status: 400,
      error: "OpenAI request failed.",
      details: `${message || "Bad request."} Active model: ${config.model}.`,
    };
  }

  if (status === 401 || lowerMessage.includes("incorrect api key")) {
    return {
      status: 401,
      error: "OpenAI API key is invalid.",
      details: `Check OPENAI_API_KEY in your backend environment, then restart or redeploy the backend. Active model: ${config.model}.`,
    };
  }

  if (status === 403 || lowerMessage.includes("permission")) {
    return {
      status: 403,
      error: "OpenAI API key is not authorized for this request.",
      details: `Verify the key has access to the selected OpenAI model. Active model: ${config.model}.`,
    };
  }

  if (status === 429 || lowerMessage.includes("quota") || lowerMessage.includes("rate limit")) {
    return {
      status: 429,
      error: "OpenAI usage limit reached.",
      details: `OpenAI returned a rate-limit or quota error. Active model: ${config.model}. Check billing/usage limits or set OPENAI_MODEL to another available model, then redeploy the backend.`,
    };
  }

  return {
    status: 500,
    error: "Answer failed",
    details: message || "Unexpected OpenAI error",
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

    const apiKey = getOpenAIApiKey();

    if (!apiKey) {
      return res.status(500).json({
        error: "OpenAI API key missing.",
        details: "Set OPENAI_API_KEY in your backend environment and restart the backend.",
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
      answer: await generateOpenAIAnswer(prompt),
    });
  } catch (error) {
    console.log("ASK ERROR:", error);

    const openAIError = classifyOpenAIError(error);

    return res.status(openAIError.status).json({
      error: openAIError.error,
      details: openAIError.details,
    });
  }
});

const PORT = 8000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
