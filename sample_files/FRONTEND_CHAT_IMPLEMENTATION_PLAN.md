# Frontend Chat System — Implementation Plan

## Stack Assumptions
- Framework: React (Next.js or Vite — your choice)
- State: Zustand or Redux Toolkit
- HTTP: `fetch` (native SSE via `EventSource` or `fetch` stream)
- Graph rendering: React Flow / Cytoscape.js / D3 force graph
- Styling: Tailwind CSS

---

## 1. Overall Page Layout

```
┌─────────────────────────────────────────────────────────┐
│  Sidebar (left)         │  Chat Window (right)           │
│                         │                                │
│  [+ New Chat]           │  ┌─ Chat Header ─────────────┐ │
│                         │  │ Collection: Research Papers│ │
│  ─────────────────      │  └───────────────────────────┘ │
│  Past Conversations     │                                │
│  ─────────────────      │  ┌─ Message Thread ───────────┐ │
│  > What is Gemma 3...   │  │  [User]  Turn 1 query      │ │
│    research-papers      │  │  [AI]    Turn 1 answer      │ │
│    7 turns · 2h ago     │  │                            │ │
│                         │  │  [User]  Turn 2 query      │ │
│  > My Education         │  │  [AI]    Turn 2 answer      │ │
│    Manas_Lab            │  │                            │ │
│    2 turns · 5h ago     │  │  ── Agent Progress ──────  │ │
│                         │  │  [Rewriting query...]      │ │
│                         │  │  [Retrieving chunks...]    │ │
│                         │  │  [Generating answer...]    │ │
│                         │  └───────────────────────────┘ │
│                         │                                │
│                         │  ┌─ Graph Panel (if is_graph)─┐ │
│                         │  │  [Knowledge Graph Viewer]  │ │
│                         │  └───────────────────────────┘ │
│                         │                                │
│                         │  ┌─ Input Bar ────────────────┐ │
│                         │  │ [textarea]   [Graph ☐] [▶] │ │
│                         │  └───────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Application State

```ts
// Global auth state
interface AuthState {
  token:      string | null
  userId:     string | null
  orgId:      string | null
  role:       string | null
}

// Per-conversation state
interface ConversationState {
  sessionId:        string | null   // the only external ID
  collectionName:   string | null   // locked once set
  isGraph:          boolean
  turns:            Turn[]
  totalTurns:       number
  hasMoreHistory:   boolean         // for infinite scroll
  currentPage:      number
  isStreaming:      boolean
  agentStatus:      AgentStatus | null
  graphUi:          GraphUi | null  // from stream_end when is_graph=true
}

interface Turn {
  turnIndex:         number
  rawQuery:          string
  finalAnswer:       string
  citations:         Citation[] | null  // only on most recent turn
  verificationScore: number | null      // only on most recent turn
  iterationsUsed:    number | null      // only on most recent turn
  createdAt:         string
}

interface AgentStatus {
  agent:   string   // "query_rewriter" | "retrieval_agent" | etc.
  event:   string   // "start" | "progress" | "done"
  message: string
}

interface GraphUi {
  nodes: { id: string; type: string }[]
  edges: { source: string; relation: string; target: string }[]
}

// Sidebar state
interface SidebarState {
  conversations: ConversationSummary[]
}

interface ConversationSummary {
  sessionId:      string
  title:          string
  collectionName: string
  isGraph:        boolean
  turnCount:      number
  lastActive:     string
}
```

---

## 3. Component Tree

```
<App>
  ├── <AuthGuard>              — redirect to login if no token
  │
  ├── <Sidebar>
  │   ├── <NewChatButton>      — opens collection picker modal
  │   ├── <CollectionPickerModal>
  │   └── <ConversationList>
  │       └── <ConversationItem> × N
  │
  └── <ChatWindow>
      ├── <ChatHeader>         — shows locked collection name
      ├── <MessageThread>
      │   ├── <ScrollSentinel> — top of list, triggers history load
      │   ├── <TurnMessage> × N
      │   │   ├── <UserBubble>
      │   │   ├── <AIBubble>
      │   │   │   ├── <AnswerText>    — markdown rendered
      │   │   │   └── <CitationList> — only on most recent turn
      │   │   └── <AgentProgressBar> — only while streaming
      │   └── <StreamingIndicator>
      ├── <GraphPanel>         — shown only when is_graph=true and graph_ui exists
      └── <InputBar>
          ├── <QueryTextarea>
          ├── <GraphToggle>    — checkbox: is_graph on/off
          └── <SendButton>
```

---

## 4. Flows

### 4.1 New Chat

```
User clicks [+ New Chat]
  ↓
