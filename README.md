# Zhiyin App / 知音求職助理

Zhiyin App is a mobile-style AI career companion built with Next.js. It helps job seekers upload resume material, talk through career goals, receive warm guided coaching, and surface relevant job openings from 104 Job Bank or fallback mock data when the upstream service is unavailable.

知音求職助理是一個以 Next.js 建置的手機介面 AI 求職陪跑工具。它讓使用者上傳履歷與求職紀錄，透過 AI 對話釐清方向、整理履歷亮點、準備面試，並在合適時機搜尋 104 人力銀行職缺；若 104 服務阻擋或不可用，系統會回傳模擬職缺資料，維持 MVP 流程可用。

## Documentation / 說明文件

- [中文操作說明](docs/USER_GUIDE.zh-TW.md)
- [English User Guide](docs/USER_GUIDE.en.md)

## Core Features / 核心功能

- AI-guided career chat powered by Google Gemini streaming responses.
- Resume upload support for `.pdf` and `.txt` files.
- Application record upload support for `.txt`, `.png`, `.jpg`, `.jpeg`, and `.webp`.
- Staged coaching flow: self-understanding, job-fit clarification, recommendation, and follow-up guidance.
- 104 Job Bank search API route with up to 5 job cards returned per search.
- Mock job fallback when 104 blocks server-side requests or returns non-JSON responses.
- Weekly free usage gate: 2 sessions per week in production, bypassed on `localhost`.
- Per-session job search limit: 2 searches.

## Tech Stack / 技術架構

- Framework: Next.js 16 App Router
- Language: TypeScript
- UI: React 19 + CSS
- AI: Google Gemini REST API with SSE streaming
- PDF parsing: `pdf-parse`
- Deployment target: Vercel

## Quick Start / 快速啟動

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local`:

```bash
GEMINI_API_KEY=your_google_gemini_api_key
GEMINI_MODEL=gemini-2.0-flash
```

3. Start development server:

```bash
npm run dev
```

4. Open:

```text
http://localhost:3000
```

## Available Scripts / 可用指令

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Important Notes / 注意事項

- Do not commit `.env.local` or real API keys.
- `.env*` files are ignored by `.gitignore`.
- Production usage count is stored in browser `localStorage`.
- The job search integration is MVP-grade and may fall back to mock data.
- User-uploaded file text is sent to the server route and then included in the Gemini system context for the active conversation.
