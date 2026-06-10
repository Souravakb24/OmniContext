// Footer.jsx
const Footer = () => (
  <footer className="mkt-footer">
    <div className="mkt-footer-inner">
      <div className="mkt-footer-brand">
        <svg viewBox="0 0 64 64" width="32" height="32" aria-hidden>
          <rect width="64" height="64" rx="14" fill="#0E1B2C" />
          <path d="M 10 36 C 18 24, 24 44, 32 32 S 46 20, 54 32" fill="none" stroke="#F5F1E8" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="32" cy="32" r="3.2" fill="#D9B271" />
        </svg>
        <p className="mkt-footer-tag">Flow through<br/>your knowledge.</p>
      </div>
      <div className="mkt-footer-cols">
        <div>
          <p className="overline">Product</p>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#changelog">Changelog</a>
        </div>
        <div>
          <p className="overline">Company</p>
          <a href="#about">About</a>
          <a href="#privacy">Privacy</a>
          <a href="#security">Security</a>
        </div>
        <div>
          <p className="overline">Build</p>
          <a href="#api">API reference</a>
          <a href="#status">Status</a>
          <a href="#contact">Contact</a>
        </div>
      </div>
    </div>
    <div className="mkt-footer-base">
      <span>© 2026 InflowMind, Inc.</span>
      <span>Made on paper.</span>
    </div>
  </footer>
);

window.Footer = Footer;
