# Design

Read [SKILL.md](SKILL.md) first. This document owns how the interface looks, and specifically how to avoid the signatures that mark a screen as machine-generated.

## Scope

These rules apply as a mandate to landing, marketing, and portfolio surfaces, where visual voice is the product.

For dashboards, data tables, forms, and multi-step product interfaces, treat them as advisory. Apply what fits and ignore what does not: a product screen forced into landing-page taste is worse than a plain one. The default for product interfaces is a clean, content-first layout that gets out of the way.

## The Tells

A generated interface has a recognizable accent. Each item below is something the model reaches for when it tries to look designed, and each one is what makes a reader conclude nobody looked at this.

### Visual

- No neon or outer glows. Use an inner border or a subtly tinted shadow.
- No pure black. Off-black or charcoal.
- No oversaturated accent colors. Desaturate them so they sit with the neutrals.
- No gradient text on large headings.
- No custom cursors.

### Typography

- Control hierarchy with weight and color, not raw size. An enormous heading is not a hierarchy.
- Serif faces belong to editorial and luxury surfaces, not to dashboards.

### Layout

- **No row of three identical feature cards.** It is the single most recognizable generated-page layout. Use a two-column alternating arrangement, an asymmetric grid, or a horizontal scroll instead.
- No decorative hairline or crosshair grids. Lines are for organizing real content.
- No vertical rotated text.
- No floating explainer paragraph in the top-right corner of a section header. Put the sub-text under the headline or build a real two-column header.
- Do not put a top and bottom border on every row of a long table. Pick one, and use it sparingly.

### Labels And Micro-Copy

- **No section-number eyebrows.** `01 / Capabilities`, `002 · Featured` and their family. Name the topic in plain language.
- No version labels as decoration: `v0.6`, `BETA`, `EARLY ACCESS`, and footer build strings on a marketing page.
- No scroll cues. A reader looking at the hero knows what scrolling is.
- No locale, time, or weather strips unless the brief is genuinely about a place.
- No generic step labels. `Stage 1 / Stage 2 / Stage 3` carries nothing the step's own name does not.
- **Ration the middle dot.** At most one per metadata line. It is not a general-purpose separator.
- No decorative colored status dots. A dot is for real state, used sparingly.

### Fabricated Content

- **No fake product screenshots built from divs.** A styled arrangement of rectangles pretending to be an application is the most obvious tell there is. Use a real screenshot, a real component, or nothing.
- No generic placeholder names. Use realistic, locale-appropriate ones.
- No suspiciously round numbers. Real data is uneven.
- No generic brand names.
- No filler verbs: elevate, seamless, unleash, next-gen, revolutionize. Concrete verbs only.
- No performative labels on quote or note sections. Plain functional ones, or none.

### Assets

- Use an established icon set rather than hand-rolled SVG paths.
- Use a stable placeholder image source with a descriptive seed, so the same image comes back on every run.
- Customize the component library's defaults. Shipping its untouched default theme is itself a tell.

## No Em Dashes

The em dash is the most-violated item on this list and the single clearest signature, so the rule is binary rather than a limit.

**Zero em dashes anywhere the user can see**: headings, labels, buttons, body copy, captions, quote attribution, alt text. The en dash is banned as a separator too; ranges use a hyphen.

Restructure instead. Two sentences with a period, a comma, parentheses, or a colon. For attribution, a hyphen with spaces or a line break.

Phrasings like "use sparingly" have historically been ignored, which is why this one is not phrased that way.

## Accessibility Is Not A Later Pass

Contrast that passes at the size and weight actually used, not at an ideal one. Focus states that remain visible when a keyboard is used. Interactive targets large enough to hit on a phone. Real semantic elements, so a button is a button.

Any of these is cheap while the component is being written and expensive once the interface is built on top of it.

## Dark Mode

If the interface supports it, design both and check both. A palette derived by inverting a light theme produces muddy surfaces and unreadable disabled states.

Surfaces get lighter as they come forward, borders carry the separation that shadows carry in light mode, and accents usually need desaturating to stay comfortable.

## Before Calling A Screen Done

Read it against this list once. The specific question is not whether it looks acceptable, but whether anything on it is here only because it seemed like what a designed page contains.

Then run the flow, at every width, per the verification topic. Taste is not a substitute for a control that works.
