# BUNKER — Previous visual direction

## Keep this look

The preferred BUNKER interface is the earlier charcoal / near-black design with a warm red-orange accent and an atmospheric incident setting.

The visual character is dark, cinematic and editorial, but remains a functional browser game. The game cards are the focal point; supporting UI should feel like part of the same world rather than a generic SaaS dashboard.

## Style rules

- Preserve the established dark graphite and charcoal surfaces.
- Preserve the warm red-orange accent already defined in the existing styles.
- Keep the atmospheric hero treatment and original card artwork.
- Maintain typography, spacing and component treatment from `src/bunker-reference.css` and `src/bunker-polish.css`.
- Do not replace the look with olive / paper palettes or a new unrequested concept.
- Avoid neon cyberpunk, purple-blue gradients, glassmorphism, excessive rounded cards, excessive bold text and tiny body copy.
- Do not turn every region into a separate boxed panel.
- Do not introduce random colors, font families or decorative UI elements.

## Source of truth

The stylesheet order in `src/main.tsx` is intentional:

1. `src/index.css`
2. `src/bunker-reference.css`
3. `src/bunker-polish.css`

The last stylesheet contains carefully chosen refinements. Do not delete, replace or bypass these files as a visual cleanup shortcut.

## Game-feature changes

New game features, including action-card controls, must adapt to this established visual language. Do not redesign the whole product to accommodate one new feature.

Visual changes must not alter game rules, Supabase behavior, card visibility, dealing, voting, round progression or action-card effects.
