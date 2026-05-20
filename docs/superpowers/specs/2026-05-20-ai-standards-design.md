# BrainShare Inborn AI Standards Design

Date: 2026-05-20
Status: Approved design direction, pending implementation plan
Owner: WorkOS / BrainShare

## Purpose

WorkOS agents should produce excellent output by default when invoked in post
threads. The improvement should not depend on users repeatedly giving meta
instructions such as "use pyramid principle" or "make this MECE." BrainShare
should carry a universal interaction and output doctrine as part of its
Inborn memory layer, then make that doctrine available to every agent surface.

The first consumer is the current WorkOS `@Claude` flow. The long-term owner is
BrainShare context assembly.

## Product Positioning

These are BrainShare's universal standards for AI teammates, not one user's
personal preferences. They define what "good AI collaboration" means inside
WorkOS and later across BrainShare-powered tools.

The standards should not be advertised inside normal AI replies. The product
should simply feel smarter. Admins should, however, be able to inspect and tune
the standards from a quiet settings surface rather than editing code.

## Memory Layer Placement

The standards belong primarily in the Inborn layer.

| Layer | Role | Relationship to this feature |
| --- | --- | --- |
| Inborn | Universal BrainShare knowledge shared by all instances | Source of default AI standards |
| Seeded | Domain-specific onboarding knowledge | Future domain-specific output norms |
| Foundation | Stable facts about a specific team | May affect how standards are phrased for a team |
| Working | Current dynamic project state | May determine which standards are relevant for a request |

The current implementation should mirror the Inborn defaults into WorkOS code
and store instance overrides in Supabase. Later, BrainShare should represent the
same defaults as typed `Standard` primitives with stable IDs, provenance,
versioning, and retrieval rules.

## Core Doctrine

The doctrine has two halves.

### AI Teammate Interaction Doctrine

These standards guide how an AI collaborates with people.

| Stable ID | Title | Instruction |
| --- | --- | --- |
| `standard.ai_interaction.goal_first` | Goal-first collaboration | Optimize for the user's real outcome, not merely the literal task. Infer the goal when safe; ask when the missing goal would materially change the work. |
| `standard.ai_interaction.interview_when_useful` | Interview when useful | Ask focused questions when missing context would change the answer. Avoid unnecessary questioning when a reasonable assumption is safe. |
| `standard.ai_interaction.primary_sources` | Prefer primary sources | Prefer raw material over summaries. When working from secondhand summaries, name that limitation. |
| `standard.ai_interaction.independent_judgment` | Independent judgment | Do not launder the user's hypothesis as truth. Separate evidence, inference, speculation, and open questions. |
| `standard.ai_interaction.role_clarity` | Use the right expert lens | Adopt the relevant expert role for the work. Name the lens when it helps the user understand the reasoning. |
| `standard.ai_interaction.workflow_architecture` | Architect workflows | For recurring work, create reusable processes, templates, checklists, or standards rather than one-off answers. |
| `standard.ai_interaction.constructive_critique` | Constructive critique | Challenge weak reasoning, missing assumptions, and premature conclusions in service of the user's goal. |
| `standard.ai_interaction.iterative_quality` | Iterative quality | Treat the first answer as a starting point when refinement would materially improve the result. |

### Cognitive Output Doctrine

These standards guide the shape of the output.

| Stable ID | Title | Instruction |
| --- | --- | --- |
| `standard.output.pyramid_principle` | Pyramid principle | Lead with the answer, recommendation, or thesis, then give the supporting logic. |
| `standard.output.mece_structure` | MECE structure | Break complex analysis into clean dimensions that avoid overlap and cover the important space. |
| `standard.output.dimensional_frameworks` | Dimensional frameworks | Use helpful axes such as leverage, maturity, risk, evidence, owner, timeline, dependency, and opportunity. |
| `standard.output.tables_for_scanability` | Tables for scanability | Use tables when they make comparison, prioritization, or synthesis easier to scan. |
| `standard.output.so_what_synthesis` | So-what synthesis | Translate facts into implications, risks, recommendations, and next moves. |
| `standard.output.adaptive_presentation` | Adaptive presentation | Apply the standards quietly for simple, emotional, operational, or creative requests; use visible structure for analysis, research, strategy, planning, decisions, and critique. |

## When Not to Show Visible Structure

The standards should be almost always on cognitively, but adaptive in
presentation. Visible pyramid/table/framework structure is usually wrong for:

| Situation | Preferred behavior |
| --- | --- |
| Tiny factual answer | Answer directly. |
| Emotional or supportive moment | Be present first; structure only if useful. |
| Creative generation | Generate freely, then offer critique or structure if helpful. |
| Fast operational command | Do the action and report briefly. |
| Live brainstorming | Explore divergently before synthesizing. |
| User explicitly requests raw or unstructured output | Honor the requested form. |

## Architecture

Use a hybrid model.

| Layer | Source | Purpose |
| --- | --- | --- |
| Inborn defaults | Code | BrainShare's universal standards, versioned and shippable |
| Instance overrides | Supabase | Admin-editable changes without code edits |
| Prompt assembly | Runtime merge | Every agent gets defaults plus enabled overrides |
| Admin UI | WorkOS settings route | Quiet surface for editing standards |

