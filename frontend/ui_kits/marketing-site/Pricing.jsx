// Pricing.jsx — three-tier pricing table.
const TIERS = [
  {
    name: "Reader",
    price: "Free",
    note: "For a single researcher",
    cta: "Start free",
    primary: false,
    features: [
      "10 documents total",
      "1 collection",
      "5 uploads / day",
      "Personal use only",
    ],
  },
  {
    name: "Team",
    price: "$24",
    unit: "/ member / month",
    note: "For research and product teams",
    cta: "Start free for 14 days",
    primary: true,
    features: [
      "Unlimited documents",
      "10 collections",
      "50 docs / collection",
      "Admin controls + audit log",
      "Email support",
    ],
  },
  {
    name: "Org",
    price: "Talk to us",
    note: "For legal, biotech, regulated",
    cta: "Contact sales",
    primary: false,
    features: [
      "Custom collection limits",
      "SSO + SCIM",
      "Data residency choice",
      "Training opt-out by default",
      "Named CSM",
    ],
  },
];

const Pricing = () => (
  <section className="pricing" id="pricing">
    <div className="section-inner">
      <p className="eyebrow">Pricing</p>
      <h2 className="section-title">Three plans. No seat upsells in the middle of a sentence.</h2>
      <div className="pricing-grid">
        {TIERS.map(t => (
          <article key={t.name} className={`tier ${t.primary ? "tier-primary" : ""}`}>
            <div className="tier-head">
              <h3>{t.name}</h3>
              {t.primary && <span className="tier-tag">Most chosen</span>}
            </div>
            <div className="tier-price">
              <span className="tier-amount">{t.price}</span>
              {t.unit && <span className="tier-unit">{t.unit}</span>}
            </div>
            <p className="tier-note">{t.note}</p>
            <ul className="tier-features">
              {t.features.map(f => (
                <li key={f}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M20 6 9 17l-5-5"/></svg>
                  {f}
                </li>
              ))}
            </ul>
            <button className={`btn ${t.primary ? "btn-primary" : "btn-secondary"} btn-block`}>{t.cta}</button>
          </article>
        ))}
      </div>
    </div>
  </section>
);

window.Pricing = Pricing;
