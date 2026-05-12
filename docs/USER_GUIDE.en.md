# Zhiyin App: Complete English User Guide

## 1. App Overview

Zhiyin App is an AI-powered job search companion. It helps users reduce job-search anxiety, clarify career direction, organize resume strengths, prepare for interviews, and move toward concrete next steps.

The app uses a mobile-style interface. Users can upload a resume and application records before entering the AI chat. The AI uses the conversation, uploaded resume text, and application record context to guide the user through a staged coaching flow. When appropriate, the AI can trigger a job search and display job cards inside the chat.

## 2. Target Users

- Job seekers who are unsure about their career direction.
- Users who want to turn resume content into a clearer job-search story.
- Users who need help preparing self-introductions or interview answers.
- Users who want to quickly inspect job openings related to their background.
- Users who prefer a warm, low-pressure conversational flow.

## 3. Core Features

### 3.1 AI Career Chat

After the user enters the chat, the frontend calls `/api/chat`. The route sends conversation history, resume text, and application record text to Google Gemini. Responses are streamed back to the UI, creating a real-time chat experience.

The AI is designed as a guided career companion, not a generic chatbot. It first understands the user's situation, then helps clarify strengths and preferences, and finally moves toward job recommendations and action planning.

### 3.2 Resume Upload

The welcome screen supports resume upload.

Supported formats:

- `.pdf`
- `.txt`

PDF files are parsed into plain text through `/api/parse-pdf`. The PDF size limit is 5MB. If parsing fails, the user should upload a `.txt` version instead.

### 3.3 Application Record Upload

The welcome screen also supports uploading application records, such as previous applications, job screenshots, interview notes, or structured notes.

Supported formats:

- `.txt`
- `.png`
- `.jpg`
- `.jpeg`
- `.webp`

Text files are read directly. Image files are converted to Base64 text markers and inserted into the conversation context. This is an MVP-level implementation; the actual usefulness depends on future AI and prompt improvements.

### 3.4 Staged Coaching Flow

The app advances stages based on the number of user messages.

Current frontend rules:

- Stage 1: first 5 user messages, focused on self-understanding and initial clarification.
- Stage 2: user messages 6 to 10, focused on job-fit and condition clarification.
- Stage 3: message 11 onward, focused on recommendations, strategy, and next steps.

The current stage is shown in the top bar. When a stage changes, a divider message is inserted into the chat.

### 3.5 Job Search

The AI can trigger job search with this internal format:

```text
[SEARCH:keyword|location]
```

When the frontend detects this marker, it calls `/api/search`. The server attempts to search 104 Job Bank and returns up to 5 job cards.

Each job card includes:

- Company name
- Job title
- Salary
- Location

If 104 blocks server-side requests, returns non-JSON content, returns no results, or encounters a network error, the app returns mock job data so the MVP flow remains usable.

### 3.6 Weekly Usage Limit

In production, each browser gets 2 free chat sessions per week. Usage is stored in browser `localStorage` under this key:

```text
zhiyin_weekly_usage
```

On `localhost`, the weekly limit is bypassed for development and testing.

### 3.7 Per-Session Search Limit

Each chat session can trigger up to 2 job searches. This prevents the AI from over-searching and reduces dependence on unstable external responses.

### 3.8 Paywall Modal

When the weekly free usage limit is reached, or when the user clicks the advanced option in the job section, a paywall modal appears. This is currently an MVP interface only and is not connected to a real payment flow.

## 4. End-User Instructions

### 4.1 Open the Welcome Screen

When the user opens the website, they see a mobile-style welcome screen with:

- Brand area
- Resume upload button
- Application record upload button
- Start chat button
- Remaining weekly free session hint

### 4.2 Upload a Resume

1. Click the resume upload area.
2. Select a `.pdf` or `.txt` file.
3. After upload succeeds, the button state changes and the filename appears.
4. If the file is unsupported or PDF parsing fails, the app shows an alert.

### 4.3 Upload Application Records

1. Click the application record upload area.
2. Select a `.txt`, `.png`, `.jpg`, `.jpeg`, or `.webp` file.
3. After upload succeeds, the button state changes and the filename appears.

### 4.4 Start a Chat

1. Click the start chat button.
2. If free usage remains, the app opens the chat screen.
3. The app sends an initial message to ask the AI to begin guiding the user.
4. The user can type messages in the input field at the bottom.
5. While the AI is responding, the input field is temporarily disabled.

### 4.5 Use Quick Replies

The chat screen includes quick reply buttons near the bottom. Clicking one fills the input field. The user still needs to send the message.

### 4.6 View Job Cards

When the AI triggers a search and `/api/search` returns jobs, a job section appears in the chat. Users can view company, title, salary, and location.

