# FixNaija

A mobile-first marketplace for finding and hiring verified local service
professionals in Nigeria — plumbers, electricians, mechanics, generator and AC
technicians, carpenters, painters, and more.

This is a real, working application: real authentication, a real relational
database, real CRUD, search/filtering, a verification workflow, messaging,
service requests with a full job lifecycle, ratings with anti-fake-review
protection, notifications, and an admin dashboard. It is not a static demo.

## Why the stack looks unusual

This was built in a sandbox with **no network access**, so `npm install`
cannot reach the npm registry. Rather than ship something with dependencies
that won't install, the whole app is built on **Node.js core modules only**:

- **Database:** [`node:sqlite`](https://nodejs.org/api/sqlite.html) — a real
  relational SQLite database, built into Node 22.5+. No `better-sqlite3`,
  no ORM.
- **HTTP/routing:** Node's built-in `http` module with a small custom router
  (`src/router.js`) — no Express.
- **Auth:** `crypto.scrypt` for password hashing, and a hand-rolled
  HMAC-signed session token (`src/utils/auth.js`) — functionally equivalent
  to a JWT, no `jsonwebtoken` package.
- **File uploads:** images/documents are sent from the browser as base64 JSON
  (via `FileReader`) rather than `multipart/form-data`, so no `multer` is
  needed. Files are written to `public/uploads/`.
- **Frontend:** a vanilla JavaScript SPA using native ES modules (no bundler,
  no framework) with hash-based routing, served as static files.

If you have npm registry access, you could swap in Express, a JWT library,
etc. with light refactoring — but everything here already works without them.

## Technology stack

| Layer      | Technology                                              |
|------------|-----------------------------------------------------------|
| Runtime    | Node.js 22+ (uses the built-in `node:sqlite` module)       |
| Database   | SQLite (file-based, relational, foreign keys + indexes)    |
| Backend    | Plain Node `http` server + custom router                   |
| Frontend   | Vanilla JS (ES modules), hash router, no build step         |
| Styling    | Hand-written CSS, mobile-first, installable as a PWA        |
| Auth       | scrypt password hashing + HMAC-signed session cookies       |

## Database structure

All tables live in `src/db/schema.sql` and are created automatically on first
run (`src/db/index.js`), along with seed data for service categories and a
starter set of Nigerian locations.

Core entities: `users`, `provider_profiles`, `service_categories`,
`locations`, `provider_services`, `provider_areas`, `portfolio_photos`,
`verification_applications`, `verification_documents`, `requests`
(service requests *and* jobs — one row tracks the full lifecycle),
`request_photos`, `job_status_history`, `messages`, `blocked_users`,
`reviews`, `review_reports`, `favorites`, `notifications`, `payments`,
`reports`, `disputes`, `admin_actions`, `sessions`.

Every table uses foreign keys, and the columns you'd filter or join on
(role, status, location, category, rating) are indexed.

## Environment variables

Copy `.env.example` to `.env` and adjust:

```
PORT=3000
AUTH_SECRET=change-this-to-a-long-random-string
# DB_PATH=./data/fixnaija.db
```

`AUTH_SECRET` signs session tokens — set it to a long random string in
production, or every restart with a different secret invalidates sessions.

## How to run locally

Requires **Node.js 22.5 or later** (for `node:sqlite`). Check with `node -v`.

```bash
cd fixnaija
cp .env.example .env      # optional, defaults work fine for local dev
npm start                  # or: node server.js
```

Open `http://localhost:3000`. The database file is created automatically at
`data/fixnaija.db` on first run, along with categories and starter locations.

## How to create the first admin account

Admins are **never** created through the public registration form (by
design — see `src/routes/auth.js`, which always coerces self-registration to
`customer` or `provider`). Use the CLI script instead:

```bash
node scripts/create-admin.js "Full Name" "+2348012345678" "admin@example.com" "a-strong-password"
```

Then log in at `/login` with that phone number and password. The account
will have the `admin` role and can access `/admin` in the app (also reachable
from the bottom navigation once logged in as an admin).

You can run this script again any time to create additional admins.

## How verification works

1. A provider fills in their profile (business name, categories, area,
   pricing, bio, photo) from **Profile → Verification** in the app.
2. They submit a verification application with their full legal name,
   address, and at least one identification document (submitted as an
   image). This creates a `verification_applications` row with status
   `PENDING`, and the provider's `provider_profiles.verification_status`
   is also set to `PENDING`.
3. An admin reviews pending applications at **Admin → Verification queue**,
   can view the submitted documents (never exposed on the public profile —
   only `/api/admin/verification/:id` returns document paths, and that
   endpoint requires the `admin` role), and approves or rejects.
4. Only on admin approval does `verification_status` become `VERIFIED`, and
   only then does the green "Verified Professional" badge appear on the
   provider's public profile. The provider gets a notification either way.

"Verified" means FixNaija has reviewed the identity documents submitted —
it is not a guarantee that a job will go well. The in-app copy is written to
avoid implying stronger guarantees than that (see the payment warning below,
too — the app does not claim payment protection it doesn't have).

## How ratings work

- A customer can only review a request once its status is `COMPLETED`, and
  only once per request — the API rejects a second review for the same
  `request_id` (there's also a `UNIQUE` constraint on `reviews.request_id`
  at the database level as a second line of defense).
- Every review is tied to a real, completed `request_id`, so every review
  shown carries a "Verified Job" label — there's no path to post a review
  without a completed job behind it.
- Reviews capture six ratings (overall, quality, professionalism,
  communication, value for money, punctuality) plus an optional written
  comment. Providers can reply once; anyone can report a review, which
  flags it for admin moderation (hide/restore).
- A provider's `avg_rating` and `review_count` are recalculated from
  `PUBLISHED` reviews every time a review is added or an admin hides/restores
  one, so the number shown is always live, not cached/stale.

## How to add new service categories

Either directly in the database seed (`src/db/index.js`, the `seed()`
function) before first run, or at runtime as an admin:

```
POST /api/admin/categories
{ "name": "Roofing Contractor", "icon": "🏗️" }
```

(requires an authenticated admin session — use the app's network tab or a
tool like `curl -b cookies.txt` with an admin login first).

## How to add Nigerian locations

Location coverage starts with **Rivers State (Port Harcourt), Lagos, and FCT
Abuja**, seeded in `src/db/index.js`, structured as State → City → Area so
every other Nigerian state can be added the same way — nothing is
hard-coded to a single city beyond the seed data. To add more, either extend
the `seed()` function's `data` object, or as an admin:

```
POST /api/admin/locations
{ "state": "Kano", "city": "Kano Municipal", "area": "Sabon Gari" }
```

## What's simplified for the MVP (and why)

- **Payments:** the schema and status fields (`PENDING/PAID/REFUNDED/
  FAILED/CANCELLED`) are in place on both `requests` and a dedicated
  `payments` table, ready for a real Paystack/Flutterwave integration. The
  MVP does **not** process real payments or hold funds in escrow, and the
  UI says so explicitly on every provider profile — it never claims
  protection that doesn't exist (per the brief's explicit instruction not
  to falsely claim escrow protection).
- **Push notifications:** in-app notifications are fully implemented and
  polled; native push (APNs/FCM/web push) isn't wired up, since that
  requires external services and device registration.
- **Maps:** locations are structured (state/city/area, with optional
  lat/lng columns already in the schema) but there's no map tile provider
  wired in. Distance filtering can be added on top of the existing lat/lng
  columns once you pick a maps provider.
- **File uploads use base64-over-JSON**, not `multipart/form-data` — see
  "Why the stack looks unusual" above. This keeps images to a reasonable
  size in practice but isn't as efficient as true multipart streaming for
  very large files.

Everything else in the spec — auth, all three account types, verification,
search/filtering, the full job lifecycle, messaging, reviews with anti-fake
protection, favorites, reports, disputes, and the admin dashboard — is
implemented against a real database with real server-side authorization
(every sensitive endpoint checks the session and role server-side; nothing
depends on frontend-only checks).

## Testing performed

The full flow below was exercised end-to-end against the running server
during development (not just written and assumed to work):

- Register as customer, provider, and (via CLI) admin; login/logout
- Provider sets up categories, area, pricing, bio
- Public search/filter by category, state, rating, verified-only
- Provider submits a verification application with a document; admin
  approves it; the "Verified Professional" badge appears on the public
  profile only after approval
- Customer creates a service request; provider accepts with an agreed
  price, then moves it through ON_THE_WAY → ARRIVED → IN_PROGRESS →
  COMPLETED; each transition is role-checked server-side and logged to
  `job_status_history`
- Customer submits a review on the completed job; a second review attempt
  on the same job is correctly rejected; the provider's average rating and
  review count update automatically
- Messaging between customer and provider, with unread counts
- Notifications fire on request creation, each status change, new review,
  and verification decisions
- Admin stats endpoint, user suspend/unsuspend, audit log entries recorded
  for verification decisions

If you find a bug, it's most likely in the parts of the UI that couldn't be
exercised through a real browser in this sandbox (no headless browser was
available) — the JS was syntax-checked and carefully reviewed, but a first
pass in an actual browser is worth doing before you treat this as fully
proven end-to-end on the frontend.

## How to deploy

This is a single Node process with a file-based SQLite database and a local
uploads folder — it deploys like any small Node app:

1. **Any VPS / Docker host (Railway, Render, Fly.io, a plain VPS, etc.):**
   - Ensure the host runs **Node 22.5+**.
   - Set `AUTH_SECRET` (and optionally `PORT`) as environment variables.
   - Mount a persistent volume for `data/` and `public/uploads/` — without
     persistent storage, a redeploy wipes the database and uploaded files.
   - Start command: `node server.js`.
2. **Behind a reverse proxy (nginx/Caddy):** proxy to the Node process's
   `PORT` and terminate TLS at the proxy. No special config needed on the
   Node side.
3. Run `node scripts/create-admin.js ...` once after first deploy to create
   your first admin account (see above).

There's no build step — the frontend is served as-is from `public/`.

## Project structure

```
server.js                 # HTTP server entrypoint (routes API + static files)
src/
  db/
    schema.sql             # full relational schema
    index.js                # DB connection + seed data (categories, locations)
  router.js                 # minimal path-param router
  middleware/auth.js         # session resolution + role guards
  utils/
    auth.js                  # password hashing, session tokens
    http.js                   # body/cookie parsing, static file serving, base64 upload saving
    audit.js                   # admin action log + notification helper
  routes/
    auth.js, meta.js, providers.js, verification.js, requests.js,
    reviews.js, messages.js, misc.js (favorites/notifications/reports/disputes), admin.js
scripts/
  create-admin.js            # CLI to create admin accounts
public/
  index.html, manifest.webmanifest, service-worker.js
  css/styles.css
  js/
    api.js, state.js, router.js, components.js, main.js
    pages/                    # one module per screen
  uploads/                    # created at runtime; user-uploaded images/docs
data/
  fixnaija.db                 # created at runtime; the SQLite database
```
