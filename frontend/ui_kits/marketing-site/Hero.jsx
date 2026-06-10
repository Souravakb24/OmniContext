// Hero.jsx — full-bleed hero with flow-line motif and animated wordmark.
const Hero = () => (
  <section className="hero" id="top">
    <svg className="hero-flow" viewBox="0 0 1200 400" preserveAspectRatio="none" aria-hidden>
      <path d="M -20 220 C 120 160, 240 320, 380 220 S 620 130, 760 220 S 1000 320, 1220 200" fill="none" stroke="#2E6F8E" strokeWidth="1.5" strokeLinecap="round" opacity="0.55" />
      <path d="M -20 260 C 140 200, 260 360, 400 260 S 640 170, 780 260 S 1020 350, 1220 240" fill="none" stroke="#2E6F8E" strokeWidth="1.5" strokeLinecap="round" opacity="0.30" />
      <path d="M -20 180 C 100 120, 220 280, 360 180 S 600 90, 740 180 S 980 280, 1220 160" fill="none" stroke="#2E6F8E" strokeWidth="1.5" strokeLinecap="round" opacity="0.18" />
    </svg>
    <div className="hero-inner">
      <p className="eyebrow">For research, legal, and product teams</p>
      <h1 className="hero-title">
        Flow through<br/>
        your <em>knowledge.</em>
      </h1>
      <p className="hero-lede">
        InflowMind turns the stack of PDFs your team keeps re-sharing into one searchable, citable mind. Drop a document, get answers with the page already open.
      </p>
      <div className="hero-cta">
        <a href="#start" className="btn btn-primary btn-lg">Start free — 10 documents</a>
        <a href="#how" className="mkt-link mkt-link-arrow">See the pipeline →</a>
      </div>
      <div className="hero-logos">
        <span>Trusted by teams at</span>
        <div className="hero-logos-row">
          <span>IIT Mandi</span>
          <span>·</span>
          <span>Atlas Legal</span>
          <span>·</span>
          <span>Northwind Bio</span>
          <span>·</span>
          <span>Quill &amp; Co.</span>
        </div>
      </div>
    </div>
  </section>
);

window.Hero = Hero;
