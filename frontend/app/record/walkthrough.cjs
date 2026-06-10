// Polished product walkthrough (1280x720): injected cursor + click ripple,
// caption banner, smooth scroll. NO zoom anywhere. Knowledge graph ON.
// Flow: landing -> Sign in -> login -> dashboard -> Library -> upload SELF-RAG
//   (shown Ready, fast, no zoom) -> open RAG_Research -> Ask -> query -> answer
//   -> text -> images -> captions -> sources -> PDF viewer (page + image chunk)
//   -> close PDF -> knowledge graph. Logs send/answer timestamps for fast-forward.
const fs = require('fs')
const { chromium } = require('playwright')

const OUT   = '/storage/sourava/RAG_Pipeline/SD/frontend/app/record/out'
const PDF   = '/tmp/ragcheat_demo/SELF-RAG.pdf'
const DOCNAME = 'SELF-RAG.pdf'
const BASE  = 'http://localhost:5173'
const COLL  = 'RAG_Research'
const QUERY = 'Explain the RAPTOR tree construction process and compare the tree traversal retrieval mechanism with the collapsed tree retrieval mechanism shown in Figures 1 and 2.'

const W = 1280, H = 720
let t0 = 0
const elapsed = () => Date.now() - t0

// Injected overlay: cursor, click ripple, caption banner. Fully idempotent —
// every call ensures style, elements, and listeners exist. No zoom.
const OVERLAY = () => {
  window.__caption = t => { const c = document.getElementById('__cap'); if (c) { c.textContent = t; c.classList.add('show') } }
  window.__capHide = () => { const c = document.getElementById('__cap'); if (c) c.classList.remove('show') }
  if (!document.getElementById('__ovlStyle')) {
    const style = document.createElement('style'); style.id = '__ovlStyle'
    style.textContent = `
      #__cursor{position:fixed;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;
        background:rgba(46,111,142,.30);border:2px solid #2E6F8E;box-shadow:0 0 10px rgba(46,111,142,.6);
        left:50%;top:50%;z-index:2147483647;pointer-events:none;transition:left .05s linear,top .05s linear}
      .__ripple{position:fixed;border-radius:50%;border:2.5px solid #2E6F8E;pointer-events:none;
        z-index:2147483646;animation:__rip .55s ease-out forwards}
      @keyframes __rip{from{width:10px;height:10px;margin:-5px 0 0 -5px;opacity:.9}
        to{width:60px;height:60px;margin:-30px 0 0 -30px;opacity:0}}
      #__cap{position:fixed;left:24px;bottom:24px;transform:translateY(14px);width:230px;max-width:230px;
        background:rgba(27,43,61,.93);color:#F5F1E8;font:500 16px/1.4 ui-sans-serif,system-ui,sans-serif;
        padding:16px 18px;border-radius:14px;opacity:0;transition:opacity .35s ease,transform .35s ease;
        z-index:2147483647;pointer-events:none;text-align:left;box-shadow:0 8px 28px rgba(0,0,0,.28)}
      #__cap.show{opacity:1;transform:translateY(0)}
    `
    ;(document.head || document.documentElement).appendChild(style)
  }
  if (document.body && !document.getElementById('__cursor')) {
    const cur = document.createElement('div'); cur.id = '__cursor'; document.body.appendChild(cur)
    const cap = document.createElement('div'); cap.id = '__cap'; document.body.appendChild(cap)
  }
  if (!window.__ovlListeners) {
    window.__ovlListeners = true
    addEventListener('mousemove', e => { const c = document.getElementById('__cursor'); if (c) { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px' } }, true)
    addEventListener('mousedown', e => { const r = document.createElement('div'); r.className = '__ripple'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; (document.body || document.documentElement).appendChild(r); setTimeout(() => r.remove(), 560) }, true)
  }
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: OUT, size: { width: W, height: H } },
  })
  await context.addInitScript(OVERLAY)
  const page = await context.newPage()

  // Recorder-side only: the upload is a pure visual beat. We intercept the upload
  // POST so NO real document is created or ingested — nothing is added to the
  // collection — and we drive the progress bar to 100% by hand below.
  const FAKE_DOC = '00000000-0000-4000-8000-000000000abc'
  await page.route('**/api/user/upload', async route => {
    if (route.request().method() !== 'POST') return route.continue()
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        uploaded: [{ doc_id: FAKE_DOC, filename: DOCNAME, status: 'QUEUED' }],
        failed: [], uploads_used_today: 1, uploads_remaining_today: 49,
      }),
    })
  })
  await page.route('**/api/user/document/*/status', async route => {
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ doc_id: FAKE_DOC, filename: DOCNAME, status: 'COMPLETED', error_message: null }),
    })
  })

  t0 = Date.now()

  const hold   = ms => page.waitForTimeout(ms)
  const ensure = () => page.evaluate(OVERLAY).catch(() => {})   // (re)inject overlay in current context
  const cap    = async t => { await ensure(); await page.evaluate(x => window.__caption(x), t).catch(() => {}) }
  const capOff = async () => { await page.evaluate(() => window.__capHide()).catch(() => {}) }
  const shot   = n => page.screenshot({ path: `${OUT}/${n}.png` }).catch(() => {})
  const smoothTo = async (sel, block = 'start', settle = 950) => {
    await page.locator(sel).first().evaluate((el, b) => el.scrollIntoView({ behavior: 'smooth', block: b }), block).catch(() => {})
    await hold(settle)
  }
  const glide = async (sel) => {
    const r = await page.locator(sel).first().boundingBox().catch(() => null)
    if (r) await page.mouse.move(r.x + r.width / 2, r.y + Math.min(r.height / 2, 22), { steps: 26 })
  }
  const click = async (sel) => { await glide(sel); await hold(260); await page.locator(sel).first().click() }

  // 1. Landing page
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await ensure()
  await hold(1500); await cap('Document intelligence for teams'); await hold(1700)
  await shot('s0_landing')

  // 2. Sign in -> login
  await cap('Sign in to your workspace')
  await click('.signin')
  await page.waitForSelector('#si-org', { timeout: 15000 })
  await ensure(); await hold(700)
  await page.fill('#si-org', 'IIT_Mandi'); await hold(220)
  await page.fill('#si-user', 'rahul');    await hold(220)
  await page.fill('#si-pass', 'pass1234'); await hold(320)
  await click('.auth-submit')
  await page.waitForURL('**/app', { timeout: 20000 })
  await ensure()
  await hold(1100); await cap('Your knowledge, at a glance'); await hold(1700)
  await shot('s1_dashboard')

  // 3. Library
  await cap('Documents are organized into collections')
  await click(`.app-nav:has-text("Library")`)
  await hold(1100)
  await page.mouse.wheel(0, 650); await hold(1200)
  await shot('s2_library')
  await page.mouse.wheel(0, -650); await hold(700)

  // 4. Upload — a visual beat inside the drawer; bar runs to 100% (no zoom).
  //    Nothing is actually created (the upload POST is intercepted above).
  await cap('Upload a document — parsed, chunked, embedded, indexed')
  await click(`[title="Upload to ${COLL}"]`)
  await page.waitForSelector('.drawer', { timeout: 8000 }); await hold(700)
  await page.setInputFiles('.drawer input[type="file"]', PDF)
  await page.waitForSelector('.pf-bar', { timeout: 30000 }); await hold(700)
  // drive the progress bar through the pipeline stages to Indexed (the 0.5s width
  // transition makes each step glide). DOM-only; the worker poll is 10s away.
  await page.evaluate(async () => {
    const wrap = document.querySelector('.pf-bar-wrap'); if (!wrap) return
    const fill = wrap.querySelector('.pf-bar-fill')
    const pctEl = wrap.querySelector('.pf-bar-pct')
    const labelEl = wrap.querySelector('.pf-bar-label')
    const sleep = ms => new Promise(r => setTimeout(r, ms))
    const stages = [[16,'Converting…'],[36,'Parsing…'],[56,'Chunking…'],[76,'Embedding…'],[92,'Indexing…'],[100,'Indexed']]
    for (const [p, lab] of stages) {
      if (fill) fill.style.width = p + '%'
      if (pctEl) pctEl.textContent = p + '%'
      if (labelEl) labelEl.textContent = lab
      await sleep(720)
    }
    if (fill) { fill.classList.remove('pf-bar-fill-active', 'is-anim'); fill.classList.add('pf-bar-fill-done') }
    if (labelEl) { labelEl.classList.remove('pf-bar-label-active'); labelEl.classList.add('pf-bar-label-done') }
  })
  await cap('Indexed — ready to search')
  await hold(1600)
  await shot('s3_upload')
  await capOff(); await click('.drawer-head .icon-btn'); await hold(700)

  // 5. Open the collection (doc shows Ready), then Ask
  await cap('Open a collection to see its documents')
  await click(`.col-card:has-text("${COLL}") h3`)
  await page.waitForSelector('.col-detail', { timeout: 8000 }); await hold(1900)
  await shot('s4_collection')
  await cap('Ask in plain English')
  await click('.col-detail-actions .btn-primary')   // Ask
  await page.waitForSelector('.chat-input textarea', { timeout: 8000 }); await hold(600)
  await page.locator('.graphtoggle input[type="checkbox"]').check({ force: true })  // graph on
  await hold(500)

  // 6. Query
  await page.locator('.chat-input textarea').click()
  await page.locator('.chat-input textarea').type(QUERY, { delay: 16 })
  await hold(400)
  await cap('A multi-agent pipeline retrieves, answers, verifies, and cites')
  const tSend = elapsed()
  await click('.send-btn')
  await shot('s5_streaming')

  await page.waitForSelector('.kg', { timeout: 240000 })
  await page.waitForSelector('.cite-row', { timeout: 20000 }).catch(() => {})
  const tAnswer = elapsed()

  // close auto-opened panel so the answer shows full-width from its start
  await page.locator('.ev-panel button[aria-label="Close source panel"]').click({ timeout: 4000 }).catch(() => {})
  await hold(500)

  // 7. answer text -> images -> captions -> sources
  await cap('A grounded answer, in clean prose')
  await smoothTo('.msg-ai .md-answer', 'start', 2400)
  await shot('s6_answer')

  const figs = await page.locator('.answer-figure').count()
  if (figs) {
    await cap('Relevant figures appear inline')
    await smoothTo('.answer-figure', 'center', 1500)
    await shot('s7_images')
    await cap('Open the caption for context')
    await click('.answer-figure-captoggle')      // expand caption
    await smoothTo('.answer-figure-cap', 'center', 1700)
    await shot('s7b_caption')
  }

  await cap('Every answer is cited')
  await smoothTo('.cites', 'start', 2200)
  await shot('s8_sources')

  // 8. Citation -> PDF viewer (hold on a real page + image chunk), then close
  await cap('Open any citation to see the exact source page')
  await smoothTo('.cites', 'start', 500)
  await click('.cite-row')
  await page.waitForSelector('.ev-panel.open', { timeout: 15000 }).catch(() => {})
  await page.waitForSelector('.ev-pages canvas, .ev-page-item', { timeout: 15000 }).catch(() => {})
  await hold(2600)
  // scroll within the evidence panel to reveal an image chunk on the page
  await page.locator('.ev-pages').first().evaluate(el => el.scrollBy({ top: 360, behavior: 'smooth' })).catch(() => {})
  await hold(2400)
  await shot('s9_pdf_viewer')
  await capOff()
  await page.locator('.ev-panel button[aria-label="Close source panel"]').click({ timeout: 4000 }).catch(() => {})
  await hold(800)

  // 9. Knowledge graph last
  await cap('A knowledge graph maps the entities and relations')
  await smoothTo('.kg', 'center', 1000)
  await hold(3200)
  await shot('s10_graph')

  await context.close()
  await browser.close()
  fs.writeFileSync(`${OUT}/timing.json`, JSON.stringify({ tSend, tAnswer }, null, 2))
  console.log(`OK · tSend=${tSend} tAnswer=${tAnswer} wait=${((tAnswer - tSend) / 1000).toFixed(1)}s figs=${figs}`)
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
