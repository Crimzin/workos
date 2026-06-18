# Dossier-First Starter Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve AI import starter context generation so it writes broad, structured, memo-quality context instead of recency-biased prose or raw extraction sections.

**Architecture:** Keep the first implementation focused on BrainShare's synthesis contract. The Claude synthesis prompt will require a coverage dossier, anti-recency audit, subject-appropriate memo structure, and structured memo devices while preserving the existing `starting_context_memo_markdown` import path.

**Tech Stack:** Python 3.10+, FastAPI BrainShare service, existing Python assertion tests, WorkOS Platform TypeScript markdown-to-BlockNote rendering.

---

### Task 1: Guard the Prompt Contract

**Files:**
- Modify: `apps/brainshare/tests/test_conversation_synthesis.py`
- Modify: `apps/brainshare/app/conversation_synthesis.py`

- [ ] **Step 1: Write the failing prompt-contract test**

Add assertions to `test_claude_synthesis_prompt_requests_freeform_starting_context_memo` requiring the prompt to mention the dossier-first behavior:

```python
    assert "coverage dossier" in prompt
    assert "origin narrative" in prompt
    assert "major named concepts" in prompt
    assert "target users" in prompt
    assert "tests, prototypes, and evidence" in prompt
    assert "anti-recency" in prompt
    assert "tables, bullets, numbered lists, timelines, or checklists" in prompt
    assert "self-audit" in prompt
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
uv run python tests/test_conversation_synthesis.py
```

Expected: FAIL because the current prompt only asks for a freeform memo and does not require dossier-first coverage.

- [ ] **Step 3: Update `STARTING_CONTEXT_MEMO_INSTRUCTIONS`**

Replace the current memo rules with a more specific contract that still supports freeform subject-aware structure:

```python
STARTING_CONTEXT_MEMO_INSTRUCTIONS = """Starting Context memo rules:
- Each topic must include starting_context_memo_markdown.
- Before writing the visible memo, build a coverage dossier in your scratch work. Use it to fight recency bias and missing-context bias.
- The coverage dossier should account for: origin narrative; major named concepts, projects, people, and products; target users or audiences; tests, prototypes, and evidence; decisions and pivots; unresolved tensions, risks, questions, and constraints; and likely related subthreads.
- Write the visible memo as a simple but substantial handoff that could be sent to a thoughtful person or AI agent to get them ready to engage.
- Choose the memo structure freely based on the subject matter. Use the smallest set of headings that makes the context clear.
- Use tables, bullets, numbered lists, timelines, or checklists when they make the memo easier to scan or act on. Do not write undifferentiated prose for complex subjects.
- Do not expose BrainShare extraction categories as visible headings unless they are genuinely natural for the subject.
- Do not force project-management sections onto non-project material.
- Suitable structures may look very different for product strategy, recipes, emotional reflection, creative writing, research, personal planning, or technical debugging.
- The memo should explain what this is about, how the idea or situation developed, why it matters, what is already established, what has been tried or tested, who or what it is for, what is still alive or unresolved, and how to engage next.
- For long or wide-ranging conversations, prefer an overarching narrative with structured sections over a recent-message recap.
- Run a self-audit before returning JSON: check for anti-recency coverage, omitted major named concepts, missing origin story, missing target users/audience when relevant, missing tests/prototypes/evidence when relevant, and a weak or tautological next-step section. Revise the memo if it fails.
- Use citations and source spans as background evidence, not as the main visible payload unless provenance is directly useful to the reader."""
```

- [ ] **Step 4: Run the test and verify it passes**

Run:

```bash
uv run python tests/test_conversation_synthesis.py
```

Expected: PASS.

### Task 2: Verify Platform Compatibility

**Files:**
- Read-only verification: `apps/platform/src/lib/import-preview.ts`
- Read-only verification: `apps/platform/src/lib/agents/markdown-to-blocknote.ts`
- Test: `apps/platform/src/lib/import-preview.test.ts`
- Test: `apps/platform/src/lib/import-materialization.test.ts`

- [ ] **Step 1: Run Platform memo-rendering tests**

Run:

```bash
npx --yes tsx apps/platform/src/lib/import-preview.test.ts
npx --yes tsx apps/platform/src/lib/import-materialization.test.ts
```

Expected: PASS. Existing freeform markdown rendering should already support headings, bullets, numbered lists, and pipe tables.

- [ ] **Step 2: Run focused BrainShare syntax verification**

Run:

```bash
uv run python -m py_compile app/conversation_synthesis.py tests/test_conversation_synthesis.py
```

Expected: PASS.

### Task 3: Commit the Starter Context Prompt Iteration

**Files:**
- Stage: `apps/brainshare/app/conversation_synthesis.py`
- Stage: `apps/brainshare/tests/test_conversation_synthesis.py`
- Stage: `docs/superpowers/plans/2026-06-18-dossier-first-starter-context.md`

- [ ] **Step 1: Review the diff**

Run:

```bash
git diff -- apps/brainshare/app/conversation_synthesis.py apps/brainshare/tests/test_conversation_synthesis.py docs/superpowers/plans/2026-06-18-dossier-first-starter-context.md
```

Expected: only the prompt contract, prompt test, and plan are changed.

- [ ] **Step 2: Commit**

Run:

```bash
git add apps/brainshare/app/conversation_synthesis.py apps/brainshare/tests/test_conversation_synthesis.py docs/superpowers/plans/2026-06-18-dossier-first-starter-context.md
git commit -m "feat(brainshare): require dossier-first starter context"
```

Expected: commit succeeds without staging unrelated mobile shell or RLS changes.
