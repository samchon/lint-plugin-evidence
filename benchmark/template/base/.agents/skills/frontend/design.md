# Design

This document owns how the interface looks, and specifically how to avoid the signatures that mark a screen as machine-generated.

## Scope

These rules apply as a mandate to landing, marketing, and portfolio surfaces, where visual voice is the product.

For dashboards, data tables, forms, and multi-step product interfaces, treat them as advisory. Apply what fits and ignore what does not: a product screen forced into landing-page taste is worse than a plain one. The default for product interfaces is a clean, content-first layout that gets out of the way.

## Set The Three Dials Before Anything Else

Read what the product is, then fix three values. Every later decision about layout, motion, and information density is gated by them, and deciding each one locally is how a single interface ends up with three personalities.

```ts
// src/design.ts
export const DESIGN = {
  /** 1 = perfect symmetry, 10 = deliberate asymmetry. */
  variance: 6,
  /** 1 = static, 10 = cinematic. */
  motion: 4,
  /** 1 = airy, 10 = packed with data. */
  density: 5,
} as const;
```

| Product reads as                               | variance | motion | density |
| ---------------------------------------------- | -------- | ------ | ------- |
| minimal, calm, editorial                       | 5-6      | 3-4    | 2-3     |
| premium consumer                               | 7-8      | 5-7    | 3-4     |
| marketing or portfolio                         | 7-9      | 6-8    | 3-5     |
| trust-first, regulated, accessibility-critical | 3-4      | 2-3    | 4-5     |
| an operational product interface               | 4-5      | 2-3    | 5-7     |

Most benchmark subjects are the last row: an application people work in. Low variance keeps a dense screen readable, low motion keeps a repeated action from feeling slow, and higher density is what makes a real workload fit.

Write the values down where a later reader finds them, and change them deliberately rather than drifting.

## Use A Real Design System Or Own Your Components

Two honest options, and one dishonest one.

**Install an official system** when the product is clearly one of its kinds, and use its own tokens. **Own a small primitive set** when it is not: a component library you copy into `components/ui` and customize, which is the default here.

The dishonest option is importing a system and then overriding most of it. You inherit its constraints and lose its coherence.

**One system per project.** Do not mix two component libraries in the same tree.

**Never ship a component library in its default state.** Untouched defaults are themselves recognizable. Set the radius, the palette, the shadow scale, and the type scale to the product's own values before building on it.

```css
/* src/styles.css */
:root {
  --radius: 0.75rem;
  --background: 0 0% 100%;
  --foreground: 240 10% 4%;
  --muted: 240 5% 96%;
  --primary: 240 6% 10%;
}
```

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
- Prefer checked-in or local fixture images. When an external placeholder is unavoidable, pin a stable descriptive seed and record the network dependency.
- Customize the component library's defaults. Shipping its untouched default theme is itself a tell.

## No Em Dashes

The em dash is the most-violated item on this list and the single clearest signature, so the rule is binary rather than a limit.

**Zero em dashes anywhere the user can see**: headings, labels, buttons, body copy, captions, quote attribution, alt text. The en dash is banned as a separator too; ranges use a hyphen.

Restructure instead. Two sentences with a period, a comma, parentheses, or a colon. For attribution, a hyphen with spaces or a line break.

Grep the built copy for both characters before calling a screen finished. It is a one-command check and it is the only one that settles the question.

## Accessibility Is Not A Later Pass

Each of these is cheap while the component is being written and expensive once the interface is built on top of it.

```tsx
// A real button, so keyboard, focus, and assistive technology all work.
<button type="button" onClick={onSelect} className="focus-visible:ring-2">

// Not this. A div is not focusable, not activatable by keyboard, and
// announces nothing.
<div onClick={onSelect}>
```

- **Contrast at the size and weight actually used**, not at an ideal one. Small text at a light weight needs more contrast than the same color at a heading size.
- **Visible focus states.** Removing the outline without replacing it makes the interface unusable by keyboard, and it is the single most common accessibility regression.
- **Targets large enough to hit on a phone.** An icon button at its glyph size is not.
- **A label for every input**, associated rather than adjacent. Placeholder text is not a label; it vanishes exactly when the user needs it.
- **Respect reduced motion**, which costs one media query and is the difference between polish and nausea for the people who set it.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Dark Mode

If the interface supports it, design both and check both. A palette derived by inverting a light theme produces muddy surfaces and unreadable disabled states.

Three rules carry most of it. Surfaces get **lighter** as they come forward, not darker. Borders carry the separation that shadows carry in light mode, because a shadow on a dark surface is invisible. Accents usually need desaturating, because a color tuned against white glares against charcoal.

```css
:root {
  --background: 0 0% 100%;
  --surface: 240 5% 98%;
  --border: 240 6% 90%;
  --primary: 240 60% 45%;
}

.dark {
  --background: 240 10% 4%; /* off-black, never #000 */
  --surface: 240 8% 9%; /* forward surfaces get lighter */
  --border: 240 6% 20%; /* borders do the separating */
  --primary: 240 45% 62%; /* desaturated and lifted */
}
```

Check the disabled and placeholder states in both. They are derived from the muted color, and a muted value that reads correctly on white commonly disappears on charcoal.

## Pre-Flight

Read the screen against this before calling it done. The question is not whether it looks acceptable; it is whether anything on it is there only because it seemed like what a designed page contains.

- [ ] The three dials were set, and this screen matches them.
- [ ] Zero em dashes anywhere a user can see.
- [ ] No row of three identical cards. No fake product screenshot built from divs.
- [ ] No section-number eyebrows, scroll cues, or decorative status dots.
- [ ] Placeholder content is realistic: uneven numbers, plausible names, no filler verbs.
- [ ] The component library's defaults were customized, not shipped as-is.
- [ ] Contrast checked at the actual size and weight; focus states visible; every input labelled.
- [ ] Every supported theme checked, including disabled and placeholder states.
- [ ] Reduced motion respected.
- [ ] The flow was run in a browser at mobile, tablet, and desktop widths.

The last item is not a design check and it is the one that catches the most. Taste is not a substitute for a control that works, and the verification topic owns what running it requires.
