# Skyline source and animation mapping

`skyline-full.svg` is the supplied `Downloads/Skyline.svg`, copied unchanged. Its
SHA-256 is `1AE0786D28B7A871E55BB312C0D4C33ABE42A57B49E0BED14D63CFF91ADBF493`.
This file is the authority for geometry, colors, relative positions, and painter
order. The user's motion notes and top/middle/bottom screenshots define the
animation direction. Existing Welcome page content and section layouts take
priority over the screenshots' blank, background-only areas.

## Rebuilding the vector data

From the repository root, on Windows:

```powershell
powershell -File scripts/prepare-skyline.ps1
```

The authoring helper reads the SVG and generates
`features/welcome/skyline/skyline-paths.json`. It preserves every path's original
`d`, fill, blend-wrapper attributes, and source order, and records geometric
bounds using WPF's path parser. It does not rasterize, merge paths, or redraw
buildings. The runtime needs no WPF dependency. If the source structure changes,
review the mappings before regenerating.

`features/welcome/skyline/skyline-motion.ts` owns the deterministic logical-group
mapping and scroll interpolation. The SVG export has no semantic layer IDs, so
all indices below are **zero-based root element indices**, including the `<g>`
wrappers. They are not indices into a list containing only direct `<path>` nodes.

## Source structure and logical buildings

The viewBox is `0 0 2965 2221`. There are 197 root elements and 197 paths: 177
direct paths plus 20 single-path `<g>` wrappers. Those wrappers apply opacity and
hard-light blending; they are not complete building groups.

| Root elements | Role |
| --- | --- |
| 0–97 | Upright skyline, landmarks, and landscaping |
| 98–195 | Authored reflection counterparts |
| 196 | Red baseline rectangle, x=0–2965 and y=1514–1531 |

There are 21 tall-building components. Elements 0–18 each form one component;
element 31 shares a transform with antenna-detail wrappers 19–28; element 37 is
the final tall component. Each retains its source size. The combined twin-tower
component is intentionally preserved as one connected silhouette.

| Upright root element(s) | Source center x |
| --- | ---: |
| 0 | 201.27 |
| 1 | 283.73 |
| 2 | 487.81 |
| 3 | 609.35 |
| 4 | 1573.52 |
| 5 | 1396.78 |
| 6 | 880.82 |
| 7 | 974.65 |
| 8 | 754.51 |
| 9 | 1123.76 |
| 10 | 1292.18 |
| 11 | 1640.26 |
| 12 | 1503.10 |
| 13 | 1785.27 |
| 14 | 1982.68 |
| 15 | 2292.10 |
| 16 | 2404.29 |
| 17 | 2675.83 |
| 18 | 2570.85 |
| 19–28, 31 | 2110.25 |
| 37 | 2745.66 |

The foreground uses these clearly related multipart mappings:

| Upright root elements | Shared motif |
| --- | --- |
| 39–45 | Low red temple and its six roof finials |
| 88, 95 | West palm crown and trunk |
| 90, 96 | Central palm crown and trunk |
| 94, 97 | East palm crown and trunk |
| 34, 35 | Rounded mound and its colored half |
| 92, 93 | Rounded mound and its colored half |
| 56, 57 | Overlapping central rounded backdrop |

Other foreground paths remain individual motifs. Major foreground silhouettes
are 32, 46, 47, 49, 50, 54, 55, 58, 59, and 61. Descriptive names in this document
identify visual forms, not verified names of actual Manila landmarks.

The presentation uses fully opaque source fills, including the antenna detail
wrappers. Original alpha/blend metadata remains in the source and generated data,
but is intentionally not applied at runtime following the user's solid-overlap
revision. The upright city receives one shared mask **after** its paths have
been composited; overall atmosphere and reflection alpha also apply to assembled
layers. Foreground motifs appear through a rising clip boundary, not per-path
opacity. This prevents rear-building silhouettes showing through front buildings.

Logical grouping preserves source-data order and gives each part the transform
of its logical building/motif. The revised runtime painter order deliberately
places towers behind foreground motifs, then promotes the low heritage/fort
complex (49), palace-like silhouette plus finials (39–45), and gateway (58)
above the scenery and architecture that obscured them. Ground ornaments remain
in front. Reflection parts use the same priorities. No source geometry changes.

