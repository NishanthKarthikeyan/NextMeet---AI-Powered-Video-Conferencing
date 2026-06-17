# 🎥 NextMeet - AI-Powered Video Conferencing

NextMeet is a next-generation video conferencing application built with React, FastAPI, LiveKit, and Google Gemini AI. It goes beyond standard meetings by introducing intelligent AI features like real-time meeting summaries, sentiment analysis, and an innovative "AI Camera Director" that allows you to use your mobile phone as a secondary webcam over local WebRTC.

## ✨ Key Features

*   **⚡ Ultra-Low Latency Video:** Powered by [LiveKit](https://livekit.io/), supporting HD video, screen sharing, and robust room management.
*   **🤖 Real-Time AI Summaries:** Uses Google Gemini 2.0 Flash to actively listen to the meeting audio and generate real-time transcripts, summaries, and sentiment analysis.
*   **🎬 AI Camera Director (Multi-Cam):** Connect your mobile phone via a simple QR code (WebRTC Peer-to-Peer) to act as a secondary camera. An on-device AI (MediaPipe) automatically switches the broadcast feed to the camera with the best framing of your face as you move around!
*   **🔐 Secure Authentication:** Seamless user login and signup using Firebase Authentication (Google Sign-in and Email/Password).
*   **🎨 Premium UI/UX:** Built with TailwindCSS and Lucide Icons for a modern, dark-mode, glassmorphic aesthetic.

---

## 🛠️ Tech Stack

*   **Frontend:** React (Vite), TailwindCSS, LiveKit Components React, Firebase Auth, MediaPipe Tasks Vision.
*   **Backend:** Python, FastAPI, LiveKit Server SDK, Google GenAI SDK (Gemini), WebSockets.
*   **Infrastructure:** LiveKit Cloud (WebRTC), Firebase (Auth & Firestore).

---

## 🚀 Setup & Installation

Follow these steps to run NextMeet locally.

### 1. Backend Setup (Python)

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On Mac/Linux:
   source venv/bin/activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure Environment Variables:
   Create a `.env` file inside the `backend` folder and add:
   ```env
   LIVEKIT_API_KEY=your_livekit_api_key
   LIVEKIT_API_SECRET=your_livekit_api_secret
   GEMINI_API_KEY=your_gemini_api_key
   ```
5. Run the FastAPI Server:
   ```bash
   uvicorn main:app --reload --host 0.0.0.0
   ```

### 2. Frontend Setup (React/Vite)

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the Development Server:
   ```bash
   npm run dev
   ```

---

## 📱 Using the AI Camera Director

To use your mobile phone as a secondary camera:
1. Ensure your laptop and mobile phone are connected to the **same Wi-Fi network**.
2. Open a meeting room and click the **🎬 Camera Director** button in the top right.
3. Click **"Connect Mobile via QR"**.
4. Open your mobile phone's Chrome browser and type: `chrome://flags/#unsafely-treat-insecure-origin-as-secure`.
5. Enter your laptop's local IP (e.g., `http://10.1.x.x:5173`) and set it to **Enabled**, then Relaunch Chrome. *(This is required by mobile browsers to allow camera access over local HTTP).*
6. Scan the QR code on your laptop screen.
7. Click **Enable AI Director** on the laptop to start the magic!

---

*Built with ❤️ by Antigravity*
