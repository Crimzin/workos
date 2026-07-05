# Focus V1 Design

Status: draft for user review
Date: 2026-07-05
Audience: WorkOS product/design/engineering collaborators

## Summary

Focus V1 is the WorkOS home surface for knowing what to do next.

It is not a feed, dashboard, task database, calendar clone, or ranked thread inbox.
It is a time-aware briefing experience: when the user opens Focus, WorkOS generates
a fresh planning post appropriate to the moment, helps the user refine it through
conversation, and can turn the approved plan into scheduled calendar blocks.

The simplest product description is:

> Focus is a to-do list that thinks.

It creates the first draft of the user's priorities, next moves, and schedule. The
user then steers it through chat, inline actions, and eventually direct schedule
manipulation. The ethos is always:

> WorkOS takes the first pass. The user stays in control.

## Product Context

The canonical WorkOS direction is one user-facing product with internal capability
layers hidden behind plain surfaces:

- BrainShare powers memory, provenance, context assembly, and import synthesis.
- Swarm powers Focus: operational intelligence and prioritization.
- Finiti powers Workflows.

The user should see "Focus," not "Swarm."

Earlier docs described Focus as a sparse ranked view of existing threads. That is
too passive and source-oriented for the intended experience. Threads remain the
core substrate, but Focus should feel like a home-based command center that
answers, "What should I do now, and how should I protect time for it?"

## V1 Scope

V1 includes:

- a Focus page accessible as a primary WorkOS surface;
- generated time-aware Focus briefings;
- conversational refinement of the briefing;
- lightweight Focus items synthesized from existing WorkOS context;
- a hard thread-anchor invariant for every Focus item;
- Google Calendar read/write integration for planning against real time;
- first-draft schedule generation;
- calendar-block creation after explicit user approval;
- source/provenance affordances that explain why Focus recommended an item;
- "not this week" and deferral handling;
- low-confidence behavior when WorkOS lacks enough context.

V1 does not include:

- first-run onboarding as the full Focus experience;
- Apple Calendar two-way sync;
- standalone task objects disconnected from threads;
- autonomous calendar writes without approval;
- arbitrary background rescheduling of the user's calendar;
- external integrations such as Granola, LinkedIn, Gmail, or data rooms as
  required V1 dependencies;
- a visible Swarm-branded surface;
- a multi-widget dashboard as the default experience.

## Future Reserved Scope

Focus should eventually become the WorkOS onboarding home.

After signup and password setup, the same Focus surface should guide the user
through a diagnostic setup experience:

- interview the user about goals, roles, preferences, planning style, and work
  constraints;
- help import Claude and ChatGPT history;
- help configure API keys and model providers;
- help connect calendar and other integrations;
- summarize what WorkOS learned;
- produce the first useful plan.

That first-run Focus state is reserved for v1.1 or later. V1 should not build
the full onboarding flow, but it should avoid architectural choices that make
onboarding feel like a discarded wizard later. Setup artifacts should become
live memory used by the normal Focus briefing.

## Core Experience

When the user opens Focus, WorkOS generates a fresh briefing post. The briefing
is framed by the current day, time, calendar state, recent work, and durable
goals.

Example modes:

- Monday morning: weekly orientation and priority negotiation.
- Normal morning: yesterday recap, today orientation, and first useful move.
- Midday: plan repair, slippage detection, and next-block recommendation.
- End of day: closure, capture, and tomorrow setup.
- Friday afternoon: reflection, cleanup, and next-week setup.
- Ad hoc: user-requested replan after a disruption.

The page should remain simple:

- the generated Focus briefing;
- inline actions attached to the briefing and its items;
- a reply composer for conversational edits;
- source/context affordances;
- schedule preview when the user asks Focus to draft time blocks.

The default interaction loop is:

1. User opens Focus.
2. WorkOS generates a time-aware briefing.
3. User corrects, reranks, defers, or confirms.
4. WorkOS turns priorities into concrete next moves.
5. User asks WorkOS to draft a schedule.
6. WorkOS proposes time blocks around existing calendar commitments.
7. User edits by chat or page controls.
8. WorkOS writes approved blocks to Google Calendar.

