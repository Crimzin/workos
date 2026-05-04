# WorkOS Core — app

Phase 1 of the WorkOS ecosystem. Next.js 16 (App Router) + TypeScript + Tailwind 4 + Supabase.

See `../work-os-spec-v03.md` for the product spec and `../../ai-ecosystem-roadmap.md` for the build roadmap.

## First-time setup

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New Project. Solo dev, so a free-tier project is fine.
2. In the project dashboard, open **Project Settings → API** and copy the **Project URL** and **anon public key**.

### 2. Configure env

```sh
cp .env.local.example .env.local
# edit .env.local with the URL + anon key from step 1
```

### 3. Link Supabase and apply migrations

The Supabase CLI is installed as a local dev dependency for this app. Run these
commands from `apps/platform`:

```sh
npm install
npm run db:login
npm run db:link -- --project-ref <your-project-ref>
npm run db:list
npm run db:push
```

`db:login` opens the Supabase CLI login flow and stores a local access token.
In non-interactive environments, set `SUPABASE_ACCESS_TOKEN` instead, then run
`npm run db:link -- --project-ref <your-project-ref>`.

`db:push` applies every pending SQL file in `supabase/migrations/` to the linked
remote project. If this is a brand-new database and you want the sample data,
load `supabase/seed.sql` after the migrations:

```sh
npx supabase db query --linked --file supabase/seed.sql
```

Useful migration commands:

```sh
npm run db:new -- <migration_name>   # create a new timestamped migration
npm run db:list                      # compare local and remote migration state
npm run db:push                      # apply pending migrations to linked remote
npm run db:pull                      # pull remote schema changes into a migration
npm run db:lint                      # lint local SQL migrations
npm run db:start                     # start local Supabase via Docker
npm run db:reset                     # reset local DB from migrations + seed
npm run db:stop                      # stop local Supabase
```

Do not paste one-off schema changes into the SQL editor. Add a migration under
`supabase/migrations/`, then run `npm run db:push`.

### 4. Run the app

```sh
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You should see the two seeded workspaces (Burn, Personal) and be able to click through to their stacks and cards.

## Data model (Phase 1.1)

Every entity in WorkOS Core is a **node**. Nodes form a tree via `parent_id`. The `type` field is a UI tag (`workspace` / `stack` / `card`), not a structural constraint — the model supports unlimited nesting depth from day one.

```
workspace (root, parent_id = null)
  └── stack
        └── card
              └── (any node can have children)
```

Future phases layer on: posts (1.4), data fields (1.5), links (1.6), and the Rationale/Assumptions/Decisions fields that BrainShare and Swarm hook into.

## Project layout

```
app/
├── src/
│   ├── app/
│   │   ├── page.tsx          # workspace list
│   │   └── n/[id]/page.tsx   # generic node detail (any level of the tree)
│   └── lib/
│       ├── supabase.ts       # browser + server client (anon key, solo mode)
│       ├── nodes.ts          # query helpers
│       └── types.ts          # WorkNode type
└── supabase/
    ├── config.toml
    ├── migrations/
    │   ├── 0001_init_nodes.sql
    │   └── ...
    └── seed.sql
```
