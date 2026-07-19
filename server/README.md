# Daily Health cloud service

This is the subscribed-mode API. It uses libSQL over HTTP or a server-local
SQLite file; it does not contain Prisma, a native Prisma engine, Capacitor, or
any mobile-runtime dependency.

```sh
cp .env.example .env
pnpm --filter @daily-health/server dev
```

For production, set `DATABASE_URL` to a hosted libSQL/Turso URL, set
`DATABASE_AUTH_TOKEN`, use a unique `AUTH_JWT_SECRET`, and set the exact web
origin(s) in `ALLOWED_ORIGINS`. The server creates its small schema at startup.
The application intentionally does not create subscriptions itself: a payment
webhook should set `users.subscribed = 1` after successful payment. The
`DEMO_SUBSCRIBED_EMAILS` option is strictly a controlled testing bridge.

To run it on any container-capable VPS or service:

```sh
docker build -f server/Dockerfile -t daily-health-server .
docker run --env-file server/.env -p 8787:8787 daily-health-server
```

Email/password endpoints are `/auth/register`, `/auth/login`, and
`/auth/session`. Every `/api/*` endpoint derives the user identity from a
Bearer token; request-supplied profile IDs are ignored.
