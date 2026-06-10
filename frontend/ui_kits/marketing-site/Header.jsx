// Header.jsx — sticky marketing nav. Blurs background on scroll past 80 px.
const Header = () => {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const on = () => setScrolled(window.scrollY > 80);
    window.addEventListener("scroll", on);
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`mkt-header ${scrolled ? "scrolled" : ""}`}>
      <div className="mkt-header-inner">
        <a href="#top" className="mkt-brand">
          <svg viewBox="0 0 64 64" width="28" height="28" aria-hidden>
            <rect width="64" height="64" rx="14" fill="#0E1B2C" />
            <path d="M 10 36 C 18 24, 24 44, 32 32 S 46 20, 54 32" fill="none" stroke="#F5F1E8" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="32" cy="32" r="3.2" fill="#D9B271" />
          </svg>
          <span>InflowMind</span>
        </a>
        <nav className="mkt-nav">
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#docs">Docs</a>
        </nav>
        <div className="mkt-cta">
          <a href="#signin" className="mkt-link">Sign in</a>
          <a href="#start" className="btn btn-primary">Start free</a>
        </div>
      </div>
    </header>
  );
};

window.Header = Header;
