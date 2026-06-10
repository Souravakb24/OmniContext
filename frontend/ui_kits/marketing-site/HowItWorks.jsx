// HowItWorks.jsx — three-step section with an animated mini pipeline.
const PIPELINE = ["Convert", "Parse", "Chunk", "Embed", "Index"];

const MiniPipeline = () => {
  const [step, setStep] = React.useState(0);
  React.useEffect(() => {
    const id = setInterval(() => setStep(s => (s + 1) % (PIPELINE.length + 1)), 900);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="pipeline">
      {PIPELINE.map((p, i) => (
        <React.Fragment key={p}>
          <span className={`pipeline-step ${i < step ? "done" : i === step ? "active" : ""}`}>
            <span className="pipeline-dot" />
            {p}
          </span>
          {i < PIPELINE.length - 1 && <span className="pipeline-arrow">→</span>}
        </React.Fragment>
      ))}
    </div>
  );
};

const HowItWorks = () => (
  <section className="how" id="how">
    <div className="section-inner">
      <p className="eyebrow">How it works</p>
      <h2 className="section-title">Three steps. The last one is the work.</h2>
      <div className="how-grid">
        <article className="how-card">
          <span className="how-num">01</span>
          <h3>Drop your documents.</h3>
          <p>PDF, Word, or slides. Up to 50 MB each. Five a day per member while you're getting started.</p>
          <div className="how-illu">
            <div className="dropzone-mini">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#2E6F8E" strokeWidth="1.5"><path d="M12 16V4M6 10l6-6 6 6M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>
              <span>research-notes.pdf</span>
            </div>
          </div>
        </article>
        <article className="how-card">
          <span className="how-num">02</span>
          <h3>Watch the ingestion run.</h3>
          <p>We convert, parse, chunk, embed, and index — about a minute and a half for a hundred-page paper.</p>
          <div className="how-illu"><MiniPipeline /></div>
        </article>
        <article className="how-card">
          <span className="how-num">03</span>
          <h3>Ask anything.</h3>
          <p>Answers cite the exact page they came from. You read the source, not a summary of a summary.</p>
          <div className="how-illu">
            <div className="ask-mini">
              <div className="ask-q">What did the Q3 report say about churn?</div>
              <div className="ask-a">
                Churn fell to <b>3.4 %</b>, the lowest since 2022.
                <span className="cite">q3-report.pdf · p. 14</span>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>
);

window.HowItWorks = HowItWorks;