The backend job result includes a `url` field, but the current UI does not expose an external link button yet. This can be added in a future release.

### 4.7 Return to the Welcome Screen

The chat screen has a back button in the top-left area. Returning to the welcome screen and starting again resets the current conversation, stage, job cards, and per-session search count.

## 5. Admin and Developer Instructions

### 5.1 Install Dependencies

```bash
npm install
```

### 5.2 Configure Environment Variables

Create `.env.local` in the project root:

```bash
GEMINI_API_KEY=your_google_gemini_api_key
GEMINI_MODEL=gemini-2.0-flash
```

Required:

- `GEMINI_API_KEY`: Google Gemini API key.

Optional:

- `GEMINI_MODEL`: Gemini model name. Defaults to `gemini-2.0-flash` if omitted.

Never commit `.env.local` or real API keys to GitHub.

### 5.3 Run Locally

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

### 5.4 Build

```bash
npm run build
```

### 5.5 Start Production Build

```bash
npm run start
```

### 5.6 Lint

```bash
npm run lint
```

### 5.7 Deploy to Vercel

1. Connect the repository to Vercel.
2. Set environment variables in Vercel Project Settings:
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL`
3. Deploy the main branch.
4. After deployment, test the welcome screen, chat, PDF upload, and job search.

## 6. API Reference

### 6.1 `POST /api/chat`

Purpose: generate AI chat responses.

Request body:

```json
{
  "messages": [
    {
      "role": "user",
      "content": "I want to find a frontend job"
    }
  ],
  "resumeText": "Optional resume text",
  "applicationRecord": "Optional application record"
}
```

Behavior:

- Loads `SYSTEM_PROMPT`.
- Adds resume and application record content to the system context.
- Calls Gemini `streamGenerateContent`.
- Converts Gemini SSE chunks into plain text streaming output.

Common errors:

- Missing messages: returns 400.
- Missing `GEMINI_API_KEY`: returns 500.
- Gemini API error: returns 500.

### 6.2 `POST /api/parse-pdf`

Purpose: parse PDF resumes.

Request:

- `multipart/form-data`
- Field name: `file`

Limits:

- PDF only.
- File size must be 5MB or less.
- If no text can be extracted, the route returns 422.

Response:

```json
{
  "text": "Extracted PDF text"
}
```

### 6.3 `GET /api/search`

Purpose: search jobs.

Query parameters:

- `keyword`: required, job keyword.
- `location`: optional, location.

Example:

```text
/api/search?keyword=frontend%20engineer&location=Taipei
```

Response:

```json
{
  "jobs": [
    {
      "company": "Company name",
      "title": "Job title",
      "salary": "Salary",
      "location": "Location",
      "url": "Job URL"
    }
  ]
}
```

If mock fallback is used, the response also includes:

```json
{
  "mock": true
}
```

## 7. Data and Privacy Notes

- Resume and application record content is sent to the backend API and inserted into the Gemini conversation context.
- The current project does not use a database, so chat history is not persistently stored by the backend.
- Usage count is stored in the user's browser `localStorage`.
- Before production launch, add a privacy policy, data deletion policy, and clearer user consent language.

## 8. Known Limitations

- 104 Job Bank may block server-side requests, so mock fallback is built in.
- The paywall modal is not connected to a real payment system.
- Job cards do not yet expose the backend `url` field in the UI.
- Image application records are stored as Base64 context, not OCR text.
- Weekly free usage is browser-based, not account-based.
- `TASK.md`, `WORKLOG.md`, and some Chinese code comments may appear garbled in certain terminals; future cleanup should normalize file encoding and text.

## 9. Troubleshooting

### The AI does not respond

Check:

- `.env.local` exists.
- `GEMINI_API_KEY` is valid.
- Gemini API quota is available.
- `npm run dev` or Vercel logs do not show 500 errors.

### PDF upload fails

Check:

- The file is a PDF.
- The file is smaller than 5MB.
- The PDF contains selectable text.
- If the PDF is scanned image-only, upload a text version instead.

### Job cards look fake

This means 104 returned unexpected content, blocked the server request, or no data was available. The MVP automatically falls back to mock data. For production, use a stable search API or maintain an internal job data source.

### Free usage is exhausted

Production allows 2 sessions per week per browser. For development, use localhost or clear `zhiyin_weekly_usage` from browser localStorage.

## 10. Suggested Future Improvements

- Add real account and payment flows.
- Store conversation history and job-search progress in a database.
- Add external links and save actions to job cards.
- Add OCR for image-based application records.
- Integrate a more reliable job search provider.
- Add full UI internationalization.
- Add resume rewriting, interview practice, and application tracking features.
