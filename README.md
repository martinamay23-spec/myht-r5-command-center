# ♡ MyHT | R5 Command Center

A mobile-first, single-user command center for Madame Lovely. The UI is static, and private operations run through an authenticated Cloudflare Worker.

## Repository privacy

The GitHub repository and Pages site may be public. **Never place Notion tokens, HR records, or private member details in Git commits, GitHub Pages files, or browser storage.** The frontend contains only the URLs of the Notion databases.

## Deploy a working Notion-connected app

1. Create a Cloudflare account and a Worker connected to this GitHub repository. Configure it to build using the included `wrangler.toml`. Cloudflare Workers Static Assets serves the `public/` directory, while `src/worker.js` handles `/api/*` requests on the same origin.
2. Set Worker **secret** `NOTION_TOKEN` using a Notion integration that is shared **only** with the relevant task and HR databases. The Notion integration needs read access plus update permissions for tasks.
3. Configure Cloudflare Zero Trust **Access** to protect the entire Worker hostname. Create a self-hosted application with a policy that allows only **your** email identity. Do not use a public 'bypass' policy. Set the Access application audience in Worker secret `ACCESS_AUD`, its team domain in `ACCESS_TEAM_DOMAIN` (for example `myteam.cloudflareaccess.com`), and your email in `ALLOWED_EMAIL`.
4. Set `TASKS_DATA_SOURCE_ID=b52d4e54-86f9-4eee-8c6b-1179ff29491a` and `HR_DATA_SOURCE_ID=08a1a3a7-1f10-48d7-97ed-1e45daef77c3` as Worker environment variables.
5. Deploy, open the **protected Worker URL**, authenticate, and verify that the badge says "Connected to Notion". Only then can task checkboxes update Notion and HR searches show private records. The API checks the Cloudflare Access signature, audience, issuer, expiry, and your allowed email. It also verifies the task belongs to the configured data source before changing its status.
6. Keep GitHub Pages for an optional **read-only preview**. The actual app **cannot** use GitHub Pages alone for its same-origin API. Cloudflare Worker serves the live dashboard and API together.

## How it works

- `public/index.html`: Mobile-first UI, responsive tabs, live task list and search, removal registry explorer.
- `src/worker.js`: Same-origin authenticated API. `GET /api/bootstrap` loads live Notion tasks and cases; `PATCH /api/tasks/:id` updates a task's separate R5 Complete checkbox. No browser-held Notion credentials.
- `wrangler.toml`: Worker static-asset routing and deployment settings.
- `package.json`: local Wrangler commands.

## Notes

The 'My Duties' checkbox updates the dedicated Notion **R5 Complete** checkbox. It does not modify the **Status** workflow, calendar scheduling, or assigned owner. This first version exposes read-only HR search; it does not create or edit HR cases through the dashboard.

The existing twice-daily Notion-to-iCloud synchronization runs independently of this site. No secrets or HR data are needed in the GitHub repository.

### Security reminder

A static GitHub Pages site cannot guarantee that the whole page itself is visible only to one person. The Cloudflare Access-protected Worker URL is the private application. Only publish nonsensitive frontend code to GitHub.
