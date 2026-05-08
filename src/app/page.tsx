"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Screen = "welcome" | "chat";

type Message = {
  id: number;
  role: "ai" | "user";
  text: string;
};

type JobCard = {
  company: string;
  title: string;
  salary: string;
  location: string;
};

const quickReplies = ["我想提高薪資", "我想轉職但沒方向", "幫我看適合職缺"];

// 全局訊息 ID 計數器，避免 Date.now() 在同一毫秒重複
let _msgId = Date.now();
function nextMsgId() { return ++_msgId; }

// 每個階段的輪數上限
const STAGE_LIMITS = [5, 5]; // Stage1: 5輪, Stage2: 5輪, Stage3以後不限
const FREE_SESSIONS_PER_WEEK = 2;
const STORAGE_KEY = "zhiyin_weekly_usage";

// 根據使用者訊息數推導當前階段
function deriveStage(userCount: number): number {
  if (userCount < STAGE_LIMITS[0]) return 1;
  if (userCount < STAGE_LIMITS[0] + STAGE_LIMITS[1]) return 2;
  return 3;
}

// 取得 ISO 週字串，例如 "2026-W19"
function getISOWeek(): string {
  const now = new Date();
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const dayOfYear =
    Math.floor((now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000);
  const weekNum = Math.ceil((dayOfYear + jan4.getDay()) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

// 讀取本週使用次數（localhost 開發環境永遠回傳 0，不受限制）
function getWeeklyCount(): number {
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return 0;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return 0;
    const { week, count } = JSON.parse(raw);
    if (week !== getISOWeek()) return 0; // 跨週自動重置
    return count as number;
  } catch {
    return 0;
  }
}

// 遞增並儲存本週使用次數
function incrementWeeklyCount(): void {
  const count = getWeeklyCount() + 1;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ week: getISOWeek(), count }));
}

