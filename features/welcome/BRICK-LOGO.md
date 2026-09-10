# BuildSmart brick loop

- Geometry: the 72 unchanged paths and fills in `components/logo-frames/Field 13.svg`.
- Build order: first fully opaque appearance across the existing sign-up `Field 0.svg` through `Field 13.svg`; ties use original path order. No invented brick shapes.
- Runtime: `BrickLogo.tsx` uses synchronized Web Animations tracks, pauses offscreen/in hidden tabs, and displays the finished logo with reduced motion.
- Cycle: 12 seconds. Bricks settle individually during approximately 0.48–4.68s; the complete logo holds until 8.88s, fades out by 10.32s, then stays empty until the next cycle.
- Reusable standalone asset: `public/welcome/buildsmart-brick-loop.svg`. It uses the same stage order and phase boundaries with CSS easing, including a static reduced-motion fallback.
- Regenerate geometry with `node scripts/generate-logo-bricks.mjs`; add `--svg` to emit the standalone asset instead. The script writes only to stdout.

Sign-up reuses the same paths via `BrickLogo`'s optional `stage` prop. It starts empty, then transitions newly revealed bricks over 540ms with short staggered delays. Non-empty fields drive progress (not validity), using only the active join/create branch. Optional middle name can contribute but is not required; specialization selection and terms acceptance contribute too. Additional letters do not restart the animation; clearing a field reduces progress. Completion holds the logo instead of looping. Reduced motion preserves the current progress without transitions. Login retains its static logo. Source SVG assets remain unchanged.

The SVG supplied as `Group 513.svg` is a multi-logo reference sheet, not substituted for the existing per-stage assets.
