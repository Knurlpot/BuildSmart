# Welcome page media references

The sources here were supplied by the user. Original files in Downloads were preserved.

## Website assets

| Asset | Format and dimensions | Size | Origin |
| --- | --- | ---: | --- |
| `public/welcome/manila-skyline.svg` | Transparent SVG; viewBox `0 10 558.023 155.531` | 160,782 bytes | 75 native solid paths from the supplied `manila_color.eps`; cropped to skyline, without title/reflection. CMYK fills converted to RGB. |
| `public/welcome/construction-reel.mp4` | Silent H.264 Baseline, 1440 × 648, 24 fps, 16 seconds | 3,256,400 bytes | Source construction reel, 26–42 seconds; web compression with fast-start metadata. |
| `public/welcome/construction-poster.jpg` | JPEG, 1440 × 648 | 167,260 bytes | Aerial construction frame at source second 27. |

The skyline preserves source illustration geometry. No landmark names were inferred. The construction footage is illustrative: its locations were not verified as Manila.

## Supplied references inspected

- Skyline ZIP: `manila-philippines-skyline-silhouette-white-background-vector-illustration-business-travel-tourism-c.zip`. Contains `manila_color.eps` (2,088,286 bytes) and `manila_color.jpg` (1,000,511 bytes; 4000 × 2667). Both are extracted in this folder after archive path validation.
- `ssstwitter.com_1788854219313.mp4`: 1,034,661 bytes; 1600 × 1200 H.264, 30 fps, 5.77 seconds. Orange logo presentation with radial rays, defocus and dotted dissolution.
- `ssstwitter.com_1788887432852.mp4`: 2,420,020 bytes; 1600 × 1200 H.264, 30 fps, 8 seconds. Translucent beveled icon tiles with extruded symbols, colored shadows, rotation and bright soft lighting.
- `the-power-and-beauty-of-construction-sites-a-cinematic-reel-1728-ytshorts.savetube.me.mp4`: 59,339,899 bytes; 3840 × 1728 AV1, approximately 23.98 fps, 76.21 seconds; AAC audio in source. Scenes include construction workers, tools, cranes, machinery, building work and demolition.

`logo-motion-contact.jpg`, `floating-icons-contact.jpg`, and `construction-contact.jpg` are video preview contact sheets. `construction-optimized-contact.jpg` covers the final web excerpt. All were visually inspected. `skyline-vector-preview.png` is a rendered verification of the native SVG path extraction.

## Reproduction

Run `node scripts/prepare-welcome-skyline.mjs` from the repository root to recreate the SVG and its preview using the extracted EPS. The script is specific to this source's Illustrator EPS operators; it is not a general EPS converter.

Media conversion used the existing FFmpeg bundled with CapCut; no dependencies were installed. Video output uses `h264_mf`, a 1600 kbps target, `scale=1440:648,fps=24`, no audio, and `+faststart`. Accurate output seeking (`-i SOURCE -ss 26 -t 16`) was used and the resulting clip was decoded and visually checked.
