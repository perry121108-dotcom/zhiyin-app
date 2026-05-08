// 直接 import lib 核心，跳過 pdf-parse 入口的測試執行邏輯
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
  buffer: Buffer,
  options?: Record<string, unknown>
) => Promise<{ text: string; numpages: number }>

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return Response.json({ error: '請上傳 PDF 檔案' }, { status: 400 })
    }

    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      return Response.json({ error: '僅接受 PDF 格式' }, { status: 400 })
    }

    if (file.size > 5 * 1024 * 1024) {
      return Response.json({ error: '檔案大小不可超過 5MB' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const result = await pdfParse(buffer)
    const text = result.text?.trim()

    if (!text) {
      return Response.json(
        { error: 'PDF 內容無法讀取，請確認非掃描圖片版本' },
        { status: 422 }
      )
    }

    return Response.json({ text })
  } catch (error) {
    console.error('PDF parse error:', error)
    return Response.json(
      { error: 'PDF 解析失敗，請試試另存為 .txt 後再上傳' },
      { status: 500 }
    )
  }
}
