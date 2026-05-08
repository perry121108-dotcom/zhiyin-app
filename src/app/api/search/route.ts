// 104人力銀行非官方端點（MVP用），正式上線換 Serper API
// 104 伺服器會阻擋 server-side 請求，fallback 使用 mock 資料
const AREA_CODES: Record<string, string> = {
  台北市: '6001001000',
  新北市: '6001002000',
  桃園市: '6001005000',
  新竹市: '6001004000',
  新竹縣: '6001010000',
  台中市: '6001008000',
  台南市: '6001014000',
  高雄市: '6001015000',
  基隆市: '6001003000',
  宜蘭縣: '6001016000',
}

export interface JobResult {
  company: string
  title: string
  salary: string
  location: string
  url: string
}

// Mock 職缺資料（104 封鎖 server-side 請求時使用；上線前換 Serper API）
function getMockJobs(keyword: string, location: string): JobResult[] {
  const loc = location || '台北市'
  const templates = [
    { company: '台灣大哥大股份有限公司', suffix: '專員' },
    { company: '富邦金融控股股份有限公司', suffix: '助理' },
    { company: '聯發科技股份有限公司', suffix: '工程師' },
    { company: '統一企業股份有限公司', suffix: '主任' },
    { company: '玉山金融控股股份有限公司', suffix: '儲備幹部' },
  ]
  return templates.map((t, i) => ({
    company: t.company,
    title: `${keyword}${t.suffix}`,
    salary: `${32 + i * 3},000 ~ ${42 + i * 3},000`,
    location: `${loc}信義區`,
    url: `https://www.104.com.tw/jobs/search/?keyword=${encodeURIComponent(keyword)}`,
  }))
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const keyword = searchParams.get('keyword') || ''
  const location = searchParams.get('location') || ''

  if (!keyword) {
    return Response.json({ error: '請提供搜尋關鍵字' }, { status: 400 })
  }

  const areaCode = AREA_CODES[location] || ''

  const params = new URLSearchParams({
    keyword,
    jobsource: '2018indexpoc',
    ro: '0',
    kwop: '7',
    page: '1',
    pagesize: '5',
    mode: 's',
    lang: 'zh-tw',
  })
  if (areaCode) params.set('area', areaCode)

  const url = `https://www.104.com.tw/jobs/search/list?${params}`

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Referer: 'https://www.104.com.tw/jobs/search/',
        Origin: 'https://www.104.com.tw',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
        'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
      },
    })

    const contentType = res.headers.get('content-type') ?? ''

    if (!res.ok || !contentType.includes('application/json')) {
      console.warn('104 blocked or returned non-JSON, using mock data')
      return Response.json({ jobs: getMockJobs(keyword, location), mock: true })
    }

    const data = await res.json()
    const list = data?.data?.list ?? []

    if (list.length === 0) {
      return Response.json({ jobs: getMockJobs(keyword, location), mock: true })
    }

    const jobs: JobResult[] = list.slice(0, 5).map((item: Record<string, unknown>) => {
      const link = item.link as Record<string, string> | undefined
      const jobPath = link?.job ?? ''
      return {
        company: String(item.custName ?? ''),
        title: String(item.jobName ?? ''),
        salary: String(item.salaryDesc ?? '薪資面議'),
        location: String(item.jobAddrNoDesc ?? ''),
        url: jobPath ? `https:${jobPath}` : 'https://www.104.com.tw',
      }
    })

    return Response.json({ jobs })
  } catch (error) {
    console.warn('104 fetch error, using mock data:', error)
    return Response.json({ jobs: getMockJobs(keyword, location), mock: true })
  }
}
