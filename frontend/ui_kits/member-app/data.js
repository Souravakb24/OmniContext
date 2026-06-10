// data.js — fake content so the kit doesn't feel empty.
// Mirrors the API shapes from authentication_api/api.md.

window.MEMBER_DATA = {
  org: { name: "Atlas Research", id: "0f3c..." },
  user: { username: "priya", role: "admin" },
  collections: [
    { id: "c1", name: "research-papers",  description: "Peer-reviewed RAG + retrieval work.",  doc_count: 42, updated: "2 days ago" },
    { id: "c2", name: "internal-docs",    description: "Decks, briefs, retros, OKRs.",         doc_count: 18, updated: "today" },
    { id: "c3", name: "customer-calls",   description: "Transcripts from Gong + Otter.",       doc_count: 64, updated: "3 hr ago" },
    { id: "c4", name: "legal-contracts",  description: "MSAs, DPAs, vendor agreements.",       doc_count:  7, updated: "1 week ago" },
  ],
  documents: [
    { id: "d1", filename: "Attention is all you need.pdf",         ext: "pdf",  collection: "research-papers", status: "Ready",        size: "2.1 MB",  pages: 11,  uploaded: "2 days ago" },
    { id: "d2", filename: "Q3 brand brief.docx",                   ext: "docx", collection: "internal-docs",   status: "Embedding",    size: "340 KB",  pages: 8,   uploaded: "4 min ago",  progress: 78 },
    { id: "d3", filename: "All-hands April.pptx",                  ext: "pptx", collection: "internal-docs",   status: "Failed",       size: "12.4 MB", pages: 34,  uploaded: "yesterday",  error: "Password-protected." },
    { id: "d4", filename: "Northwind MSA v3.pdf",                  ext: "pdf",  collection: "legal-contracts", status: "Ready",        size: "880 KB",  pages: 22,  uploaded: "1 week ago" },
    { id: "d5", filename: "RAG survey 2025.pdf",                   ext: "pdf",  collection: "research-papers", status: "Indexing",     size: "5.4 MB",  pages: 84,  uploaded: "2 min ago",  progress: 42 },
    { id: "d6", filename: "Otter — Acme onboarding call.docx",     ext: "docx", collection: "customer-calls",  status: "Ready",        size: "112 KB", pages: 4,   uploaded: "3 hr ago" },
  ],
  pipeline: ["Uploaded","Converting","Parsing","Chunking","Embedding","Indexing","Ready"],
  ask: [
    { role: "user", text: "What did the Q3 report say about churn?" },
    { role: "ai",   text: "Churn fell to 3.4 % in Q3 — the lowest since 2022. Three factors were called out: onboarding overhaul, a price-grandfather policy, and a more attentive CS team.", cites: [
      { doc: "Q3 brand brief.docx", page: 14 },
      { doc: "All-hands April.pptx", page: 8  },
    ]},
  ],
};