// 本機開發時不限制使用次數
const IS_DEV =
  typeof window !== "undefined" && window.location.hostname === "localhost";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [userMsgCount, setUserMsgCount] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [resumeText, setResumeText] = useState("");
  const [resumeFileName, setResumeFileName] = useState("");
  const [applicationRecord, setApplicationRecord] = useState("");
  const [recordFileName, setRecordFileName] = useState("");
  const [jobCards, setJobCards] = useState<JobCard[]>([]);
  const [searchCount, setSearchCount] = useState(0);
  const [weeklyRemaining, setWeeklyRemaining] = useState(FREE_SESSIONS_PER_WEEK);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const MAX_SEARCHES = 2;

  // 初始化剩餘次數（SSR 安全：只在 client 端讀取 localStorage；localhost 不扣減）
  useEffect(() => {
    if (IS_DEV) {
      setWeeklyRemaining(FREE_SESSIONS_PER_WEEK);
    } else {
      setWeeklyRemaining(FREE_SESSIONS_PER_WEEK - getWeeklyCount());
    }
  }, []);

  const stage = deriveStage(userMsgCount);
  const stageLabel =
    stage === 1
      ? "第 1 階段：整理現況"
      : stage === 2
        ? "第 2 階段：釐清方向"
        : "第 3 階段：鎖定職缺";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function streamAIResponse(
    history: Message[],
    resume = resumeText,
    record = applicationRecord
  ) {
    setIsLoading(true);

    const apiMessages = history.map((m) => ({
      role: m.role === "ai" ? ("assistant" as const) : ("user" as const),
      content: m.text,
    }));

    // 第一次進入聊天，送隱藏觸發訊息取得 AI 開場白
    if (apiMessages.length === 0) {
      apiMessages.push({ role: "user", content: "你好，請開始引導我。" });
    }

    const aiId = nextMsgId();
    setMessages((prev) => [...prev, { id: aiId, role: "ai", text: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          resumeText: resume || undefined,
          applicationRecord: record || undefined,
        }),
      });

      if (!res.ok || !res.body) throw new Error("API error");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === "ai") {
            updated[updated.length - 1] = { ...last, text: last.text + chunk };
          }
          return updated;
        });
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === "ai" && !last.text) {
          updated[updated.length - 1] = {
            ...last,
            text: "抱歉，連線出現問題，請稍後再試。",
          };
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
      // 串流結束後，檢查 AI 回覆是否含搜尋觸發指令
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "ai") return prev;

        const match = last.text.match(/\[SEARCH:([^|]*)\|([^\]]*)\]/);
        if (!match) return prev;

        // 移除觸發指令（使用者看不到）
        const cleanText = last.text.replace(/\[SEARCH:[^\]]*\]/, "").trim();
        const updated = [...prev];
        updated[updated.length - 1] = { ...last, text: cleanText };

        // 非同步觸發搜尋（不阻塞 state 更新）
        const keyword = match[1].trim();
        const location = match[2].trim();
        if (keyword) {
          setTimeout(() => triggerSearch(keyword, location), 100);
        }

        return updated;
      });
    }
  }

  async function triggerSearch(keyword: string, location: string) {
    if (searchCount >= MAX_SEARCHES) {
      setMessages((prev) => [
        ...prev,
        {
          id: nextMsgId(),
          role: "ai",
          text: "今天的搜尋次數已到，讓我幫你整理這次的結果。",
        },
      ]);
      return;
    }
    setSearchCount((c) => c + 1);

    try {
      const params = new URLSearchParams({ keyword });
      if (location) params.set("location", location);
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();

      if (data.jobs && data.jobs.length > 0) {
        setJobCards(data.jobs);
      } else {
        // 搜不到時插入 AI 訊息告知
        setMessages((prev) => [
          ...prev,
          {
            id: nextMsgId(),
            role: "ai",
            text: `目前查無「${keyword}」相關職缺，建議調整關鍵字再試。`,
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: nextMsgId(), role: "ai", text: "職缺搜尋暫時無法使用，請稍後再試。" },
      ]);
    }
  }

  function handleSend(event: FormEvent) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const nextCount = userMsgCount + 1;
    const prevStage = deriveStage(userMsgCount);
    const nextStage = deriveStage(nextCount);

    const userMsg: Message = { id: nextMsgId(), role: "user", text: trimmed };
    let newMessages = [...messages, userMsg];

    // 達到輪數上限，插入階段分隔提示（前端視覺用，不送給 AI）
    if (nextStage > prevStage && nextStage <= 3) {
      const divider: Message = {
        id: nextMsgId(),
        role: "ai",
        text: `── 進入第 ${nextStage} 階段 ──`,
      };
      newMessages = [...newMessages, divider];
    }

    setMessages(newMessages);
    setInput("");
    setUserMsgCount(nextCount);

    // 送給 AI 時不包含分隔線訊息
    const apiHistory = newMessages.filter(
      (m) => !m.text.startsWith("── 進入第")
    );
    streamAIResponse(apiHistory);
  }

  async function handleFileUpload(file: File, type: "resume" | "record") {
    setIsUploading(true);
    let text = "";

    try {
      if (file.name.endsWith(".txt")) {
        text = await file.text();
      } else if (file.name.endsWith(".pdf") || file.type === "application/pdf") {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/parse-pdf", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok || !data.text) {
          alert(data.error ?? "PDF 解析失敗，請試試另存為 .txt 後再上傳。");
          return;
        }
        text = data.text;
      } else if (
        type === "record" &&
        (file.type.startsWith("image/") || /\.(png|jpg|jpeg|webp)$/i.test(file.name))
      ) {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        text = `[應徵紀錄截圖已上傳，請根據圖片中的應徵紀錄進行分析]\n${base64}`;
      } else {
        alert("履歷請上傳 PDF 或 .txt；應徵紀錄請上傳截圖（PNG/JPG）或 .txt。");
        return;
      }

      if (type === "resume") {
        setResumeText(text);
        setResumeFileName(file.name);
      } else {
        setApplicationRecord(text);
        setRecordFileName(file.name);
      }
    } catch (err) {
      console.error("File upload error:", err);
      alert("檔案讀取失敗，請重試。");
    } finally {
      setIsUploading(false);
    }
  }

  function enterChat(resume = resumeText, record = applicationRecord) {
    if (!IS_DEV && getWeeklyCount() >= FREE_SESSIONS_PER_WEEK) {
      setIsPaywallOpen(true);
      return;
    }
    if (!IS_DEV) {
      incrementWeeklyCount();
      setWeeklyRemaining(FREE_SESSIONS_PER_WEEK - getWeeklyCount());
    }
    setScreen("chat");
    setMessages([]);
    setUserMsgCount(0);
    setJobCards([]);
    setSearchCount(0);
    streamAIResponse([], resume, record);
  }

  return (
    <main className="app-shell">
      <section className="phone-frame" aria-label="暖聊求職指南">
        <Header
          stage={stageLabel}
          showBack={screen === "chat"}
          onGoHome={() => setScreen("welcome")}
        />

        {screen === "welcome" ? (
          <WelcomeScreen
            isUploading={isUploading}
            resumeFileName={resumeFileName}
            recordFileName={recordFileName}
            weeklyRemaining={IS_DEV ? FREE_SESSIONS_PER_WEEK : weeklyRemaining}
            onStart={() => enterChat()}
            onUploadRecord={(file) => handleFileUpload(file, "record")}
            onUploadResume={(file) => handleFileUpload(file, "resume")}
          />
        ) : (
          <ChatScreen
            input={input}
            isLoading={isLoading}
            jobCards={jobCards}
            messages={messages}
            messagesEndRef={messagesEndRef}
            onInputChange={setInput}
            onOpenPaywall={() => setIsPaywallOpen(true)}
            onQuickReply={(reply) => setInput(reply)}
            onSend={handleSend}
          />
        )}

        {isPaywallOpen && (
          <PaywallModal onClose={() => setIsPaywallOpen(false)} />
        )}
      </section>
    </main>
  );
}

