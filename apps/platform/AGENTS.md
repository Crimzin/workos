<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:browser-rules -->
# Browser control

Drive the browser yourself by default (Chrome MCP or computer-use). If one attempt fails, stop and ask the user to intervene rather than retrying blindly.
<!-- END:browser-rules -->

<!-- BEGIN:git-rules -->
# Git discipline

Commit often. Minimize uncommitted changes — each logical unit of work gets its own commit before moving on.
<!-- END:git-rules -->

<!-- BEGIN:suggestion-rules -->
# Proactive suggestions

While working, flag things that clearly make sense given the project's intentions and the standards already being built — even if not explicitly requested. Surface these as a short list at the end of a response (not mid-task). Prioritize suggestions that: (1) complete an obvious gap in an existing feature, (2) add a clearly missing affordance that the spec implies, or (3) fix a latent bug in adjacent code. Don't suggest refactors, abstractions, or things that require a design decision.
<!-- END:suggestion-rules -->