<CollectionPickerModal> opens
  → GET /api/org/my/collections          (fetch user's collections)
  → show dropdown of collection names
  → user picks one, optionally toggles [Use Graph]
  ↓
User types first message → clicks Send
  → POST /api/v1/retrieval/query
      { raw_query, collection_name, is_graph, session_id: null }
  ↓
First SSE event arrives:
  data: { event: "session_start", session_id: "abc-123", collection: "..." }
  → store session_id in ConversationState         ← critical
  → add new ConversationSummary to sidebar
  ↓
Remaining SSE events → update AgentStatus → show progress bar
  ↓
stream_end event:
  → set graphUi if is_graph=true
  → mark isStreaming=false
  → append completed Turn to turns[]
```

### 4.2 Resume Past Chat (user clicks sidebar item)

```
User clicks a ConversationItem
  → set sessionId = item.sessionId
  → set collectionName = item.collectionName (locked, input disabled)
  → set isGraph = item.isGraph
  ↓
Load history:
  GET /api/v1/retrieval/conversations/{session_id}/history?page=1&page_size=10
  → set turns = response.turns (reversed for display: newest at bottom)
  → set totalTurns = response.total
  → set hasMoreHistory = response.has_more
  → set currentPage = 1
  ↓
Scroll to bottom of thread (most recent turn visible)
```

### 4.3 Infinite Scroll (load older turns)

```
User scrolls up → <ScrollSentinel> enters viewport
  (only trigger if hasMoreHistory=true and not currently loading)
  ↓
GET /api/v1/retrieval/conversations/{session_id}/history?page={currentPage+1}&page_size=10
  → prepend response.turns above current thread
  → set currentPage += 1
  → set hasMoreHistory = response.has_more
  → restore scroll position (so view doesn't jump)
```

### 4.4 Send Follow-up Query

```
User types query → clicks Send (session_id already set)
  → set isStreaming=true
  → append optimistic UserBubble with raw_query
  → append empty AIBubble with spinner
  ↓
POST /api/v1/retrieval/query
  { raw_query, collection_name: <ignored by backend>, session_id: "abc-123" }
  ↓
SSE stream:
  session_start  → confirm same session_id (no-op)
  agent events   → update AgentStatus → animate progress bar
  stream_end     → finalise answer, set graphUi, mark isStreaming=false
  ↓
Sidebar: update title (if turn 0), update last_active, update turn_count
```

---

## 5. SSE Streaming — Implementation

```ts
async function sendQuery(
  rawQuery: string,
  collectionName: string,
  sessionId: string | null,
  isGraph: boolean,
  token: string,
  onEvent: (event: SseEvent) => void,
): Promise<void> {
  const response = await fetch('/api/v1/retrieval/query', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body:    JSON.stringify({ raw_query: rawQuery, collection_name: collectionName, session_id: sessionId, is_graph: isGraph }),
  })

  const reader  = response.body!.getReader()
  const decoder = new TextDecoder()
  let   buffer  = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n\n')
    buffer = lines.pop()!            // keep incomplete chunk

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = JSON.parse(line.slice(6))
      onEvent(data)
    }
  }
}
```

**`onEvent` handler:**
```ts
function handleSseEvent(event: SseEvent) {
  switch (event.event) {
    case 'session_start':
      setSessionId(event.session_id)          // store immediately
      break

    case 'start':
    case 'progress':
    case 'done':
      setAgentStatus({
        agent:   event.agent,
        event:   event.event,
        message: event.status ?? agentLabel(event.agent, event.event),
      })
      break

    case 'stream_end':
      setGraphUi(event.graph_ui ?? null)
      setIsStreaming(false)
      setAgentStatus(null)
      // turn is now in DB — reload most recent page or append from state
      break

    case 'error':
      showErrorToast(event.detail)
      setIsStreaming(false)
      break
  }
}
```

---

## 6. Agent Progress Bar

Show a live status line while `isStreaming=true`. Map agent names to readable labels:

```ts
const AGENT_LABELS: Record<string, string> = {
  query_rewriter:    'Understanding your question...',
  query_planner:     'Planning search strategy...',
  retrieval_agent:   'Searching knowledge base...',
  answer_agent:      'Generating answer...',
  verification_agent:'Verifying answer quality...',
  refinement_agent:  'Refining search (iteration {n})...',
  citation_agent:    'Extracting citations...',
  no_context:        'No relevant content found.',
}
```

Render as a subtle animated pill below the last AI bubble:
```
● Searching knowledge base...     [retrieval_agent / start]
✓ Searching knowledge base...     [retrieval_agent / done]
● Generating answer...            [answer_agent / start]
```

---

## 7. Citation Display

Only the most recent turn has citations. Render them as collapsible cards below the answer:

```
▸ Sources (2)
  ┌─────────────────────────────────────────────┐
  │ 📄 gemma3_paper.pdf                         │
  │    Section: 3. Architecture > 3.2 Attention │
  │    Page: 4, 5                               │
  │    "Describes the sliding window attention  │
  │     mechanism used in Gemma 3"              │
  └─────────────────────────────────────────────┘