function Header({
  stage,
  showBack = false,
  onGoHome,
}: {
  stage: string;
  showBack?: boolean;
  onGoHome?: () => void;
}) {
  return (
    <header className="top-bar">
      <div className="brand">
        {showBack ? (
          <button
            aria-label="回到首頁"
            className="back-button"
            type="button"
            onClick={onGoHome}
          >
            ←
          </button>
        ) : (
          <span className="brand-mark" aria-hidden="true">暖</span>
        )}
        <span className="brand-name">暖聊求職</span>
      </div>
      <div className="stage-pill" aria-label={stage}>
        <span className="stage-dot" />
        {stage}
      </div>
    </header>
  );
}

function WelcomeScreen({
  isUploading,
  resumeFileName,
  recordFileName,
  weeklyRemaining,
  onStart,
  onUploadResume,
  onUploadRecord,
}: {
  isUploading: boolean;
  resumeFileName: string;
  recordFileName: string;
  weeklyRemaining: number;
  onStart: () => void;
  onUploadResume: (file: File) => void;
  onUploadRecord: (file: File) => void;
}) {
  const resumeRef = useRef<HTMLInputElement>(null);
  const recordRef = useRef<HTMLInputElement>(null);

  return (
    <div className="welcome-screen">
      <div className="welcome-copy">
        <p className="eyebrow">像朋友一樣陪你整理方向</p>
        <h1>今天先不用完美，只要把你的下一步聊清楚。</h1>
        <p>
          上傳履歷或應徵紀錄後，我會陪你找出適合的職缺類型、優先補強的經歷，以及比較安心的投遞順序。
        </p>
      </div>

      <div className="upload-actions" aria-label="上傳資料">
        <input
          ref={resumeRef}
          accept=".pdf,.txt"
          aria-hidden="true"
          style={{ display: "none" }}
          type="file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUploadResume(file);
          }}
        />
        <input
          ref={recordRef}
          accept=".txt,.png,.jpg,.jpeg,.webp"
          aria-hidden="true"
          style={{ display: "none" }}
          type="file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUploadRecord(file);
          }}
        />

        <button
          className={`upload-card${resumeFileName ? " upload-card--done" : ""}`}
          disabled={isUploading}
          type="button"
          onClick={() => resumeRef.current?.click()}
        >
          <span className="upload-icon">{isUploading ? "⋯" : resumeFileName ? "✓" : "CV"}</span>
          <span>
            <strong>{isUploading ? "上傳中，請稍候…" : resumeFileName ? "履歷已上傳" : "上傳履歷"}</strong>
            <small>{resumeFileName || "整理經歷、技能與可投方向（PDF / .txt）"}</small>
          </span>
        </button>

        <button
          className={`upload-card${recordFileName ? " upload-card--done" : ""}`}
          disabled={isUploading}
          type="button"
          onClick={() => recordRef.current?.click()}
        >
          <span className="upload-icon">{isUploading ? "⋯" : recordFileName ? "✓" : "JOB"}</span>
          <span>
            <strong>{isUploading ? "上傳中，請稍候…" : recordFileName ? "應徵紀錄已上傳" : "上傳應徵紀錄"}</strong>
            <small>{recordFileName || "截圖或文字紀錄均可（PNG / JPG / .txt）"}</small>
          </span>
        </button>
      </div>

      <button className="primary-button" type="button" onClick={onStart}>
        先從聊天開始
      </button>

      <p className="usage-hint" aria-live="polite">
        {weeklyRemaining > 0
          ? `本週還有 ${weeklyRemaining} 次免費對話`
          : "本週免費次數已用完，解鎖進階方案繼續使用"}
      </p>
    </div>
  );
}

