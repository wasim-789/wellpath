# WellPath

AI powered personalized health and lifestyle planner. A rule engine builds every calorie, macro and safety decision; the AI assistant only explains and suggests.

> Wellness guidance only. Not medical advice.

## Projects in this repo

| Folder | What it is | Runs on |
| --- | --- | --- |
| `apps/api` | Backend API (Node, Express, TypeScript, MongoDB) | http://localhost:4000 |
| `apps/web` | User web app (React, Vite, TypeScript) | http://localhost:5173 |
| `apps/admin` | Admin panel (React, Vite, TypeScript) | http://localhost:5174 |
| `packages/engine` | Plan engine: calorie and macro targets, safety rules, meal and workout planners (pure functions + tests) | imported by api |
| `packages/shared` | Zod schemas and types shared by all apps | imported everywhere |

## Run locally

Requirements: Node.js 22 or newer, Git.

```bash
npm install                        # installs everything for all projects
copy apps\api\.env.example apps\api\.env   # Windows (macOS/Linux: cp)
npm run dev:api                    # terminal 1
npm run dev:web                    # terminal 2
npm run dev:admin                  # terminal 3 (optional)
```

Open http://localhost:5173 for the web app. The admin dashboard at http://localhost:5174 shows whether the API is online.

Run `npm run doctor` to check `apps/api/.env` and the MongoDB connection.

### Starter foods and exercises

```bash
npm run seed            # adds missing starter foods and exercises (safe to run any time)
npm run seed -- --force # resets seeded items to the code version (loses admin edits)
```

Every starter food is marked unverified. Its source note says where the numbers came from, and someone should check it before marking it verified.

### Email (password reset)

Without email settings, reset emails are printed in the API terminal, so the flow works locally with no setup. To send real email with Gmail, turn on 2-Step Verification, create an app password (Google Account > Security > App passwords), and set `SMTP_HOST=smtp.gmail.com`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` in `apps/api/.env`. See `.env.example`.

### Admin access

Register an account in the app (or with `POST /api/v1/auth/register`), then give it admin access:

```bash
npm run make-admin -- you@example.com            # make admin
npm run make-admin -- --remove you@example.com   # remove admin
```

## Useful commands

```bash
npm run lint      # lint the frontends
npm test          # all unit + API tests
npm run typecheck # TypeScript checks for every project
npm run build     # production builds
```

## Deployment

| App | Host | Setup |
| --- | --- | --- |
| `apps/api` | Render | Blueprint in `render.yaml`. Set `MONGODB_URI` and `CORS_ORIGINS` in the dashboard. |
| `apps/web` | Vercel | Root directory `apps/web` |
| `apps/admin` | Vercel | Root directory `apps/admin`. Set `VITE_API_URL` to the Render URL. |

Before deploying: browsers such as Safari block cookies from another site, which would sign people out on every reload. Proxy `/api` through each Vercel app (a rewrite to the Render URL) so the session cookie is same-site.

## API so far

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | API is alive |
| POST | `/api/v1/plan/preview` | Daily calorie and macro targets from a profile |
| GET | `/api/v1/plan/meals` | This week's 7-day meal plan (signed in; `?week=<Monday>`). Saved, so it stays the same all week |
| GET | `/api/v1/plan/meals/alternatives` | Up to 3 other plates for one meal (`?week`, `day=0-6`, `slot`), same diet, safety rules and calories |
| PUT, DELETE | `/api/v1/plan/meals/swap` | Swap one meal for an offered alternative, or put it back |
| GET | `/api/v1/plan/workouts` | This week's home workouts (3 to 5 days, fits your minutes, level and safety rules; `?week=<Monday>`) |
| GET | `/api/v1/plan/workouts/alternatives` | Up to 3 safe exercises for the same muscles (`?week`, `day`, `slug`) |
| PUT, DELETE | `/api/v1/plan/workouts/swap` | Swap one exercise for an offered alternative, or put it back |
| POST | `/api/v1/plan/rebuild` | New meals or new workouts for the week (`{ week, part }`) |
| GET | `/api/v1/progress` | The week's progress: each day, the week so far and the streak (`?week`, `today`) |
| PUT | `/api/v1/progress/sets` | Sets done for one exercise (`{ week, today, day, slug, sets }`, 0 clears) |
| PUT | `/api/v1/progress/meals` | A meal eaten or not (`{ week, today, day, slot, eaten }`) |
| POST | `/api/v1/auth/register` | Create an account and start a session |
| POST | `/api/v1/auth/login` | Sign in and start a session |
| POST | `/api/v1/auth/refresh` | Swap the refresh cookie for a new access token |
| POST | `/api/v1/auth/logout` | End the session |
| GET | `/api/v1/auth/me` | Current user (needs `Authorization: Bearer <token>`) |
| POST | `/api/v1/auth/forgot-password` | Email a one-time reset link (same answer whether or not the account exists) |
| POST | `/api/v1/auth/reset-password` | Set a new password with the link's token; signs out every device |
| DELETE | `/api/v1/auth/account` | Delete the signed-in account and all its data (password required) |
| GET | `/api/v1/profile` | Saved onboarding answers, daily targets and safety notices (signed in) |
| PUT | `/api/v1/profile` | Save onboarding answers (signed in, health data consent required) |
| POST | `/api/v1/admin/auth/login` | Admin sign-in (admin accounts only, separate session) |
| POST | `/api/v1/admin/auth/refresh` | Swap the admin refresh cookie for a new access token |
| POST | `/api/v1/admin/auth/logout` | End the admin session |
| GET | `/api/v1/admin/auth/me` | Current admin |
| GET, POST | `/api/v1/admin/foods` | List or add foods (admins only, like every `/admin` route) |
| PUT, DELETE | `/api/v1/admin/foods/:slug` | Edit or delete a food (the slug never changes) |
| POST | `/api/v1/admin/foods/:slug/verify` | Mark a food's values as checked |
| GET, POST | `/api/v1/admin/exercises` | List or add exercises |
| PUT, DELETE | `/api/v1/admin/exercises/:slug` | Edit or delete an exercise |
| GET | `/api/v1/admin/safety-rules` | The engine's condition rules and which exercises they leave out (read-only) |
| GET | `/api/v1/admin/audit` | Admin sign-ins and content changes, newest first (`?before=<id>` for older) |

### How weekly plans are saved

Each week's meals and workouts are built the first time the week is opened and saved, so they stay the same all week. A plan is rebuilt when the user changes their answers, asks for new meals or workouts, or when a food or exercise in it is deleted or becomes unsafe for them. Weeks that are over are kept exactly as they were.

### How progress is saved

Ticked-off sets and eaten meals are saved to the account, one record per day, so they follow the user to any device. Progress is counted against the week's saved plan. The app sends the user's own date (`today`), so days start at their midnight; days that have not come yet and weeks that are over cannot be changed. The streak counts consecutive days with anything ticked off; until something is done today, the run up to yesterday still counts.

## Tech stack

React, Vite, TypeScript, Node.js, Express, MongoDB (Mongoose), Zod, Vitest, Supertest, GitHub Actions. AI: Google Gemini (primary) with Groq fallback.
