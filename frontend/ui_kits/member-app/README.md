# Member app — the unified omnicontext workspace

This is **the** app. Everyone signs in here. What you see depends on your role:

- **Members** get the **Workspace**: Library, Ask, and Upload.
- **Admins** get all of that **plus** an **Admin** section (Members, Collections, Usage), and a **View as** switcher to preview exactly what a plain member sees.

An admin is a member with extra powers — so it's one app with role-based sections, not two separate products. The admin-console entry point (`../admin-console/index.html`) boots this same app on the Members view.

## Files

| File | Role |
|---|---|
| `index.html` | Boots the app on the Library view |
| `app.css` | Shared stylesheet for the whole app (member + admin) |
| `App.jsx` | The shell — view routing + role logic |
| `Sidebar.jsx` | Workspace nav + (admin) Admin nav + **View as** role switcher |
| `TopBar.jsx` | Persistent chrome; slim "Admin console" context bar on admin views |
| `Library.jsx` | Collections grid + recent documents table |
| `UploadDrawer.jsx` | Dropzone + synthetic ingestion pipeline |
| `AskView.jsx` | Chat surface; answers cite source pages |
| `MembersTable.jsx` · `CollectionsGrid.jsx` · `UsageDashboard.jsx` | Admin views |
| `Modal.jsx` | Shared modal (confirms + create-collection) |
| `data.js` | Fake content so the app feels populated |

## Run

Open `index.html`. State lives in React; refresh resets to the Library.

### Demo flow
1. **Upload** (top-left) → drop any file → watch the ingestion pipeline run.
2. **Ask** (sidebar) → send a question → get a cited answer.
3. **Members / Collections / Usage** (Admin section) → manage the org.
4. **View as → Member** (sidebar footer) → the Admin section disappears; you're seeing what a member sees.
