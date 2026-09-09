# Skyline motion intent

Authority: the user's supplied Skyline.svg (stored unchanged at
`design-reference/skyline-full.svg`), top / compressed-middle / bottom reference
screenshots, and these user-requested motion rules.

- 0% page scroll: widely dispersed buildings at their original relative sizes.
- 35–50%: independent buildings move inward into a denser composition.
- 65–80%: spread outward again; foreground landmarks gradually appear.
- 100%: dispersed city, visible foreground, and reflection below the baseline.
- Use independent x translation, subtle y drift, depth opacity, soft parallax,
  and smooth continuous easing. Do not scale the skyline, bounce, spin, use
  random floating, or swap between flattened images.
- Preserve the current foreground text, cards, buttons, navigation, and section
  layout. The city is a noninteractive background; protect text readability.
- Keep the BuildSmart warm palette. Add soft gradients, shadows, and fading.
- Reduce movement on tablet/mobile and prevent horizontal overflow.
- Reduced-motion and the page's pause control show a stable dispersed scene.

Implementation mapping and remaining source ambiguities are documented in
`design-reference/README.md`.
