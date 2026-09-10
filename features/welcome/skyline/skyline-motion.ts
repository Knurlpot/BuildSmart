import paths from "./skyline-paths.json";

export const SKYLINE_WIDTH = 2965;
export const SKYLINE_HEIGHT = 2221;
export const SKYLINE_BASELINE = 1522.5;

// Zero-based root element indices in design-reference/skyline-full.svg.
// These are the artist's reflected paths, not newly mirrored substitutes.
const reflectionIndices = [
  101,108,102,109,100,105,103,113,134,136,135,110,111,115,104,99,107,98,114,
  117,118,119,120,121,122,123,124,125,126,127,128,116,129,130,131,132,133,
  106,167,159,160,161,162,163,164,165,156,150,158,153,152,151,155,145,146,
  137,112,138,192,191,180,182,166,168,169,176,172,175,170,177,154,179,149,
  148,147,144,139,140,143,193,194,195,183,184,190,189,157,171,174,178,142,
  181,185,186,188,173,141,187,
];

// Only join components whose relationship is evident from geometry.
// Multiple DOM groups share one logical building transform to retain painter order.
const joinedParts: Record<number, number[]> = {
  31: [19,20,21,22,23,24,25,26,27,28,31], // Twin towers + antenna highlights.
  45: [39,40,41,42,43,44,45], // Temple + six roof finials.
  34: [34,35],
  56: [56,57],
  88: [88,95], // West palm crown + trunk.
  90: [90,96], // Center palm crown + trunk.
  92: [92,93],
  94: [94,97], // East palm crown + trunk.
};
const joinedChildren = new Set(Object.values(joinedParts).flat());
const depthByFill: Record<string, number> = {
  "#FC9425": 0.2, "#E8782E": 0.5, "#FF8700": 0.75, "#B76508": 1,
};

export const SKYLINE_GROUPS = paths.slice(0, 98).flatMap((part) => {
  const index = part.sourceIndex;
  if (joinedChildren.has(index) && !joinedParts[index]) return [];
  const sourceIndices = joinedParts[index] ?? [index];
  const tower = index <= 18 || index === 31 || index === 37;
  return [{
    id: `${tower ? "tower" : "foreground"}-${index}`,
    sourceIndices,
    reflectionIndices: sourceIndices.map((sourceIndex) => reflectionIndices[sourceIndex]),
    centerX: part.bounds[0] + part.bounds[2] / 2,
    depth: depthByFill[part.fill] ?? 0.8,
    tower,
    reflectionRatio: paths[reflectionIndices[index]].bounds[3] / part.bounds[3],
  }];
});

export type SkylineGroup = (typeof SKYLINE_GROUPS)[number];
const groupByPart = new Map(SKYLINE_GROUPS.flatMap((group) =>
  [...group.sourceIndices, ...group.reflectionIndices].map((index) => [index, group] as const)
));

export const SKYLINE_PARTS = paths.map((part) => ({
  ...part,
  group: groupByPart.get(part.sourceIndex),
  reflection: part.sourceIndex >= 98 && part.sourceIndex < 196,
}));

// Foreground correction: the exported painter order hides the low palace/fort
// forms and puts the bridge over the gateway. Promote those complete motifs
// above other architecture, but retain small ground details in front of them.
// Use the same logical order for their authored reflection counterparts.
export function skylinePaintOrder(reflection = false) {
  const featured: Record<string, number> = {
    "foreground-49": 2, "foreground-45": 3, "foreground-58": 4,
  };
  const priority = (part: (typeof SKYLINE_PARTS)[number]) => {
    if (part.group?.tower) return 0;
    if (part.group && featured[part.group.id]) return featured[part.group.id];
    if (part.group && Math.min(...part.group.sourceIndices) >= 62) return 5;
    return 1;
  };
  return SKYLINE_PARTS.filter((part) => part.group && part.reflection === reflection)
    .sort((a, b) => priority(a) - priority(b));
}

export function smoothRange(start: number, end: number, value: number) {
  const t = Math.min(1, Math.max(0, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

export function sampleSkylineScene(progress: number, width: number, staticScene = false) {
  const p = Math.min(1, Math.max(0, progress));
  const compression = staticScene ? 0 : smoothRange(0, 0.35, p) * (1 - smoothRange(0.5, 1, p));
  const foreground = staticScene ? 1 : smoothRange(0.65, 0.8, p);
  const reflection = staticScene ? 0.7 : smoothRange(0.8, 1, p);
  return {
    progress: p,
    compression,
    foreground,
    reflection,
    introPlacement: staticScene ? 1 : 1 - smoothRange(0.55, 1, p),
    // Continuous responsive reduction (no jump at a device breakpoint).
    travel: 0.42 + 0.58 * smoothRange(420, 1280, width),
    atmosphere: staticScene ? 0.36 : 0.36 * (1 - smoothRange(0.08, 0.35, p))
      + 0.012 * smoothRange(0.08, 0.35, p)
      + 0.568 * smoothRange(0.65, 1, p),
    groundOpacity: 0.04 + foreground * 0.86,
  };
}

export function sampleBuilding(group: SkylineGroup, scene: ReturnType<typeof sampleSkylineScene>) {
  const inward = Math.pow(scene.compression, 1 + group.depth * 0.16);
  const x = (SKYLINE_WIDTH / 2 - group.centerX) * inward * (group.tower ? 0.34 : 0.2) * scene.travel;
  const y = group.tower
    ? -inward * (12 + 20 * group.depth) * scene.travel
    : (1 - scene.foreground) * (20 + group.depth * 14) * scene.travel;
  return {
    x,
    y,
    reflectedY: -y * group.reflectionRatio,
  };
}
