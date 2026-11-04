# BUNKER — Master Design System

## Product and design intent

BUNKER is a multiplayer survival / discussion game with a technical disaster scenario. The interface must feel like a real game product used by a group of people during a live session, not a generic SaaS dashboard and not a cyberpunk game HUD.

**Chosen direction:** restrained industrial editorial.

The visual character comes from typography, hierarchy, alignment, a narrow signal-red accent and the physical treatment of game cards. The interface around the cards stays flat and quiet so the cards and current game phase remain the focus.

## Non-goals

Do not introduce:
- Neon cyberpunk colors, scanlines, glitch effects or glowing HUD decorations.
- Purple/blue gradients, glassmorphism, blurred floating panels or mesh backgrounds.
- Repeated grids of identical rounded cards.
- Pill-shaped controls, stacked shadows or text shadows.
- Emoji as interface icons.
- Tiny body text or metadata used as the main way to communicate state.
- New game rules or altered action semantics as part of visual work.

A visual change must not modify Supabase calls, room state, round progression, card visibility, voting, elimination or action-card effects.

## Design tokens

Implementation source of truth: `src/bunker-design-system.css`.

### Palette

| Token | Value | Use |
|---|---:|---|
| `--color-page` | `#0d0f11` | Main page background |
| `--color-surface` | `#111417` | Primary panel surface |
| `--color-surface-raised` | `#15191c` | Raised surface / modal |
| `--color-surface-hover` | `#1a1f23` | Hover surface |
| `--color-text` | `#eceeeb` | Primary text |
| `--color-text-secondary` | `#c0c5c5` | Supporting text |
| `--color-text-muted` | `#9ba3a7` | Secondary labels |
| `--color-accent` | `#d65d46` | One signal accent / primary action |
| `--color-success` | `#7eaa8e` | Positive state |
| `--color-warning` | `#d6a45c` | Warning / crisis metadata |

The red-orange accent should remain an accent, not a large decorative background. Status must never be communicated by color alone.

### Typography

- Display: IBM Plex Sans Condensed — major headings, round numbers and card titles.
- Interface: IBM Plex Sans — controls, paragraphs, player names and body text.
- Metadata: IBM Plex Mono — invite codes, counts, timers and compact labels.
- Body text defaults to 16px with approximately 1.55 line-height.
- Display headings use a tight line-height and restrained negative tracking.
- Keep normal supporting copy readable; do not solve hierarchy by making body text tiny.

### Shape, spacing and depth

- Use the 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 spacing rhythm.
- Controls: small radius; panels: slightly larger radius; cards: nearly square corners.
- Hairline borders separate surfaces. Avoid shadow on ordinary panels.
- Use a single restrained shadow only where physical card depth or an overlay needs it.
- Prefer whitespace and alignment over extra containers and separators.

## Screen composition

### Landing

The hero is an asymmetric typographic composition: incident statement on the left, concise game facts on the right. No centered marketing hero and no decorative image placeholder.

The play area prioritizes the player's callsign and two clear paths:
1. Create a room (normal game or test room).
2. Join with an invite code.

The deck categories form a two-column indexed list, not a repeated feature-card grid.

### Room lobby

The participant list is the primary surface. Invitation code and settings form a quieter secondary rail. Empty seats remain visibly different from connected players. The host action is visually primary; refresh and exit remain secondary.

### Live game

The current phase and its next action are the primary focal point. The game layout uses a wide play area with a narrower information rail. Crisis and hand cards keep a paper-like face; panels around them stay flat. Public reveals are rendered as a compact record/list, not nested tiles.

The mobile hand may use a local horizontal card rail; the rest of the page remains vertically scrollable.

### Catalogue

Search and category filters are first. The catalogue count is visible. Card faces remain consistent with the cards in a live game.

## Interaction and accessibility

- Every control needs default, hover, focus-visible, active and disabled states.
- Target size is at least 44px for primary mobile controls.
- Keep at least 8px between adjacent controls.
- Inputs need visible labels and a clear focus/error state.
- Keyboard focus must remain visible. The global skip link goes directly to the page content.
- Keep page landmarks semantic; do not nest `main` landmarks.
- Honor `prefers-reduced-motion`.
- Animation is functional feedback, not decoration. Prefer short transitions on color/background/border; do not animate layout dimensions.
- Empty, loading, error and success states must explain what happened or what the player can do next.

## Responsive checks

Review at 320px, 375px, 768px, 1280px and wide desktop.

- No page-level horizontal overflow.
- The game hand may scroll horizontally as a self-contained card rail.
- At narrow widths, navigation may wrap rather than clipping actions.
- The play area collapses to one column; the roster and status move below it.
- Preserve legible card text and controls without relying on hover.

## Change discipline

Before changing a component, identify its purpose and state transitions. Reuse semantic tokens instead of raw color literals or inline styling. Do not add a new visual language to one screen. Keep all game behavior and database operations unchanged during design-only work.

## Implementation

- React components: `src/components/`
- Global reset / Tailwind base: `src/index.css`
- Product design system: `src/bunker-design-system.css`
- Entry point imports only the base stylesheet and this design system.
