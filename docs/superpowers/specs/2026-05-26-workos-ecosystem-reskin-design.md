# WorkOS Ecosystem Reskin Design

Date: 2026-05-26
Status: Draft for review

## Purpose

WorkOS should feel like part of the same visual ecosystem as the personal website, while remaining a standalone product with no personal-site branding, copy, or navigation.

The goal is a seamless transition for potential buyers moving between the public site and the WorkOS product surface. The shared identity should come from color, typography, interaction feel, and material treatment. WorkOS should not display "Will Corbett" branding or links back to the personal site as part of this work.

## Design Direction

Use an ecosystem reskin rather than a simple token swap or a full editorial redesign.

WorkOS should adopt the personal site's warm cream, deep green-teal, charcoal, muted divider, and copper accent palette. It should also adopt the personal site's typography system: Inter as the primary interface font and Fraunces as a selective display face.

Because WorkOS is a repeated-use work surface, the app should stay denser and quieter than the public site. The public site can use large editorial composition; WorkOS should translate that language into calm product UI: warm panels, crisp controls, readable hierarchy, restrained motion, and high contrast where work is dense.

## Non-Goals

- Do not add personal-site branding, personal navigation, personal copy, or personal imagery.
- Do not turn the app into a landing page or editorial layout.
- Do not remove WorkOS's current light/dark theme behavior.
- Do not change product workflows, data model behavior, or routing as part of the reskin.
- Do not introduce hardcoded colors in components where design tokens already exist.

## Theme Tokens

WorkOS should keep its existing CSS custom property structure and Tailwind token mapping, then remap the values to the personal-site palette.

Light mode should use:

- Primary background: warm cream from the personal site.
- Secondary surfaces: slightly darker cream for sidebars and low-emphasis panels.
- Card surfaces: warm off-white rather than pure stark white where possible.
- Primary text: warm charcoal.
- Secondary text: muted warm gray.
- Accent: deep green-teal for primary structural emphasis.
- Warm accent: copper for active links, selected states, and important calls to action.
- Divider: muted blue-green gray.

Dark mode should use:

- Primary background: deep green-teal.
- Secondary surfaces: darker teal and near-black teal.
- Primary text: warm cream.
- Secondary text: muted warm gray.
- Accent: warm gold for emphasis on dark surfaces.
- Warm accent: brighter copper for action states.
- Divider: subdued teal-gray.

WorkOS-specific semantic tokens should remain:

- Status colors keep distinct blue, amber, green, and red meanings, adjusted only if contrast suffers.
- Agent accent remains purple so AI actors stay recognizable across the app.
- Badge colors remain a six-color system, but should be rebalanced to harmonize with the new palette.

## Typography

Replace the WorkOS app font pairing with the personal site's type language:

- Primary UI font: Inter.
- Display font: Fraunces.
- Monospace font: keep JetBrains Mono for timestamps, code, technical IDs, and compact machine-readable details.

Inter should handle most app UI: sidebar rows, cards, fields, buttons, posts, menus, panels, and settings.

Fraunces should be used sparingly for high-level product moments where brand tone matters without hurting app density:

- workspace or thread title treatments,
- large empty-state headings,
- major settings page headings,
- occasional top-level section titles.

Fraunces should not be used inside dense lists, board cards, field chips, table-like rows, menus, or small controls.

## Component Treatment

The first implementation pass should focus on high-leverage surfaces:

- global tokens and font loading,
- theme toggle,
- sidebar,
- app shell background,
- board rows and card tiles,
- detail panel,
- field badges and chips,
- buttons, icon buttons, hover states, focus rings, and selected states.

The reskin should preserve existing component boundaries and patterns. The main work is to make the existing system speak the new visual language through tokens and a small number of component-level refinements.

Cards and panels should remain compact, with radii at or below the existing 8px design rule unless a specific existing pattern requires otherwise. Shadows should stay subtle; contrast should come mainly from surface, border, and typography rather than heavy elevation.

## Theme Toggle

The theme toggle should preview the destination theme, not describe the current theme.

In light mode:

- the toggle should look like the dark destination,
- use deep teal or dark teal background,
- use warm cream icon/text,
- show the moon/dark-mode cue,
- keep the accessible label as "Switch to dark mode."

In dark mode:

- the toggle should look like the light destination,
- use warm cream background,
- use deep teal icon/text,
- show the sun/light-mode cue,
- keep the accessible label as "Switch to light mode."

This matches the personal site's interaction model and makes the control feel like a preview of where the user is going.

## Light And Dark Mode Behavior

Preserve WorkOS's existing theme architecture:

- explicit `:root.light` and `:root.dark` classes from the theme provider,
- system preference fallback when no explicit preference is stored,
- FOUC-safe inline initialization before hydration.

The implementation should update token values and toggle styling without changing the storage key, provider shape, or current accessibility behavior.

## Testing And Verification

Verification should include:

- TypeScript and lint checks for touched files.
- A visual pass in light and dark mode.
- Screenshot checks for the sidebar, board, detail panel, and settings surfaces if a dev server can run.
- Contrast spot checks for primary text, secondary text, borders, selected states, badges, focus rings, and the theme toggle in both modes.

The reskin is complete when WorkOS still behaves like the same product, but visually feels like the application counterpart to the personal website.
