# Provenance Source Chip Design

## Context

WorkOS treats provenance as product philosophy, not decoration: users should quickly understand whether a thread, message, or context item came from WorkOS, Claude, ChatGPT, or an unknown imported source. Imported chats are already stored as `nodes` with `source_kind = "imported_ai_chat"` and `source_app` metadata, and `#` mentions already insert durable `nodeMention` inline content that links to `/n/{id}` and feeds mentioned-node context into agent prompts.

The gap is visual consistency. Current source indicators use several unrelated idioms:

- Left rail imported chats use a small circular `C` / `G` mark.
- Imported message headers use a small bordered text badge.
- Sources settings show the app as plain text plus separate status pills.
- Context panel rows show source app as plain text separated by `/`.
- Activity copy uses sentence prose such as "Imported from Claude".
- `#` mention suggestions do not clearly identify source provenance.

## Approved Direction

Use a single compact source chip everywhere provenance appears. The approved visual direction is a small pill containing:

- a compact source mark (`W`, `C`, `G`, or `?`),
- the human-readable source label (`WorkOS`, `Claude`, `ChatGPT`, or `Unknown`),
- restrained token-based styling that works in light and dark mode.

This chip should be recognizable, dense enough for menus and rails, and explicit enough that users do not have to memorize icon meanings. It should replace one-off provenance indicators rather than add another variant.

## Behavior

`#` mention search should continue to show all mentionable threads in one list, not a separate imported-chat group. Each candidate row should display the same source chip next to or under the thread title. Imported chats should be searchable by title, path, source title, source conversation id, and source app label where available.

Mention storage remains unchanged:

```json
{ "type": "nodeMention", "props": { "id": "...", "title": "...", "type": "...", "path": "..." } }
```

Imported chats stay normal node mentions, so existing links, context gathering, and agent prompt inclusion continue to work.

## Component Boundary

Add one shared Platform component for provenance display named `SourceChip`, with named exports and token-based Tailwind classes. It should accept `sourceApp`, optional `compact`, and optional `className` props. It should live at `apps/platform/src/components/source-chip.tsx`.

Add source metadata helpers beside existing source label helpers rather than duplicating app-label maps inside components. Sidebar-specific `SourceLogo` should be removed or reduced to using the shared source metadata.

## UI Surfaces

Use the shared source chip in:

- Imported Chats rows in the left rail.
- `#` mention suggestion rows.
- Imported message headers.
- Context attachment rows in the context panel.
- Sources settings rows.
- Other existing user-facing provenance labels touched during the audit, where the source is an app/source provenance rather than a separate status.

Do not convert non-provenance status pills such as "In rail", "Hidden", "Allowed", or "Ignored" into source chips.

Activity prose can keep sentence structure where it describes an event, but the source token inside the event should use the same source-chip language when the layout supports inline React content.

## Data Flow

Extend node mention candidate rows to include `source_kind`, `source_app`, `source_title`, and `source_conversation_id`. Build candidates with `sourceApp` so the editor can render source chips, and include provenance metadata in the searchable text for imported chats.

No database migration is required. The existing `nodes` source columns already support the feature.

## Testing

Add tests before implementation for:

- `buildNodeMentionCandidates` returning source app metadata for WorkOS and imported chats.
- Imported chat mention search matching source app labels and source titles/conversation ids.
- The shared source metadata helper returning stable labels and marks for WorkOS, Claude, ChatGPT, and Unknown.
- A lightweight component/source audit test if practical, to prevent reintroducing sidebar-local source logo maps or plain app labels in the touched surfaces.

Run focused tests plus TypeScript. Run lint on touched files if the existing setup supports focused lint without unrelated failures.

## Out Of Scope

- Changing the persisted BlockNote inline mention schema.
- Creating separate imported-chat mention groups.
- Adding new source apps beyond current `SourceApp` values.
- Redesigning status pills that are not provenance indicators.
