# StudyMate

StudyMate is an AI-powered Notes Search Engine using RAG concepts. It allows users to upload PDF notes and ask questions from the uploaded content. The app extracts text from the PDF, searches relevant chunks, and generates answers using Gemini AI.

## Live Demo

Frontend: https://studymate-pink.vercel.app/

## Features

- Upload PDF notes
- Ask questions from uploaded notes
- AI-generated answers
- Point-wise answer formatting
- Download answer as PDF
- Scroll-to-top button
- React frontend with Node.js backend

# Tech Stack

## Frontend
- React
- Vite
- Axios
- jsPDF

## Backend
- Node.js
- Express.js
- Multer
- pdf-parse

## AI Integration
- Google Gemini API

## Deployment
- Vercel
- Railway

### Frontend
- React
- Vite
- Axios
- jsPDF

### Backend
- Node.js
- Express.js
- Multer
- pdf-parse
- Gemini API

## Project Structure

```text
StudyMate/
├── backend/
│   ├── server.js
│   ├── package.json
│   └── uploads/
│
└── frontend/
    ├── src/
    │   └── App.jsx
    ├── public/
    └── package.json

## How It Works

1. User uploads a PDF file.
2. Backend extracts text using `pdf-parse`.
3. Text is divided into smaller chunks.
4. Relevant chunks are selected based on the user question.
5. Gemini AI generates an answer using the selected notes.
6. Answer is displayed in point-wise format.

---

# Installation

Clone the repository:

```bash
git clone https://github.com/achintyajain1502/StudyMate.git
cd StudyMate

# Backend Setup

```bash
cd backend
npm install

Create a .env file inside the backend folder:

GEMINI_API_KEY=your_gemini_api_key_here

##Run backend:

npm start

##Backend runs on:

http://localhost:8000

#Frontend Setup

##Open a new terminal:

cd frontend
npm install
npm run dev

##Frontend runs on:

http://localhost:5173

#Deployment
Frontend deployed on Vercel
Backend deployed on Railway
Environment Variables

##Backend requires:

GEMINI_API_KEY=your_gemini_api_key_here

Do not upload .env to GitHub.
