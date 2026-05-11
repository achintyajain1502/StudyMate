import { useMemo, useState } from "react";
import axios from "axios";
import jsPDF from "jspdf";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://studymate-backend-mu7z.onrender.com";

function App() {
  const [file, setFile] = useState(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState({
    type: "idle",
    title: "Ready when your notes are.",
    message: "Upload a PDF, then ask StudyMate a question from it.",
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isAsking, setIsAsking] = useState(false);

  const answerPoints = useMemo(
    () =>
      answer
        .split(/\n(?=\d+\.\s)/)
        .map((point) => point.trim())
        .filter(Boolean),
    [answer]
  );

  const setErrorStatus = (fallbackTitle, error) => {
    const data = error.response?.data;
    const statusCode = error.response?.status;
    const title =
      data?.error ||
      (statusCode === 429 ? "Gemini usage limit reached." : fallbackTitle);
    const message =
      data?.details ||
      (statusCode === 429
        ? "Your Gemini project is currently rate-limited or out of quota. Add a fresh backend key, set GEMINI_API_KEYS for backups, then redeploy the backend."
        : error.message || "Please try again.");

    setStatus({
      type: "error",
      title,
      message,
    });
  };

  const downloadAnswerPDF = () => {
    if (!answer) {
      setStatus({
        type: "error",
        title: "No answer to download.",
        message: "Ask a question first, then download the answer as a PDF.",
      });
      return;
    }

    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("StudyMate Answer", 10, 15);

    doc.setFontSize(12);
    const lines = doc.splitTextToSize(answer, 180);
    doc.text(lines, 10, 30);
    doc.save("studymate-answer.pdf");
  };

  const uploadFile = async () => {
    try {
      if (!file) {
        setStatus({
          type: "error",
          title: "Choose a PDF first.",
          message: "StudyMate needs one text-based PDF before it can answer.",
        });
        return;
      }

      if (file.type !== "application/pdf") {
        setStatus({
          type: "error",
          title: "Only PDFs are supported.",
          message: "Select a text-based PDF file and upload it again.",
        });
        return;
      }

      setIsUploading(true);
      setAnswer("");
      setStatus({
        type: "loading",
        title: "Uploading notes...",
        message: "Reading your PDF and preparing searchable chunks.",
      });

      const formData = new FormData();
      formData.append("file", file);

      const res = await axios.post(`${API_BASE_URL}/upload`, formData);

      setStatus({
        type: "success",
        title: "Notes uploaded.",
        message: `${res.data.chunks || "Your"} chunks are ready for questions.`,
      });
    } catch (error) {
      setErrorStatus("Upload failed.", error);
    } finally {
      setIsUploading(false);
    }
  };

  const askQuestion = async () => {
    try {
      if (!question.trim()) {
        setStatus({
          type: "error",
          title: "Enter a question.",
          message: "Ask something specific from your uploaded notes.",
        });
        return;
      }

      setIsAsking(true);
      setAnswer("");
      setStatus({
        type: "loading",
        title: "Generating answer...",
        message: "Finding the most relevant note sections.",
      });

      const res = await axios.post(`${API_BASE_URL}/ask`, {
        question,
      });

      setAnswer(res.data.answer || "");
      setStatus({
        type: "success",
        title: "Answer generated.",
        message: "StudyMate answered using the uploaded notes.",
      });
    } catch (error) {
      setErrorStatus("Answer failed.", error);
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <main className="app-shell">
      <section className="hero-panel" aria-labelledby="app-title">
        <div>
          <p className="eyebrow">AI notes assistant</p>
          <h1 id="app-title">StudyMate</h1>
          <p className="hero-copy">
            Upload lecture notes, ask focused questions, and keep clean answers ready to
            download.
          </p>
        </div>
        <div className="service-pill">
          <span className={`status-dot ${status.type}`} />
          <span>{status.title}</span>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="panel">
          <div className="panel-heading">
            <span className="step">01</span>
            <div>
              <h2>Upload PDF Notes</h2>
              <p>Use a text-based PDF for the best results.</p>
            </div>
          </div>

          <label className="file-drop">
            <input
              type="file"
              accept="application/pdf"
              onChange={(event) => {
                const selectedFile = event.target.files[0] || null;
                setFile(selectedFile);
                setStatus({
                  type: selectedFile ? "idle" : "error",
                  title: selectedFile ? "PDF selected." : "No file selected.",
                  message: selectedFile
                    ? selectedFile.name
                    : "Choose a PDF before uploading.",
                });
              }}
            />
            <span className="file-icon">PDF</span>
            <strong>{file ? file.name : "Choose your notes"}</strong>
            <small>{file ? "Ready to upload" : "PDF files up to 10 MB"}</small>
          </label>

          <button className="primary-button" onClick={uploadFile} disabled={isUploading}>
            {isUploading ? "Uploading..." : "Upload Notes"}
          </button>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <span className="step">02</span>
            <div>
              <h2>Ask a Question</h2>
              <p>Be specific so the answer can stay grounded in your notes.</p>
            </div>
          </div>

          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Example: Explain the main points of unit 2..."
            rows={5}
          />

          <button className="accent-button" onClick={askQuestion} disabled={isAsking}>
            {isAsking ? "Thinking..." : "Ask StudyMate"}
          </button>
        </div>
      </section>

      <section className={`status-banner ${status.type}`} role="status">
        <strong>{status.title}</strong>
        <span>{status.message}</span>
      </section>

      <section className="answer-panel">
        <div className="answer-heading">
          <div>
            <p className="eyebrow">Response</p>
            <h2>Answer</h2>
          </div>
          <button className="ghost-button" onClick={downloadAnswerPDF} disabled={!answer}>
            Download PDF
          </button>
        </div>

        {answerPoints.length > 0 ? (
          <div className="answer-list">
            {answerPoints.map((point, index) => (
              <p key={index}>{point}</p>
            ))}
          </div>
        ) : (
          <div className="empty-answer">
            <strong>Your answer will appear here.</strong>
            <span>Upload notes and ask a question to get a numbered response.</span>
          </div>
        )}
      </section>

      <button
        className="scroll-top"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Scroll to top"
      >
        <img src="/uparrow.png" alt="" />
      </button>
    </main>
  );
}

export default App;
