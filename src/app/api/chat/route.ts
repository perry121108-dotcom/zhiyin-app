import { SYSTEM_PROMPT } from '@/lib/system-prompt'
import { ChatRequest } from '@/lib/types'

export async function POST(request: Request) {
  try {
    const body: ChatRequest = await request.json()
    const { messages, resumeText, applicationRecord } = body

    if (!messages || messages.length === 0) {
      return Response.json({ error: '沒有對話內容' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash'

    if (!apiKey) {
      return Response.json({ error: 'API Key 未設定' }, { status: 500 })
    }

    // 將履歷與應徵紀錄注入 system instruction
    let systemContent = SYSTEM_PROMPT
    if (resumeText) {
      systemContent += `\n\n---\n## 使用者履歷\n${resumeText}`
    }
    if (applicationRecord) {
      systemContent += `\n\n---\n## 使用者應徵紀錄\n${applicationRecord}`
    }

    // 轉換訊息格式（前端 'assistant' → Gemini 'model'）
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

    // 直接呼叫 Gemini REST API（SSE streaming）
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemContent }],
          },
          contents,
        }),
      }
    )

    if (!geminiRes.ok) {
      const err = await geminiRes.text()
      console.error('Gemini API error:', err)
      return Response.json({ error: '伺服器錯誤，請稍後再試' }, { status: 500 })
    }

    // 將 Gemini SSE 串流轉為純文字串流回傳前端
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        const reader = geminiRes.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') continue

            try {
              const json = JSON.parse(data)
              const text =
                json?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
              if (text) {
                controller.enqueue(encoder.encode(text))
              }
            } catch {
              // 忽略無法解析的行
            }
          }
        }
        controller.close()
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Chat API error:', error)
    return Response.json({ error: '伺服器錯誤，請稍後再試' }, { status: 500 })
  }
}