```

> `document_name` is currently the doc UUID — will show as filename once the document_name bug in the indexer is fixed.

---

## 8. Graph Panel (is_graph=true)

Rendered only after `stream_end` when `graph_ui` is not null.

```
graph_ui = {
  nodes: [{ id: "Gemma 3", type: "Model" }, ...],
  edges: [{ source: "Gemma 3", relation: "USES", target: "Sliding Window Attention" }]
}
```

**Recommended library:** React Flow or Cytoscape.js

Node colour = entity type (Model → blue, Technique → green, Organisation → orange, etc.)
Edge label = `relation` string
Click on node → highlight its connected edges

If `graph_ui` is null (is_graph=false), hide the panel entirely.

---

## 9. Collection Picker Modal

```
┌─ Start New Chat ──────────────────────────────┐
│                                               │
│  Select a collection                          │
│  ┌────────────────────────────────────────┐   │
│  │ ▼ Research Papers  (12 docs)           │   │
│  └────────────────────────────────────────┘   │
│     Research Papers  (12 docs)                │
│     Product Docs     (5 docs)                 │
│     Manas_Lab        (1 doc)                  │
│                                               │
│  ☐  Enable Knowledge Graph                    │
│                                               │
│  [Cancel]                    [Start Chat ▶]   │
└───────────────────────────────────────────────┘
```

- Call `GET /api/org/my/collections` on modal open
- Show `name` and `doc_count` for each collection
- Disable [Start Chat] until a collection is selected
- Graph toggle only visible if `doc_count > 0`
- On [Start Chat]: close modal, set `collectionName`, open chat window, focus input

---

## 10. Sidebar Conversation List

- Load on login: `GET /api/v1/retrieval/conversations`
- Sort by `last_active` descending (already server-sorted)
- Each item shows: `title` (60 chars), `collection_name`, `turn_count`, relative `last_active`
- Active item highlighted
- After any new query: update the item's `last_active` and `turn_count` locally (no re-fetch needed)

---

## 11. Input Bar Rules

| Condition | State |
|---|---|
| `isStreaming=true` | textarea disabled, Send button shows spinner |
| `sessionId` set (resumed chat) | collection name shown as locked label, not editable |
| `sessionId` null (new chat, no collection picked yet) | Send button disabled |
| textarea empty | Send button disabled |
| Shift+Enter | newline in textarea |
| Enter (no shift) | submit query |

---

## 12. API Call Summary

| When | Call |
|---|---|
| Page load / login | `GET /api/v1/retrieval/conversations` |
| New chat modal open | `GET /api/org/my/collections` |
| User sends query | `POST /api/v1/retrieval/query` (SSE) |
| User clicks past chat | `GET /api/v1/retrieval/conversations/{session_id}/history?page=1` |
| User scrolls up | `GET /api/v1/retrieval/conversations/{session_id}/history?page=N` |

---

## 13. Key Rules to Enforce in Frontend

1. **Store `session_id` from the first SSE event (`session_start`)**, not from `stream_end`. The pipeline can take 30+ seconds — the frontend needs the ID immediately in case the user navigates away.

2. **Never let the user change the collection** in an existing session. Once `sessionId` is set, show the collection as a read-only label in the input bar. The backend ignores whatever `collection_name` is sent anyway, but the UI should make this obvious.

3. **One query at a time.** Disable the input while `isStreaming=true`. Do not allow concurrent requests on the same session.

4. **Scroll position on history load.** When prepending older turns (infinite scroll), save `scrollHeight` before the prepend, then restore `scrollTop = newScrollHeight - oldScrollHeight` so the view doesn't jump.

5. **Only the last turn shows citations and scores.** All earlier turns return `null` for these fields — this is by design (storage pruning). Do not show empty citation sections for older turns.

6. **`graph_ui` only arrives once at `stream_end`.** Keep it in state for the lifetime of that session. Clear it when a new session starts.

---

## 14. Implementation Order

| Phase | Work |
|---|---|
| 1 | Auth flow (login → store token) |
| 2 | Sidebar: list conversations on login |
| 3 | Collection picker modal + new chat |
| 4 | SSE query handler + agent progress bar |
| 5 | Message thread: render turns + streaming bubble |
| 6 | Resume past chat: load history page 1 |
| 7 | Infinite scroll: load older pages |
| 8 | Citations collapsible panel |
| 9 | Graph panel (React Flow / Cytoscape) |
| 10 | Polish: loading skeletons, error toasts, empty states |
