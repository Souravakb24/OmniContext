// Smoke test: prove headless Chromium can log in, screenshot, and record video.
const { chromium } = require('playwright')

const OUT = '/storage/sourava/RAG_Pipeline/SD/frontend/app/record/out'

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: { dir: OUT, size: { width: 1920, height: 1080 } },
  })
  const page = await context.newPage()

  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/01_login.png` })

  await page.fill('#si-org', 'IIT_Mandi')
  await page.fill('#si-user', 'rahul')
  await page.fill('#si-pass', 'pass1234')
  await page.click('.auth-submit')

  await page.waitForURL('**/app', { timeout: 20000 })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: `${OUT}/02_app.png` })

  await context.close()   // finalizes the .webm
  await browser.close()
  console.log('SMOKE OK')
})().catch(e => { console.error('SMOKE FAIL:', e.message); process.exit(1) })
