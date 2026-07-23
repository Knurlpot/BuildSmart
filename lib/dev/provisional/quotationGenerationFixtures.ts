// DEV-ONLY fixtures — see lib/dev/mock-toggle.ts. Backs /api/clients and the blueprint
// extraction mock in lib/dev/mockFetch.ts.
import type { Client, BlueprintExtractionResult } from './quotationGenerationTypes';

// client_type is null for all three — these seed rows predate that field and there's no
// real basis to guess New vs. Returning for them (see quotationGenerationTypes.ts).
export const clientsFixture: Client[] = [
  {
    client_id: 'cl-1',
    client_name: 'Rivercrest Family Trust',
    contact_number: '+63 917 555 0142',
    contact_email: 'admin@rivercrest.example',
    contact_person: null,
    client_address: null,
    client_type: null,
  },
  {
    client_id: 'cl-2',
    client_name: 'Northline Logistics Corp.',
    contact_number: '+63 918 222 4410',
    contact_email: 'facilities@northline.example',
    contact_person: null,
    client_address: null,
    client_type: null,
  },
  {
    client_id: 'cl-3',
    client_name: 'Terra Bright Holdings',
    contact_number: '+63 917 888 3321',
    contact_email: 'ops@terrabright.example',
    contact_person: null,
    client_address: null,
    client_type: null,
  },
];

interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface DoorSwing {
  // Door leaf hinge point + the arc it sweeps to (quarter circle), matching the gap left
  // in the adjoining wall segments below.
  hingeX: number;
  hingeY: number;
  radius: number;
  sweepToX: number;
  sweepToY: number;
}

interface FloorPlanSpec {
  label: string;
  width: number;
  height: number;
  border: WallSegment;
  walls: WallSegment[];
  doors: DoorSwing[];
}

