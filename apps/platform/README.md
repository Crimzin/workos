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

### 3. Apply the schema

In the Supabase dashboard, open **SQL Editor → New query** and paste the contents of:

1. `supabase/migrations/0001_init_nodes.sql` — creates the `nodes` table and trigger
2. `supabase/seed.sql` — loads minimal workspace/stack/card seed data

Run each one. (We'll migrate to the Supabase CLI for versioned migrations when we hit Phase 1.5 or so.)

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
    ├── migrations/
    │   └── 0001_init_nodes.sql
    └── seed.sql
```
