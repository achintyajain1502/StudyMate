import { useState } from "react";
import axios from "axios";
import jsPDF from "jspdf";

function App() {
  const [file, setFile] = useState(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isAsking, setIsAsking] = useState(false);

  const downloadAnswerPDF = () => {
  if (!answer) {
    alert("No answer to download");
    return;
  }

  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("StudyMate Answer", 10, 15);

  doc.setFontSize(12);

  const lines = doc.splitTextToSize(answer, 180);
  doc.text(lines, 10, 30);

  doc.save("answer.pdf");
};

  const uploadFile = async () => {
    try {
      if (!file) {
        alert("Please select a PDF first");
        return;
      }

      if (file.type !== "application/pdf") {
        alert("Please select only a PDF file");
        return;
      }

      setIsUploading(true);
      setStatus("Uploading PDF...");
      setAnswer("");

      const formData = new FormData();
      formData.append("file", file);

      const res = await axios.post("studymate-production-897e.up.railway.app/upload", formData);

      console.log("UPLOAD SUCCESS:", res.data);

      setStatus(`Uploaded successfully.`);
      alert("PDF uploaded successfully");
    } catch (error) {
      console.log("UPLOAD FAILED:", error.response?.data || error.message);

      const message =
        error.response?.data?.details ||
        error.response?.data?.error ||
        "Upload failed";

      setStatus(message);
      alert(message);
    } finally {
      setIsUploading(false);
    }
  };

  const askQuestion = async () => {
    try {
      if (!question.trim()) {
        alert("Please enter a question");
        return;
      }

      setIsAsking(true);
      setStatus("Generating answer...");
      setAnswer("");

      const res = await axios.post("studymate-production-897e.up.railway.app/ask", {
        question,
      });

      console.log("ASK SUCCESS:", res.data);

      setAnswer(res.data.answer);
      setStatus("Answer generated successfully");
    } catch (error) {
      console.log("ASK FAILED:", error.response?.data || error.message);

      const message =
        error.response?.data?.details ||
        error.response?.data?.error ||
        "Answer failed";

      setStatus(message);
      alert(message);
    } finally {
      setIsAsking(false);
    }
  };

  return (
    
    <div style={{ padding: "30px", textAlign: "center", fontFamily: "times new roman", maxWidth: "500px",backgroundColor: "#3b66ab", margin: "50px auto", borderRadius: "10px", boxShadow: "10px 10px 10px rgba(233, 246, 134, 0.1)" }}>
      <h1>StudyMate</h1>
      <h2>AI Notes Search Engine using RAG</h2>

      <hr />

      <h3 style={{ color: "white" }}>Upload PDF Notes</h3>

      <input
        style={{ color: "white",textAlign: "justify", fontSize: "16px" }}
        type="file"
        accept="application/pdf"
        onChange={(e) => {
          const selectedFile = e.target.files[0];
          setFile(selectedFile);
          setStatus(selectedFile ? `Selected: ${selectedFile.name}` : "");
        }}
      />

      <br />
      <br />

      <button style={{ borderRadius: "10px",backgroundColor:  "#5cb85c", color: "white", padding: "10px 20px", fontSize: "16px",border: "none"}}
       onClick={uploadFile} disabled={isUploading}>
        {isUploading ? "Uploading..." : "Upload"}
      </button>

      <hr />

      <h3 style={{ color: "white" }}>Ask Question</h3>

      <input
        style={{ width: "400px", padding: "10px",borderRadius: "5px", border: "1px solid #ccc", fontSize: "16px" }}
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask from notes..."
      />

      <button onClick={askQuestion} disabled={isAsking}
        style={{ borderRadius: "10px",backgroundColor:  "#f0ad4e", color: "white", padding: "10px 20px", fontSize: "16px",border: "none"}}>
          {isAsking ? "Thinking..." : "Ask"}
      </button>

      <h3 style={{ color: "white" }}>Status</h3>
      <p style={{ textAlign: "center",color: "white" }}>{status}</p>

     <h3 style={{ color: "white" }}>Answer</h3>
<button
  onClick={() =>window.scrollTo({top: 0,behavior: "smooth",})  }
  style={{position: "fixed",bottom: "20px",right: "20px",width: "60px",height: "60px",border: "none",borderRadius: "50%",backgroundColor: "white",
    cursor: "pointer",zIndex: 9999,display: "flex",alignItems: "center",justifyContent: "center",boxShadow: "0 0 10px rgba(0,0,0,0.3)",}}>
  <img
    src="/uparrow.png"
    alt="Scroll to Top"
    style={{width: "35px",height: "35px",objectFit: "contain",}}/>
</button>
<div
  style={{color: "yellow",textAlign: "left",lineHeight: "1.8",fontSize: "20px",}}>
  {answer
    .split(/\n(?=\d+\.\s)/)
    .filter((point) => point.trim() !== "")
    .map((point, index) => (
      <p
        key={index}
        style={{
          marginBottom: "12px",
          lineHeight: "1.6",
        }}
      >
        {point.trim()}
      </p>
    ))}
</div>

<button
  onClick={downloadAnswerPDF}
  style={{borderRadius: "10px",backgroundColor: "#d9534f",color: "white",padding: "10px 20px",fontSize: "16px",border: "none",cursor: "pointer",}}>
  Download Answer
</button>
  </div>
  );
}

export default App;