## Focus Briefings

A Focus briefing is a generated planning post. It should read like a thoughtful
operator who understands the user's real work, not like a notification digest.

The briefing should:

- acknowledge the current moment;
- recap relevant recent progress only when useful;
- identify the critical priorities;
- distinguish critical priorities from "on the radar" items;
- explain how priorities advance durable goals;
- name tradeoffs and overload;
- ask for the smallest useful correction;
- offer to draft a schedule when the plan is stable enough.

Example Monday-morning shape:

```text
Happy Monday. Ready for another big week?

Last week you got a lot done: X, Y, and Z. Well done. The weekend was quiet,
which is fine. You earned the rest.

Here are the critical priorities I see this week:

1. Unblock the Saglo engagement
2. Build job-search momentum with a few targeted applications
3. Test the core WorkOS value prop with real users

These take you a meaningful step forward on your goal of figuring out your next
career landing spot by the end of summer.

A few other things are on the radar, time permitting:

4. Keep expanding your IRL AI network in NYC
5. Decide whether Heavy Metal is worth pursuing seriously
6. Spec the first Workflows experience

That is a lot. If there is one thing that absolutely must happen this week,
what is it?
```

## Focus Items

A Focus item is a lightweight, synthesized next move or priority in Focus.

It can represent:

- one next step on one thread;
- several next steps on one thread;
- a cross-thread priority that links to multiple threads;
- a calendar block attached to a thread;
- a deferral decision for a thread;
- a planning question whose answer updates a thread.

Focus items are not the same thing as cards, tasks, calendar events, or threads.
They are a time-sensitive planning layer over the thread substrate.

### Thread Anchor Invariant

Every Focus item must anchor to at least one WorkOS thread.

This is a hard rule. Nothing in Focus floats outside the WorkOS thread model.
The relationship is not necessarily one-to-one:

- one thread can have many Focus items;
- one Focus item can connect several threads;
- a single calendar block can schedule work for a Focus item anchored to a
  thread;
- a cross-cutting priority can anchor to a parent thread and several child
  threads.

If Focus identifies a valuable next move that does not logically belong to any
existing thread, it must ask the user where it should live before accepting it
as a Focus item.

The user options should be:

- create a new thread;
- attach it to an existing thread;
- fold it into another Focus item;
- defer it;
- dismiss it.

Focus should not silently create orphan tasks.

## Prioritization Model

The default optimization posture for V1 is maximum progress on the user's
highest-leverage problems.

Focus should still consider:

- commitments and deadlines;
- user energy and attention constraints;
- calendar reality;
- open loops;
- stale decisions;
- unresolved questions;
- recent user corrections;
- urgency;
- importance;
- dependency chains;
- "not this week" boundaries.

Future versions can let the user explicitly choose or tune the posture, such as:

- deep progress;
- protect energy;
- keep commitments from slipping;
- reduce ambiguity;
- clean up admin debt.

For V1, the product should bias toward leverage while explaining when it chooses
commitment-protection or schedule-repair instead.

## Context Interpretation Rule

Focus must distinguish between:

- context about how the user works;
- work the user should actually do.

Recent conversations are evidence, not automatic priorities.

For example, if a VC user has a long conversation about AI workflow tooling,
Focus should learn that the user is calendar-driven, context-constrained,
legally cautious, and interested in better synthesis. It should not conclude
that the user's week should be spent building AI workflows.

The user's real operating objectives should drive the plan. For a VC, that means
sourcing, evaluating, tracking, engaging, and deciding on potential ventures.
Tooling improvements are only priorities when they serve those objectives and
belong in the current time horizon.

## Calendar Integration

Calendar integration is required for V1 to feel credible to high performers.
Focus should plan against real time, not abstract priority.

V1 calendar scope:

