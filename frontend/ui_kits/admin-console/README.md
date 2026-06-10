# Admin console

This is **the same unified app** as the member workspace — opened on the **Members** view.

An admin is a member with extra powers, so there is one app, not two. The shared shell, styles, and components all live in `../member-app/`; this `index.html` just boots that app with `window.__APP_DEFAULTS = { view: "members" }`.

## What admins get on top of the member experience
- **Members** — invite, promote/demote, activate/deactivate (with a destructive confirm).
- **Collections** — create collections, see per-collection document/chunk limits.
- **Usage** — org quotas and per-member daily upload counts.

Admins also use the full Workspace (Library, Ask, Upload) like anyone else, and can preview the plain-member experience with the **View as** switcher in the sidebar.

## Run
Open `index.html`. It loads the shared components from `../member-app/`.