// Self-contained inline SVG "blueprint" — a light architectural floor-plan drawing (outer
// wall, interior partitions, a door swing, compass, and a title block), not empty graph
// paper. No external image asset or network dependency, same convention as the rest of
// lib/dev/fixtures/*. The wall layout is hand-aligned to this fixture's own
// polygon_coords below so the detected-segment overlay looks like it's actually reading
// the drawing, but the walls are purely decorative pixels — they carry no geometry the
// app reads back; BlueprintOverlay only ever renders polygon_coords.
function buildFloorPlanSvg({ label, width, height, border, walls, doors }: FloorPlanSpec): string {
  const wallColor = '#334155';
  const wallLines = walls
    .map((w) => `<line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke="${wallColor}" stroke-width="7" stroke-linecap="square"/>`)
    .join('');
  const doorArcs = doors
    .map(
      (d) =>
        `<path d="M ${d.hingeX} ${d.hingeY} A ${d.radius} ${d.radius} 0 0 1 ${d.sweepToX} ${d.sweepToY}" fill="none" stroke="${wallColor}" stroke-width="1.5" stroke-dasharray="4 3"/>` +
        `<line x1="${d.hingeX}" y1="${d.hingeY}" x2="${d.sweepToX}" y2="${d.sweepToY}" stroke="${wallColor}" stroke-width="2.5"/>`
    )
    .join('');
  const gridCols = Math.floor(width / 100) + 1;
  const gridRows = Math.floor(height / 100) + 1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="#fbfaf7"/>
    <g stroke="#e7e5e0" stroke-width="1">
      ${Array.from({ length: gridCols }, (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="${height}"/>`).join('')}
      ${Array.from({ length: gridRows }, (_, i) => `<line x1="0" y1="${i * 100}" x2="${width}" y2="${i * 100}"/>`).join('')}
    </g>
    <rect x="${border.x1}" y="${border.y1}" width="${border.x2 - border.x1}" height="${border.y2 - border.y1}" fill="none" stroke="${wallColor}" stroke-width="10"/>
    ${wallLines}
    ${doorArcs}
    <g transform="translate(${width - 90}, 90)">
      <circle r="34" fill="white" stroke="#94a3b8" stroke-width="2"/>
      <path d="M0,-24 L8,12 L0,4 L-8,12 Z" fill="#475569"/>
      <text y="-38" font-family="sans-serif" font-size="16" fill="#475569" text-anchor="middle" font-weight="bold">N</text>
    </g>
    <g transform="translate(${width - 320}, ${height - 68})">
      <rect width="300" height="52" fill="white" stroke="#94a3b8" stroke-width="2"/>
      <text x="12" y="21" font-family="sans-serif" font-size="16" fill="#1e293b" font-weight="bold">FLOOR PLAN</text>
      <text x="12" y="40" font-family="sans-serif" font-size="13" fill="#64748b">${label} &#183; Scale N.T.S.</text>
    </g>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Wall layout hand-aligned to the Ground Floor segments below: Living Room (100,100)-
// (700,600) and Utility (100,620)-(500,1100) share a left column, split from Kitchen
// (720,100)-(1100,450) and Bathroom (720,470)-(950,600) on the right — with a doorway gap
// left in the dividing wall between Living Room and Kitchen.
const GROUND_FLOOR_IMAGE = buildFloorPlanSvg({
  label: 'Ground Floor',
  width: 1600,
  height: 1200,
  border: { x1: 70, y1: 70, x2: 1130, y2: 1130 },
  walls: [
    { x1: 710, y1: 70, x2: 710, y2: 280 }, // left column / right column divider, above the door
    { x1: 710, y1: 340, x2: 710, y2: 1130 }, // ...continues below the door
    { x1: 70, y1: 610, x2: 710, y2: 610 }, // Living Room / Utility divider
    { x1: 710, y1: 460, x2: 1130, y2: 460 }, // Kitchen / Bathroom divider
  ],
  doors: [{ hingeX: 710, hingeY: 340, radius: 60, sweepToX: 770, sweepToY: 280 }],
});

// Wall layout hand-aligned to the 2nd Floor segments below: Master Bedroom (100,100)-
// (750,650) and Balcony (100,670)-(600,900) share a left column, split from Bedroom 2
// (770,100)-(1300,550) on the right.
const SECOND_FLOOR_IMAGE = buildFloorPlanSvg({
  label: '2nd Floor',
  width: 1600,
  height: 1200,
  border: { x1: 70, y1: 70, x2: 1330, y2: 930 },
  walls: [
    { x1: 760, y1: 70, x2: 760, y2: 470 },
    { x1: 760, y1: 530, x2: 760, y2: 660 },
    { x1: 70, y1: 660, x2: 760, y2: 660 }, // Master Bedroom / Balcony divider
  ],
  doors: [{ hingeX: 760, hingeY: 470, radius: 60, sweepToX: 700, sweepToY: 530 }],
});

// Two floors, mixed confidence bands (>=90 green, 70-89 amber, <70 red) on purpose, so the
// color-coding and the low-confidence "needs scrutiny" behavior are both reviewable.
export const blueprintExtractionFixture: BlueprintExtractionResult = {
  floors: [
    {
      floor_level: 'Ground Floor',
      image_url: GROUND_FLOOR_IMAGE,
      image_width: 1600,
      image_height: 1200,
      segments: [
        {
          segment_key: 'bp-gf-1',
          segment_name: 'Living Room',
          polygon_coords: [[100, 100], [700, 100], [700, 600], [100, 600]],
          area_sqm: 25.4,
          confidence_score: 95,
        },
        {
          segment_key: 'bp-gf-2',
          segment_name: 'Kitchen',
          polygon_coords: [[720, 100], [1100, 100], [1100, 450], [720, 450]],
          area_sqm: 14.2,
          confidence_score: 92,
        },
        {
          segment_key: 'bp-gf-3',
          segment_name: 'Bathroom',
          polygon_coords: [[720, 470], [950, 470], [950, 600], [720, 600]],
          area_sqm: 5.8,
          confidence_score: 78,
        },
        {
          segment_key: 'bp-gf-4',
          segment_name: 'Utility / Storage',
          polygon_coords: [[100, 620], [500, 620], [500, 1100], [100, 1100]],
          area_sqm: 16.0,
          confidence_score: 62,
        },
      ],
    },
    {
      floor_level: '2nd Floor',
      image_url: SECOND_FLOOR_IMAGE,
      image_width: 1600,
      image_height: 1200,
      segments: [
        {
          segment_key: 'bp-2f-1',
          segment_name: 'Master Bedroom',
          polygon_coords: [[100, 100], [750, 100], [750, 650], [100, 650]],
          area_sqm: 28.6,
          confidence_score: 91,
        },
        {
          segment_key: 'bp-2f-2',
          segment_name: 'Bedroom 2',
          polygon_coords: [[770, 100], [1300, 100], [1300, 550], [770, 550]],
          area_sqm: 19.3,
          confidence_score: 81,
        },
        {
          segment_key: 'bp-2f-3',
          segment_name: 'Balcony',
          polygon_coords: [[100, 670], [600, 670], [600, 900], [100, 900]],
          area_sqm: 8.1,
          confidence_score: 68,
        },
      ],
    },
  ],
};