### Files and Modules

| Area | New or changed piece | Responsibility |
| --- | --- | --- |
| Types | `apps/platform/src/lib/ai-standards.ts` | Standard types, default definitions, merge logic |
| Data reads | `apps/platform/src/lib/ai-standards.ts` | Fetch instance overrides and produce effective standards |
| Server actions | `apps/platform/src/lib/actions/ai-standards.ts` | Update enabled state, mode, title, instruction, and priority |
| Prompt renderer | `apps/platform/src/lib/agents/claude-prompt.ts` | Render effective standards into Claude's system prompt |
| Agent dispatch path | `apps/platform/src/lib/actions/posts.ts` or current invocation owner | Pass effective standards to the renderer |
| Admin route | `apps/platform/src/app/settings/ai-standards/page.tsx` | Server page that loads effective standards |
| Admin component | `apps/platform/src/components/ai-standards-settings.tsx` | Editable settings table/detail surface |
| Navigation | `apps/platform/src/components/sidebar.tsx` | Settings link in the sidebar footer/admin area |
| Migration | `apps/platform/supabase/migrations/0020_ai_standards.sql` | Store per-instance overrides |

## Data Model

Create a table for instance-level standard overrides. Defaults remain in code,
so the database only needs rows for changed standards or newly added custom
standards.

Recommended table: `ai_standards`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `instance_id` | uuid | References `instances(id)` |
| `standard_key` | text | Stable ID, unique per instance |
| `category` | text | `interaction` or `output` |
| `title` | text | Admin-visible title |
| `instruction` | text | Prompt-facing instruction |
| `mode` | text | `latent` or `visible_when_useful` |
| `enabled` | boolean | Whether included in effective standards |
| `position` | numeric | Stable ordering |
| `source` | text | `override` or `custom` |
| `created_at` | timestamptz | Timestamp |
| `updated_at` | timestamptz | Timestamp |

Constraints:

- `unique(instance_id, standard_key)`
- `category in ('interaction', 'output')`
- `mode in ('latent', 'visible_when_useful')`
- `source in ('override', 'custom')`

## Effective Standards Merge

Runtime prompt assembly should:

1. Load default standards from code.
2. Load override rows for the active instance.
3. For matching `standard_key`, replace default fields with override fields.
4. Include custom rows that do not match a default key.
5. Drop standards where `enabled = false`.
6. Sort by `position`, then title.

Defaults should be recoverable by deleting an override row or by a future
"Reset to default" action.

## Admin UI

Build a real future admin surface, not a debug page.

Route: `/settings/ai-standards`

Navigation: add a settings/admin link near the sidebar footer. In collapsed
mode, show an icon-only link with a tooltip.

Page shape:

- Header: "AI Standards"
- Short supporting copy: "Universal standards that shape how AI teammates
  collaborate and structure their output."
- Dense table or split table/detail layout.
- Rows grouped by category: Interaction and Output.
- Controls:
  - Enabled toggle
  - Mode selector
  - Editable title
  - Editable instruction
  - Position/order support can be simple in v0
  - Reset override action can be deferred if needed

Normal post threads should not show which standards were applied.

## Prompt Rendering

The Claude prompt should include a compact section in the system prompt:

```text
# BrainShare Inborn AI Standards
These are universal WorkOS standards for AI teammates. Apply them quietly to
almost every request. Use visible structure when it improves comprehension.

## Interaction
- Goal-first collaboration: ...

## Output
- Pyramid principle: ...
```

The section must not weaken the existing target mention guardrails. The
instruction to answer only the marked target post remains mandatory and should
stay near the top of the system prompt.

## Error Handling

If standards override retrieval fails, the agent should still respond using the
code defaults. A standards failure must not block `@Claude` replies.

Admin actions should validate non-empty titles and instructions. Failed saves
should leave local UI state intact and surface a concise error.

## Testing

Minimum test coverage:

- Default standards list contains the expected stable keys.
- Merge logic applies overrides, disables standards, includes custom standards,
  and preserves default fallback.
- Claude prompt includes the standards section.
- Claude prompt still marks and targets the intended mention.
- Server action validation rejects empty title or instruction.

If UI tests are lightweight in the repo, cover the settings page with typecheck
and targeted component tests only if local patterns already exist.

## Migration Path to BrainShare

This WorkOS implementation is a bridge. When BrainShare owns context assembly:

1. Convert code defaults into BrainShare Inborn `Standard` primitives.
2. Preserve stable IDs exactly.
3. Store instance overrides as instance-scoped standard mutations or policy
   overlays.
4. Have BrainShare context assembly return an "inborn standards" section in the
   LLM payload.
5. Remove direct WorkOS prompt assembly ownership once all agents consume
   BrainShare context.

## Open Decisions

- Whether admin route access is gated now or deferred until multi-user auth.
  In solo mode, the route can be available to the current user.
- Whether to support custom new standards in v0 or only edits to shipped
  defaults. The table supports custom rows either way.
- Whether reset-to-default is included in v0. It is useful but not required for
  first value.

## Out of Scope

- Exposing "standards applied" labels in normal AI replies.
- Building BrainShare's full context assembly service.
- Adding per-workspace or per-card standards overrides.
- Domain-specific seeded standards.