- Google Calendar read access for availability and scheduled commitments;
- Google Calendar write access for WorkOS-created Focus blocks;
- calendar-block preview before writing;
- explicit approval before creating or changing calendar blocks;
- mapping between calendar blocks, Focus items, and thread anchors;
- support for rescheduling WorkOS-owned Focus blocks.

V1 should not silently move existing non-WorkOS calendar events. If the user
asks Focus to move or rearrange existing calendar events, Focus may propose the
change and request explicit confirmation. The V1 default is to create and move
WorkOS-owned Focus blocks around external commitments, not to mutate unrelated
calendar events. Moving user-owned external events can be a later capability if
Google permissions, attendee semantics, and user trust are handled cleanly.

Apple Calendar:

- Apple Calendar two-way sync is not a V1 dependency.
- A later version can add a read-only subscribed Focus calendar feed for Apple
  users.
- True Apple two-way integration should be treated as a later project because
  the clean Apple API path is native-device EventKit, while web/cloud sync tends
  to require heavier CalDAV or app-specific-password flows.

## Scheduling UX

The schedule should not be a permanent split-screen dashboard in V1.

The primary surface is still the briefing conversation. Scheduling appears when
the user asks Focus to draft the schedule or when Focus thinks the plan is ready
to commit.

The schedule draft should:

- be presented in plain language first;
- show enough structure to make tradeoffs obvious;
- indicate which blocks are WorkOS-created vs existing calendar events;
- allow chat edits;
- allow simple page edits such as moving, shortening, splitting, or deleting a
  proposed Focus block where feasible;
- write to calendar only after approval.

Example flow:

```text
User:
Looks good. Keep pushing WorkOS forward in small ways in between the big items.
Go ahead and draft the schedule.

Focus:
Here is the schedule I would propose, working around your existing meetings:

Monday
- 9:30-10:45: Saglo engagement decision
- 11:15-12:00: Email Melissa with proposed path
- 2:00-3:30: WorkOS ICP and feedback list

Tuesday
- 9:00-10:30: Apply to 3 highest-fit roles
- 1:00-1:45: Find network matches for saved jobs

I left Friday afternoon light because the week has enough moving pieces. Want
me to put these blocks on your calendar?
```

## Inline Actions

Focus should support inline actions where they reduce friction.

Likely V1 actions:

- rerank;
- defer;
- mark as "not this week";
- split into steps;
- schedule;
- draft schedule;
- open thread;
- show why;
- create thread;
- attach to thread;
- mark done;
- regenerate briefing;
- repair plan.

Inline actions should not replace chat. Chat remains the flexible control plane.

## Data Concepts

The implementation does not need to finalize the exact schema in this design
spec, but the product model should include these concepts:

- Focus briefing: generated post/session for a moment in time.
- Focus item: lightweight synthesized next move anchored to thread(s).
- Thread anchor: required link from Focus item to one or more WorkOS threads.
- Calendar block: scheduled event associated with a Focus item and thread.
- User correction: ranking, deferral, edit, acceptance, rejection, or natural
  language feedback that should inform future briefings.
- Evidence/source reference: posts, threads, memory primitives, imports,
  calendar events, or user preferences that justify the recommendation.

Focus items should be durable enough to support scheduling, completion,
deferral, and future learning. They should not become a separate task universe.

## Source And Provenance

Every significant recommendation should be explainable.

Focus does not need to show citations inline for every sentence, but each
priority should have a "why" affordance that can reveal:

- linked thread(s);
- relevant recent posts;
- decisions;
- assumptions;
- open questions;
- calendar constraints;
- imported source material where available;
- user preferences or goals used in the ranking.

When the system lacks context, it should say so and ask for the missing piece or
suggest an integration.

Examples:

- "I can infer this from your WorkOS thread, but I do not have Granola meeting
  notes yet."
- "I can schedule around Google Calendar, but I cannot see Apple Calendar."
- "I see this as important, but it does not belong to an existing thread. Want
  me to create one?"

## Empty And Low-Context States

Focus should degrade gracefully when WorkOS does not yet know enough.