## Reflection correspondence

For upright root element `i` in 0–97, the reflection index is entry `i` in this
array:

```text
[
  101,108,102,109,100,105,103,113,134,136,
  135,110,111,115,104,99,107,98,114,117,
  118,119,120,121,122,123,124,125,126,127,
  128,116,129,130,131,132,133,106,167,159,
  160,161,162,163,164,165,156,150,158,153,
  152,151,155,145,146,137,112,138,192,191,
  180,182,166,168,169,176,172,175,170,177,
  154,179,149,148,147,144,139,140,143,193,
  194,195,183,184,190,189,157,171,174,178,
  142,181,185,186,188,173,141,187
]
```

This is a one-to-one mapping covering all 98 reflection parts. Position, fill,
and path structure establish the pairs: 97 pairs have identical command-letter
sequences; 61→182 has a minor command-order variation with corresponding bounds
and silhouette. Reflection details 117–126 belong with twin-tower reflection
116, just as 19–28 belong with upright 31.

The supplied reflection is authored geometry, not a uniform mirror: high-rise
heights are compressed to about 46% and most foreground heights to about 61%.
Keep these original reflected paths and share the corresponding upright group's
x translation so their motion remains aligned.

## Scroll composition

Progress spans the complete Welcome page's scrollable distance, from the top
of the page at 0 to the bottom at 1.

| Progress | Composition |
| --- | --- |
| 0 | Original dispersed x positions and original building sizes |
| 0–0.35 | Buildings translate independently toward the drawing center |
| 0.35–0.50 | Compressed composition is held |
| 0.50–1 | Continuous release toward the original dispersed positions, visibly spreading at 0.65–0.80 |
| 0.65–0.80 | Foreground city motifs gradually emerge |
| 0.80–1 | Authored reflection gradually becomes visible below the baseline |

The animation uses translation and subtle depth differences, with no animated
whole-skyline scale. Responsive sizing of the SVG is layout sizing, not a scroll
scale animation. Smaller viewports reduce travel; reduced-motion mode presents
a stable static composition. The skyline remains a decorative environmental
layer with no pointer interception, and existing text, navigation, cards,
buttons, and section layout retain their foreground priority.

Introductory placement puts the tallest rooftop at the navigation height plus
16% of viewport height (that extra gap is capped at 140px), when lowering is
needed. This is a vertical placement offset, never a size change. From 55% to
100% scroll the offset smoothly returns to zero so the reflection meets the
footer baseline. Reduced-motion keeps the lowered placement stable.

## Headline lighting and decorative cranes

The readability gradient is a broad, feathered wash originating at the hero's
left edge, fading fully before the rightmost skyline; there is no heading-box
pseudo-element. Whole-city opacity holds at 1.2% from 35–65% page scroll, then
returns smoothly to 58% at the bottom. Reflection alpha is 78% before its shared
water fade; the footer surface is 40% opaque to leave the reflection visible.
Two small decorative cranes are added to source
buildings 2 and 17, anchored at (495,250) and (2650,421). They are new construction
details, not modifications to the supplied building paths. Each inherits its
building's translation and painter order. Cable length and load height share
36/44-second eased cycles, with rests at the upper and lower positions. Pause
and reduced-motion settings show stationary cranes. Their pale orange strokes
and cream loads share the city layer's overall fade.

## Preserved ambiguities for design review

- Element 31 contains connected twin towers in a single path. Separate movement
  of the two towers would require an explicitly authored decomposition.
- Foreground elements 49, 59, and 61 contain compound silhouettes. Their internal
  landmarks are preserved together instead of inventing building boundaries.
- Element 29 is a rectangular orange city backdrop. It remains independent
  rather than being assumed to belong to nearby church element 32.
- Elements 56 and 57 overlap with the same fill. Their purpose may be redundant
  or intentional, so both are preserved with one shared transform.
- The screenshots establish dispersed and compressed compositions, but do not
  provide numeric per-building intermediate coordinates. The inward distances
  and easing are deterministic implementation choices; final dispersed positions
  remain those of the source SVG.
