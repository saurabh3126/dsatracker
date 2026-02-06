# 🧠 DSA Tracker – Practice, Reflect & Master

A personalized full-stack platform to help students **learn**, **track**, and **retain** Data Structures and Algorithms more effectively.

---

## 🚨 Problem

Most students struggle with DSA not just because of complexity, but because they **forget key insights, intuition, and patterns** over time. While practicing problems is easy, **retaining the thought process** — the "why" and "how" — is difficult. There's no single place where students can:

- Record their own intuition & approach.
- Note pitfalls or edge cases.
- Link similar pattern-based problems.
- Track topic-wise progress visually.

---

## 💡 Solution

### 🔧 What I Built

A full-stack **DSA Tracker** that lets users:

- ✍️ **Add custom questions** they've solved.
- 💭 **Write their own intuition**, approach, and dry-run steps.
- ⚠️ **Document mistakes/pitfalls** they faced.
- 🔁 **Link similar questions** to reinforce learning patterns.
- 📊 **Track progress** by topic and difficulty.
- 🏷️ Organize questions by **tags**, **difficulty**, and **topic**.

This is more than a note-taking app — it’s a **reflection-based learning tool** designed to turn passive practice into active mastery.

---

## 🧪 Testing Focus (SDET-Relevant)

Though a full-stack product, I implemented testing practices that align with real-world QA standards:

- ✅ **Unit Testing**: Controllers for adding & updating questions (`Jest`).
- 🔗 **API Integration Tests**: Using `Supertest` for endpoints like `/add-question`, `/get-questions`.
- 🌐 **End-to-End Testing (E2E)**: Simulated user journey (register → login → add question → view progress) using `Cypress`.
- 🛠️ **Dummy App Testing Setup**: Includes basic Express server mock + test scaffolding to show readiness for testing practices.
- 🔄 **CI-ready structure** with test folders & scripts to plug into automated pipelines (e.g., GitHub Actions).

---

## 🧰 Tech Stack

| Frontend | Backend           | Database | Testing                  |
| -------- | ----------------- | -------- | ------------------------ |
| React.js | Node.js + Express | MongoDB  | Jest, Supertest, Cypress |

---

## 📸 ![alt text](image.png) ![alt text](image-1.png) ![alt text](image-2.png)

---

## 🚀 How to Run Locally

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment

- Copy `.env.example` to `.env` (same folder as `index.js`).
- Set `JWT_SECRET` to any long random string.

### 3) Connect MongoDB (Compass method)

This app uses MongoDB (at least for auth/users). The easiest local setup is:

1. Install **MongoDB Community Server** on Windows.
2. Ensure the MongoDB service is running.
3. Open **MongoDB Compass** and connect to `mongodb://127.0.0.1:27017`.
4. Keep the default `.env` value:
	- `MONGO_URI=mongodb://127.0.0.1:27017/dsa-tracker`

Mongoose will create the database/collections automatically as you use the app.

### 4) Run

```bash
# starts server (port 3001) + client (port 5173)
npm run dev

# OR: server only
npm start
```

---

## 🌍 Deploy on Render (Single Web Service)

This repo is set up so **one Render Web Service** can serve both:

- Express API under `/api/*`
- The built React app (Vite) for all other routes

### Option A: Blueprint (recommended)

1. Push to GitHub.
2. In Render: **New** → **Blueprint** → select your repo.
3. Render will read [render.yaml](render.yaml).

### Option B: Manual Render service

Create a **Web Service** and set:

- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`

### Environment variables (Render)

Set these in the Render dashboard:

- `MONGO_URI` (MongoDB Atlas connection string)
- `JWT_SECRET` (long random string)
- `REQUIRE_MONGO=true` (recommended in production)

Optional (only if you use the Quiz feature in Recently Solved):

- `AI_PROVIDER=openai` + `OPENAI_API_KEY=...`
	- OR `AI_PROVIDER=gemini` + `GEMINI_API_KEY=...`

### Notes

- The server already serves the built client from `client/dist` when present.
- React routes are handled via an SPA fallback (so deep links work).
