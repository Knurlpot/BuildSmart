// DEV-ONLY fixtures — see lib/dev/mock-toggle.ts. Backs /api/clients and the blueprint
// extraction mock in lib/dev/mockFetch.ts.
import type { Client, BlueprintExtractionResult } from './quotationGenerationTypes';

export const clientsFixture: Client[] = [
  { client_id: 'cl-1', client_name: 'Rivercrest Family Trust', contact_number: '+63 917 555 0142', contact_email: 'admin@rivercrest.example' },
  { client_id: 'cl-2', client_name: 'Northline Logistics Corp.', contact_number: '+63 918 222 4410', contact_email: 'facilities@northline.example' },
  { client_id: 'cl-3', client_name: 'Terra Bright Holdings', contact_number: '+63 917 888 3321', contact_email: 'ops@terrabright.example' },
];

// Self-contained inline SVG "blueprint" — a light grid + a floor label — so the overlay
// demo has something plausible to render with no external image asset or network
// dependency. Real blueprints come from the user's uploaded file; this only stands in for
// the IMAGE the backend would return alongside its extracted segments.
function blueprintPlaceholder(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200">
    <rect width="1600" height="1200" fill="#eef2f7"/>
    <g stroke="#c7d2e0" stroke-width="1">
      ${Array.from({ length: 17 }, (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="1200"/>`).join('')}
      ${Array.from({ length: 13 }, (_, i) => `<line x1="0" y1="${i * 100}" x2="1600" y2="${i * 100}"/>`).join('')}
    </g>
    <rect x="20" y="20" width="1560" height="1160" fill="none" stroke="#8ca0bc" stroke-width="4"/>
    <text x="800" y="1160" font-family="sans-serif" font-size="28" fill="#8ca0bc" text-anchor="middle">${label} — sample blueprint</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Two floors, mixed confidence bands (>=90 green, 70-89 amber, <70 red) on purpose, so the
// color-coding and the low-confidence "needs scrutiny" behavior are both reviewable.
export const blueprintExtractionFixture: BlueprintExtractionResult = {
  floors: [
    {
      floor_level: 'Ground Floor',
      image_url: blueprintPlaceholder('Ground Floor'),
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
      image_url: blueprintPlaceholder('2nd Floor'),
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