If there is no calendar connected:

- explain that Focus can draft priorities but cannot plan honestly against time;
- prompt the user to connect Google Calendar.

If there are few or no threads:

- prompt the user to create or import context;
- allow Focus to ask a lightweight planning question;
- suggest creating a starter thread for the most important current goal.

If priorities are ambiguous:

- propose a provisional ordering;
- ask the user to identify the must-win item;
- avoid pretending to know more than it does.

If a recommendation has no thread anchor:

- ask whether to create or attach a thread before accepting it.

## Modes By Time

Focus should use the current time as product context.

### Monday Morning

Purpose: choose the week.

The briefing should:

- recap meaningful prior-week progress;
- identify critical weekly priorities;
- distinguish radar items from commitments;
- ask for reranking or the must-win priority;
- offer to draft the week schedule.

### Normal Morning

Purpose: start the day with orientation.

The briefing should:

- recap yesterday if useful;
- identify what changed;
- name today's likely priorities;
- recommend the first work block;
- ask whether the plan should change.

### Midday

Purpose: repair reality.

The briefing should:

- compare planned vs actual progress;
- identify slipped blocks or overloaded afternoons;
- recommend the next useful move;
- suggest deferrals or schedule changes.

### End Of Day

Purpose: close loops.

The briefing should:

- summarize what moved;
- capture unfinished items;
- propose what should carry into tomorrow;
- ask for corrections before storing the day summary.

### Friday Afternoon

Purpose: reflect and set up next week.

The briefing should:

- compare week plan vs actual;
- identify wins, slippage, and emerging patterns;
- suggest what to clean up before the weekend;
- tee up Monday priorities without forcing full planning.

## Error Handling

Focus should handle failures visibly and calmly.

If briefing generation fails:

- show the last successful briefing if available;
- offer retry;
- allow the user to start a manual planning note.

If calendar sync fails:

- preserve the schedule draft inside WorkOS;
- explain that calendar write did not happen;
- offer retry after reconnecting.

If calendar conflicts appear after draft:

- mark affected blocks as stale;
- ask whether to repair the schedule.

If source retrieval is incomplete:

- lower confidence;
- show what context was missing;
- ask for permission to proceed with a provisional plan.

## Privacy And Control

Focus is proactive but not autonomous.

V1 should follow these rules:

- no calendar writes without explicit approval;
- no moving external calendar events without explicit approval;
- no orphan Focus items;
- no claiming certainty without evidence;
- no exposing internal BrainShare/Swarm/Finiti names to users;
- all recommendations should be traceable to threads and evidence;
- user corrections should update future behavior.

## Acceptance Criteria

Focus V1 is successful when:

- opening Focus generates a useful time-aware briefing;
- the briefing changes meaningfully by Monday morning, normal morning, midday,
  end of day, and Friday afternoon contexts;
- every Focus item links to at least one WorkOS thread;
- Focus asks to create or attach a thread when no suitable anchor exists;
- the user can rerank, defer, or correct the plan conversationally;
- Focus can draft a schedule from accepted priorities;
- the schedule accounts for existing Google Calendar commitments;
- WorkOS-created Focus blocks can be written to Google Calendar after approval;
- calendar blocks remain linked back to Focus items and thread anchors;
- the user can inspect why a recommendation appeared;
- low-context and disconnected-calendar states are useful rather than blank.

## Implementation Planning Notes

The implementation plan should decide:

- exact schema for Focus briefings, Focus items, thread anchors, and calendar
  blocks;
- whether V1 stores Focus briefings as posts, a dedicated table, or both;
- whether schedule editing V1 is chat-only plus simple controls, or includes
  drag/drop block editing;
- how Google OAuth tokens are stored and refreshed;
- how WorkOS distinguishes WorkOS-owned Focus blocks from external calendar
  commitments;
- how generated briefings are cached so opening Focus feels fresh without
  generating redundant posts on every navigation;
- how user corrections feed future prioritization.

These are implementation choices, not open product requirements.