function ChatScreen({
  input,
  isLoading,
  jobCards,
  messages,
  messagesEndRef,
  onInputChange,
  onOpenPaywall,
  onQuickReply,
  onSend,
}: {
  input: string;
  isLoading: boolean;
  jobCards: JobCard[];
  messages: Message[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onInputChange: (value: string) => void;
  onOpenPaywall: () => void;
  onQuickReply: (reply: string) => void;
  onSend: (event: FormEvent) => void;
}) {
  return (
    <div className="chat-screen">
      <div className="messages" aria-live="polite">
        {messages.map((message) => (
          <ChatBubble key={message.id} message={message} />
        ))}

        {jobCards.length > 0 && (
          <section className="job-section" aria-label="推薦職缺">
            <div className="section-title">
              <span>我先幫你挑幾個方向接近的職缺</span>
              <button type="button" onClick={onOpenPaywall}>
                解鎖完整分析
              </button>
            </div>
            {jobCards.map((job) => (
              <article
                className="job-card"
                key={`${job.company}-${job.title}`}
              >
                <div>
                  <p>{job.company}</p>
                  <h2>{job.title}</h2>
                </div>
                <dl>
                  <div>
                    <dt>薪資</dt>
                    <dd>{job.salary}</dd>
                  </div>
                  <div>
                    <dt>地點</dt>
                    <dd>{job.location}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </section>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="quick-replies" aria-label="快速回覆">
        {quickReplies.map((reply) => (
          <button key={reply} type="button" onClick={() => onQuickReply(reply)}>
            {reply}
          </button>
        ))}
      </div>

      <form className="composer" onSubmit={onSend}>
        <label className="sr-only" htmlFor="chat-input">
          輸入訊息
        </label>
        <input
          disabled={isLoading}
          id="chat-input"
          placeholder={isLoading ? "正在思考中..." : "跟我說說你現在卡在哪裡..."}
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
        />
        <button aria-label="送出訊息" disabled={isLoading} type="submit">
          送出
        </button>
      </form>
    </div>
  );
}

function ChatBubble({ message }: { message: Message }) {
  const isAi = message.role === "ai";

  // 階段分隔線
  if (message.text.startsWith("── 進入第")) {
    return <p className="stage-divider">{message.text}</p>;
  }

  return (
    <div className={isAi ? "bubble-row ai-row" : "bubble-row user-row"}>
      {isAi && (
        <div className="avatar" aria-hidden="true">AI</div>
      )}
      <p className={isAi ? "bubble ai-bubble" : "bubble user-bubble"}>
        {message.text || "▋"}
      </p>
    </div>
  );
}

function PaywallModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="paywall-title"
        aria-modal="true"
        className="paywall"
        role="dialog"
      >
        <button
          aria-label="關閉付費功能視窗"
          className="close-button"
          type="button"
          onClick={onClose}
        >
          ×
        </button>
        <p className="eyebrow">進階陪跑方案</p>
        <h2 id="paywall-title">解鎖完整求職路線圖</h2>
        <p>整理履歷亮點、職缺匹配度與面試準備清單，做成一份可以照著走的計畫。</p>
        <ul>
          <li>短中長期職涯方向規劃</li>
          <li>履歷修改建議與投遞順序</li>
          <li>自傳撰寫輔助</li>
        </ul>
        <button className="primary-button" type="button" onClick={onClose}>
          即將推出，敬請期待
        </button>
      </section>
    </div>
  );
}
