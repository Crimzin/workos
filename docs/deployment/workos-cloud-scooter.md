# WorkOS Cloud Scooter

This is the first cloud deployment shape for WorkOS Core: private-to-Will, installable on iPhone as a web app, and backed by the existing Supabase project.

## Scope

- Deploy only `apps/platform`.
- Keep Supabase managed by Supabase.
- Protect the app with Basic Auth before any page or API route renders.
- Add a Vercel cron heartbeat that performs one lightweight Supabase read each day.
- Add PWA metadata so Safari can add WorkOS to the iPhone Home Screen.

BrainShare, Neo4j, multi-user auth, RLS, and cloud coding-agent workers stay out of this phase.

## Vercel Setup

Create a Vercel project from the repo and set the project root directory to:

```txt
apps/platform
```

Set these environment variables in Vercel:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
WORKOS_ACCESS_USER
WORKOS_ACCESS_PASSWORD
CRON_SECRET
```

Use a long random value for `WORKOS_ACCESS_PASSWORD` and `CRON_SECRET`.

The app intentionally fails closed on Vercel if `WORKOS_ACCESS_PASSWORD` is missing. Local development remains open unless that password is set.

## Supabase

Use the existing Supabase project for the scooter phase.

If the project stays on the Free plan, the daily heartbeat at `/api/cron/heartbeat` gives Supabase a lightweight activity signal. The heartbeat route is excluded from the Basic Auth gate and instead requires Vercel's `Authorization: Bearer $CRON_SECRET` cron header.

If the project moves to Pro, the heartbeat can stay in place as a harmless smoke check or be removed later.

## iPhone Install

After the Vercel deployment is live:

1. Open the WorkOS URL in Safari on iPhone.
2. Enter the private WorkOS username and password when prompted.
3. Tap Share.
4. Tap Add to Home Screen.
5. Turn on Open as Web App.
6. Tap Add.

This is not an App Store app. It is a private PWA-style Safari web app, which is the intended scooter-phase distribution.

## App Store Notes

No App Store review is involved in this phase because no iOS binary is submitted.

If WorkOS later becomes a native iOS app or a wrapper around the web app, that becomes a separate project. At that point it needs Apple Developer account setup, App Store Review, native distribution decisions, and stronger product/security design than this scooter phase.
