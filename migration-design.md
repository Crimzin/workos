# Migration as Diagnostic — Magic Moment Design (v0.1)

*Captured 2026-04-28. Source of truth for Phase 4.0 build.*

---

## 1. Framing — Migration is a diagnostic, not a data import

Every PM tool says *"we'll move your stuff."* It's table-stakes. It is not a reason to switch.

Work OS migration says something different: **"we'll connect to your existing chaos and tell you something true and useful about how your team actually works that you've been avoiding seeing."**

That is the experience that makes someone say "I need that NOW." It is the first BrainShare magic moment, anchored in spec §6: *"Migration is not a chore — it IS the onboarding experience and the first Swarm magic moment."*

The differentiator is the structure BrainShare imposes on raw input — decisions, assumptions, contradictions, standards — surfaced as a diagnostic, not just an import progress bar. **A migration without BrainShare is just a slow data port. A migration with BrainShare is a mirror held up to the team.**

---

## 2. Teaser flow (marketing-surface mockup)

The flow a stranger sees on the product website. Designed to convert in under 90 seconds.

1. **Connect.** Single screen: connect Notion, Slack, Gmail (OAuth, read-only). User picks 1–3 sources.
2. **Scan.** ~30 seconds. Real-time visual: counters tick up live — *"decisions found: 47 → 51 → 58"*, *"contradictions detected: 3 → 7"*, *"untested assumptions surfaced: 12 → 19"*. Feels like the system is *thinking*, not loading.
3. **Diagnostic preview.** 3–5 punchy findings, each one specific enough to feel uncannily true:
   > *"We found 47 decisions buried in Slack threads. 12 of them contradict each other. 3 of them block what your team is currently working on in Notion."*
   >
   > *"Your strategy doc references 'the Q1 priorities' as settled. But your last 4 standups have re-litigated 2 of them. The team has not converged."*
   >
   > *"You have 8 untested assumptions sitting under active work. The oldest is 11 weeks old."*
4. **CTA.** *"Sign up to see the full picture, follow the threads, and turn this diagnostic into a working operational system."*

The findings are real — generated from the actual scanned data — not stock copy. The first encounter must feel like the system **already understands the user's specific situation**, because it does.

---

## 3. What gets diagnosed

The diagnostic surfaces the patterns BrainShare is built to track:

- **Buried decisions** — decisions made in Slack/email/docs that never made it into structured form. Count + sample list.
- **Contradicting decisions** — decision A and decision B can't both be true; surface the pair with sources.
- **Decisions blocking active work** — a past decision rules out an option that current work depends on.
- **Untested assumptions** — claims downstream work depends on, never validated. Age-weighted.
- **Priority drift** — stated priorities vs. revealed priorities (where attention/activity actually went).
- **Standards violations** — current work contradicts established team norms (code review patterns, design standards, etc.).

Each finding is a hypothesis with evidence the user can drill into. None are alerts — they're *competing causal explanations* in the Swarm sense: ranked, falsifiable, and labeled with confidence.

---

## 4. Dogfooding plan

**First instance: Will's Factor + Burn migration.**

Treated as a live test of the magic moment, not just a data move. Throughout the migration, capture observations:

- What surprised? (findings the user didn't expect)
- What was missed? (decisions/contradictions the system should have caught)
- What could have been inferred better? (signals the system saw but interpreted wrong)
- What felt magical vs. rote? (which findings landed as insights vs. felt mechanical)

These observations feed directly into the broader migration design. Will's migration is the first opportunity to see whether BrainShare's diagnostic instinct is strong enough to be the marketing pitch.

---

## 5. Open questions

- **Source priority order.** Spec §6.2 says: Factor → Notion → ClickUp → Linear → Asana/Jira → Google Docs/Sheets → Slack. For the *teaser* (90-second public demo), Slack is probably the highest-signal source — decisions hide in threads. Reconcile with spec ordering.
- **Free-tier diagnostic depth.** What's the public preview vs. the paid/signed-in deeper analysis? Cap the preview at 5 findings? At 10? Time-cap the scan?
- **OAuth scopes.** Read-only minimum. Audit which scopes Notion / Slack / Gmail actually need; aim for the smallest possible.
- **Output format.** Where do diagnostic findings live after sign-up?
  - As cards/posts in a "Diagnostic" workspace auto-created on first run?
  - As a standalone diagnostic doc that links into specific cards once the user enriches them?
  - Both — the doc as the first artifact, then findings get promoted into structured workspace data over time.
- **Privacy.** Ephemeral analysis (scan and discard source data) vs. cached source data for ongoing BrainShare context? Likely tier-based: ephemeral for the public teaser, cached (with consent) for paid users. Multi-tenancy story for teams: scoped to the connecting user, or visible to all team members?
- **Source data cleanup.** Slack threads contain noise. How aggressive should the noise filter be? Risk: filter out legitimate signal. Mitigation: low-confidence findings are surfaced as "weak signal" and the user can dismiss without judgment.

---

## 6. Roadmap slot

**Phase 4.0.** Hard prerequisite: BrainShare's structured-memory layer (Phase 2). Without it, this is just a data port.

The build sequence — once BrainShare is live:

1. Factor scrape (Will's immediate need, no API access — DOM scrape or export-import).
2. Notion connector (OAuth, official API).
3. Slack ingest (OAuth, official API; channel selection per workspace).
4. Diagnostic preview UI (the magic-moment surface — built on top of BrainShare's findings query API).
5. Dogfooding capture loop — observations from Will's migration feed back into the system's heuristics.

---

## See also

- `work-os-spec.md` §6 — Migration: The First Magic Moment
- `work-os-spec.md` §3 — BrainShare (the layer this depends on)
- `ai-ecosystem-roadmap.md` Phase 4.0 — Migration build sequencing
