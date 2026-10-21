# ApexSovereign.ai Peak Command Center

## Design direction

**Design Movement:** Institutional cyber-finance command center: precise, restrained, high-contrast, and built around decision velocity.

**Core principles:**
- Truth before theater: every status communicates whether it is live, simulated, or unavailable.
- One primary decision per view: reserve capacity, inspect telemetry, settle credits, or integrate.
- Dense when useful, calm when idle: use information hierarchy instead of glowing decoration.
- Enterprise trust: stable layout, accessible contrast, keyboard focus, and responsive behavior.

**Color philosophy:** Void graphite is the operating surface; electric cyan is the brand signal for routing and compute; mint is reserved for verified/healthy states; amber is explicitly reserved for simulation or degraded conditions; red is reserved for actionable failure.

**Layout paradigm:** A fixed command rail/topbar with a compact primary workspace and contextual side panel. Avoid a wall of equal-weight cards; promote the current decision and demote secondary telemetry.

**Signature elements:** the diamond Apex mark; thin cyan/mint status rails; a restrained telemetry grid with tabular numerals and clear LIVE / SIMULATED / UNAVAILABLE badges.

**Interaction philosophy:** actions are reversible where possible, confirmation is explicit, and every async action has loading, success, and failure states.

**Animation:** 160–220ms transitions, no gratuitous pulsing, and respect `prefers-reduced-motion`. Use a single slow status pulse only for actively verified live connections.

**Typography:** Plus Jakarta Sans for product language and IBM Plex Mono for values, routes, IDs, and infrastructure labels. Use tabular numerals for prices and latency.

**Brand essence:** Global GPU liquidity for teams that need compute capacity without hyperscaler friction. Personality: exacting, sovereign, composed.

**Brand voice:** “Route the workload. Keep the margin.” / “Every credit is accounted for. Every allocation is observable.”

**Wordmark & logo:** retain the cyan diamond insignia, pair it with a tighter wordmark and a compact environment badge.

**Signature brand color:** Apex Cyan `#00E5FF`.

## Implementation approach

- Consolidate the top-level navigation into four primary workspaces: Command, Terminal, Billing, and Developers; retain advanced surfaces behind a secondary menu.
- Upgrade the global CSS tokens, panel treatment, responsive spacing, focus states, and status semantics.
- Mark the terminal market matrix as reference/simulated until backed by a live source; remove claims that synthetic values are live telemetry.
- Make platform status fail closed instead of defaulting to HEALTHY when the API cannot be reached.
- Keep the existing React/Vite app as the source of truth and preserve the current component-level business workflows.
- Validate with TypeScript diagnostics, production build, route manifest, and public smoke probes after deployment access is restored.
