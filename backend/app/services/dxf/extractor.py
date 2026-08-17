import html
import math
import os
import re
import tempfile
import re
import time
from collections import Counter
from dataclasses import replace
from pathlib import Path
from urllib.parse import quote

from shapely.affinity import translate
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box
from shapely.ops import polygonize, snap, unary_union

from pydantic import BaseModel, Field

from app.schemas.blueprint import BlueprintConfidenceBuckets, BlueprintExtractionResult, BlueprintFloor, BlueprintLegendItem, ExtractedSegment, RoomOverlay

from .labels import (
    canonical_name,
    extract_dimension_only,
    extract_printed_area,
    extract_room_dimension,
    is_room_name_label,
    normalize_floor_label,
    space_label_name,
)
from .parser import parse_layout
from .schemas import (
    CandidateSpace,
    DxfDiagnostics,
    DxfExtractionConfig,
    EXTRACTION_PASS_LABELS,
    HATCH_PATTERN_CONFIDENCE,
    LAYER_CONFIDENCE_PATTERNS,
    NormalizedEntity,
    TextLabel,
)
from .units import infer_unit_factor


class DxfFloorRegion(tuple):
    @property
    def name(self) -> str:
        return self[0]

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        return self[1]


WALL_PATTERNS = ("wall", "a-wall", "partition", "column", "coloumn", "coloumns", "muro", "struct", "rooms", "room boundary", "space boundary")
# ============================================================================
# PHASE 1: LAYER CONFIDENCE SCORING
# ============================================================================

def _layer_confidence_score(entity: NormalizedEntity, diagnostics: DxfDiagnostics) -> float:
    """Score layer name against known architectural CAD conventions.
    
    Returns confidence 0.0-1.0 that this layer contains rooms.
    Handles: AutoCAD, Revit, SketchUp, generic conventions.
    """
    signal = " ".join(part for part in [entity.layer, entity.block_name or ""] if part).lower()
    
    # Track scores for diagnostics
    best_score = 0.0
    for pattern, score in LAYER_CONFIDENCE_PATTERNS.items():
        if pattern in signal:
            best_score = max(best_score, score)
    
    if best_score > 0:
        diagnostics.layer_confidence_scores[entity.layer] = best_score
    
    return best_score


def _hatch_confidence_score(entity: NormalizedEntity, config: DxfExtractionConfig) -> float:
    """Score HATCH entity based on pattern type.
    
    SOLID hatches = 95% confident (100% reliable room indicator)
    Named patterns = 75% confident
    """
    if entity.entity_type != "HATCH":
        return 0.0
    
    if entity.hatch_pattern:
        pattern = entity.hatch_pattern.lower()
        for hatch_type, confidence in HATCH_PATTERN_CONFIDENCE.items():
            if hatch_type in pattern:
                return confidence
        # Unknown pattern type but it's still a hatch
        return 0.70
    
    # No pattern info = still a hatch, default high score
    return 0.75


# ============================================================================
# PHASE 2: DOOR VALIDATION  
# ============================================================================

def _extract_doors(entities: list[NormalizedEntity]) -> list[tuple[Point, NormalizedEntity]]:
    """Extract door entities and their centers.
    
    Detects doors by:
    1. Layer/block name patterns (explicit door markers)
    2. Geometry detection (short arcs/circles = door swings)
    """
    doors: list[tuple[Point, NormalizedEntity]] = []
    
    for entity in entities:
        # Method 1: Explicit door classification by name
        if _classify_entity(entity) == "door":
            bounds = entity.geometry.bounds
            center = Point((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2)
            doors.append((center, entity))
            continue
        
        # Method 2: Detect door-like geometries (arcs that could be door swings)
        # Door swings are typically short arcs (0.5-2m) in building drawings
        if isinstance(entity.geometry, LineString):
            # Check if it's a short arc-like segment (door swing marker)
            line = entity.geometry
            if line.length > 0.3 and line.length < 2.5:  # Typical door swing radius
                # Check if it's curved (more points than a straight line would have)
                coords = list(line.coords)
                if len(coords) > 4:  # Arc segments have many points
                    # This could be a door marker arc
                    center = Point((line.bounds[0] + line.bounds[2]) / 2, 
                                 (line.bounds[1] + line.bounds[3]) / 2)
                    doors.append((center, entity))
    
    return doors


def _validate_space_with_doors(polygon: Polygon, doors: list[tuple[Point, NormalizedEntity]]) -> tuple[bool, int]:
    """Check if polygon contains real interior space by examining door locations.
    
    Returns: (is_valid_interior_space, door_count)
    
    Spaces with doors = real interior rooms
    Exterior walls typically have no interior doors
    """
    doors_in_space = 0
    tolerance = 0.1  # Small buffer for door detection
    
    for door_point, _ in doors:
        if polygon.contains(door_point) or polygon.buffer(tolerance).contains(door_point):
            doors_in_space += 1
    
    # Heuristic: real rooms typically have at least one door
    # But allow high-confidence unlabeled spaces (utilities, closets)
    has_doors = doors_in_space > 0
    return has_doors, doors_in_space


def _space_confidence_from_door_validation(doors_count: int, base_confidence: float) -> float:
    """Boost confidence if door validation confirms interior space."""
    if doors_count > 0:
        return min(98, base_confidence + 15)  # Strong indicator of real room
    return base_confidence


# ============================================================================
# PHASE 3: MULTI-PASS HATCH EXTRACTION
# ============================================================================

def _extract_hatch_candidates(
    entities: list[NormalizedEntity],
    bounds: tuple[float, float, float, float],
    metre_factor: float,
    config: DxfExtractionConfig,
    diagnostics: DxfDiagnostics,
) -> list[tuple[Polygon, NormalizedEntity, float]]:
    """Extract hatch entities as high-confidence room candidates.
    
    Pass 1: SOLID hatches (95% confident)
    Pass 2: Patterned hatches (75% confident)
    
    Returns: (polygon, source_entity, confidence)
    """
    hatch_candidates: list[tuple[Polygon, NormalizedEntity, float]] = []
    
    if not config.enable_hatch_analysis:
        return hatch_candidates
    
    floor_area = max((bounds[2] - bounds[0]) * (bounds[3] - bounds[1]), 1)
    floor_box = box(*bounds)
    
    for entity in entities:
        if entity.entity_type != "HATCH":
            continue
        
        if not isinstance(entity.geometry, Polygon):
            continue
        
        polygon = entity.geometry
        if not polygon.is_valid or polygon.area <= 0:
            continue
        
        # Filter out hatches that are too large (exterior boundaries, sheets)
        if _bounds_area(polygon.bounds) / floor_area > 0.50:
            continue
        
        # Hatch should be reasonably sized room
        area_sqm = polygon.area * metre_factor * metre_factor
        if area_sqm < config.min_space_area_sqm * 0.5:  # Allow smaller hatch fills
            continue
        
        if area_sqm > 200:  # Very large hatches are unlikely to be rooms
            continue
        
        # Check intersection with floor region
        if polygon.intersection(floor_box).area / max(polygon.area, 0.000001) < 0.85:
            continue
        
        # Score this hatch
        hatch_confidence = _hatch_confidence_score(entity, config)
        layer_confidence = _layer_confidence_score(entity, diagnostics)
        combined_confidence = max(hatch_confidence, layer_confidence * 0.9)
        
        if combined_confidence >= config.hatch_confidence_threshold:
            hatch_candidates.append((polygon, entity, combined_confidence))
            if combined_confidence > 0.90:
                diagnostics.hatch_solid_polygons += 1
            else:
                diagnostics.hatch_patterned_polygons += 1
    
    return hatch_candidates


WALL_PATTERNS = ("wall", "a-wall", "partition", "column", "coloumn", "coloumns", "muro", "struct", "rooms", "room boundary", "space boundary")
DOOR_PATTERNS = ("door", "a-door", " dr", "dr-", "swing", "puerta")
WINDOW_PATTERNS = ("window", "win")
FURNITURE_PATTERNS = ("furn", "fixture", "fixer", "equip", "furniture", "bed", "chair", "table", "sofa", "closet", "gamla")
DIMENSION_PATTERNS = ("dim", "dimension")
TEXT_PATTERNS = ("text", "anno")
STAIR_PATTERNS = ("stair", "stairs")
SYMBOL_BATH_PATTERNS = ("bath", "bathtub", "tub", "toilet", "wc", "shower", "lav", "lavatory", "sink", "cr")
SYMBOL_KITCHEN_PATTERNS = ("kitchen", "pantry", "stove", "range", "cooktop", "fridge", "refrigerator", "ref", "cabinet")
SYMBOL_BED_PATTERNS = ("bed", "bedroom", "mattress")
SYMBOL_LIVING_PATTERNS = ("sofa", "couch", "dining", "chair", "table", "lounge", "living")
SYMBOL_SERVICE_PATTERNS = ("washer", "dryer", "laundry", "water heater", "heater", "wh")

CATEGORY_MATRIX: tuple[tuple[str, tuple[str, ...], str, float], ...] = (
    ("Master Suite", ("master", "master bed", "master bath"), "#A8DADC", 0.35),
    ("Living Areas", ("living", "dining", "family", "great room"), "#80B3FF", 0.35),
    ("Bedrooms / Suites", ("bed", "br", "bedroom", "suite"), "#FFB3BA", 0.35),
    ("Kitchen & Dining", ("kitchen", "pantry", "nook", "bar"), "#FFCC80", 0.35),
    ("Bathrooms & Services", ("bath", "wc", "powder", "toilet", "utility", "laundry", "cr"), "#A8E6CF", 0.35),
    ("Commercial & Storage", ("shop", "store", "commercial", "storage"), "#4ECDC4", 0.35),
    ("Balconies & Porches", ("porch", "veranda", "balcony", "deck"), "#E8A0BF", 0.35),
    ("Circulation & Hallways", ("hall", "corridor", "passage", "stair", "stairs", "entrance"), "#9B59B6", 0.35),
    ("Unassigned Utility / Room", (), "#7F8C8D", 0.35),
)
HALLWAY_KEYWORDS = ("hall", "corridor", "passage", "stair", "stairs", "entrance")
GEMINI_LABEL_MODEL = os.environ.get("GEMINI_LABEL_MODEL", "gemini-1.5-flash")


class GeminiRoomCategory(BaseModel):
    standardized_name: str = Field(min_length=1, max_length=150)
    category: str
    color_hex: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")


def _category_color(category: str) -> str | None:
    for matrix_category, _, color_hex, _ in CATEGORY_MATRIX:
        if matrix_category == category:
            return color_hex
    return None


def _normalize_label_with_gemini(raw_text: str, deterministic_category: str, deterministic_color: str) -> GeminiRoomCategory | None:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key or raw_text.startswith("UNLABELED_SPACE_"):
        return None
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        prompt = (
            "Classify this architectural room label into one standardized room name and one category. "
            "Do not calculate or change any geometry, area, perimeter, polygon, or bounding-box value. "
            "Allowed categories: Living Areas, Bedrooms / Suites, Master Suite, Kitchen & Dining, "
            "Bathrooms & Services, Commercial & Storage, Balconies & Porches, Circulation & Hallways, "
            "Unassigned Utility / Room. Use semantic normalization for multilingual labels such as SALA, "
            "ESTAR, COMEDOR, COCINA, BANO, DORMITORIO, CUARTO, LAVANDERIA, or MURO annotations. "
            f'Input JSON: {{"raw_text": "{raw_text}", "deterministic_category": "{deterministic_category}"}}'
        )
        response = client.models.generate_content(
            model=GEMINI_LABEL_MODEL,
            contents=[prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=GeminiRoomCategory,
            ),
        )
        parsed = response.parsed
        result = parsed if isinstance(parsed, GeminiRoomCategory) else GeminiRoomCategory.model_validate(parsed)
        allowed_color = _category_color(result.category)
        if not allowed_color:
            return None
        return GeminiRoomCategory(
            standardized_name=result.standardized_name.strip() or raw_text,
            category=result.category,
            color_hex=allowed_color or deterministic_color,
        )
    except Exception:
        return None


def _hex_to_rgba(color_hex: str, alpha: float) -> tuple[int, int, int, float]:
    return (int(color_hex[1:3], 16), int(color_hex[3:5], 16), int(color_hex[5:7], 16), alpha)


def _space_aspect_ratio(polygon: Polygon) -> float:
    min_x, min_y, max_x, max_y = polygon.bounds
    width = max(max_x - min_x, 0.000001)
    height = max(max_y - min_y, 0.000001)
    return max(width, height) / min(width, height)


def _category_for_space(name: str, polygon: Polygon, labeled: bool) -> tuple[str, str, float]:
    lowered = canonical_name(name)
    multilingual = {
        "sala": "Living Areas",
        "estar": "Living Areas",
        "comedor": "Living Areas",
        "cocina": "Kitchen & Dining",
        "bano": "Bathrooms & Services",
        "baño": "Bathrooms & Services",
        "dormitorio": "Bedrooms / Suites",
        "cuarto": "Bedrooms / Suites",
        "lavanderia": "Bathrooms & Services",
        "lavandería": "Bathrooms & Services",
    }
    if any(keyword in lowered for keyword in HALLWAY_KEYWORDS) or _space_aspect_ratio(polygon) >= 3.0:
        return ("Circulation & Hallways", "#9B59B6", 0.35)
    if "void" in lowered:
        return ("Unassigned Utility / Room", "#7F8C8D", 0.35)
    if not labeled:
        return ("Unassigned Utility / Room", "#7F8C8D", 0.35)
    for keyword, category in multilingual.items():
        if re.search(rf"\b{re.escape(keyword)}\b", lowered):
            return (category, _category_color(category) or "#7F8C8D", 0.35)
    for category, keywords, color_hex, alpha in CATEGORY_MATRIX:
        if keywords and any(re.search(rf"\b{re.escape(keyword)}\b", lowered) for keyword in keywords):
            return (category, color_hex, alpha)
    return ("Unassigned Utility / Room", "#7F8C8D", 0.35)


def _matches(value: str | None, patterns: tuple[str, ...]) -> bool:
    lowered = f" {value or ''} ".lower()
    return any(pattern in lowered for pattern in patterns)


def _symbol_signal(entity: NormalizedEntity) -> str:
    return " ".join(part for part in [entity.layer, entity.block_name, entity.entity_type] if part).lower()


def _classify_symbol_entity(entity: NormalizedEntity) -> str | None:
    signal = _symbol_signal(entity)
    classification = _classify_entity(entity)
    if classification in {"door", "window"}:
        return classification
    if classification == "stairs" or _matches(signal, STAIR_PATTERNS):
        return "stairs"
    if _matches(signal, SYMBOL_BATH_PATTERNS):
        return "bath_fixture"
    if _matches(signal, SYMBOL_KITCHEN_PATTERNS):
        return "kitchen_fixture"
    if _matches(signal, SYMBOL_BED_PATTERNS):
        return "bed"
    if _matches(signal, SYMBOL_LIVING_PATTERNS):
        return "living_furniture"
    if _matches(signal, SYMBOL_SERVICE_PATTERNS):
        return "service_fixture"
    return None


def _symbol_evidence_for_polygon(
    polygon: Polygon,
    entities: list[NormalizedEntity],
    labels: list[TextLabel],
    drawing_span: float,
) -> list[str]:
    evidence: list[str] = []
    padded_polygon = polygon.buffer(max(drawing_span * 0.002, 0.05))
    for entity in entities:
        symbol = _classify_symbol_entity(entity)
        if not symbol:
            continue
        if padded_polygon.contains(entity.geometry.representative_point()) or padded_polygon.intersects(entity.geometry):
            evidence.append(symbol)
    for label in labels:
        lowered = canonical_name(label.text)
        if lowered in {"up", "dn", "down"} and padded_polygon.contains(label.point):
            evidence.append("stairs")
        elif "void" in lowered and padded_polygon.contains(label.point):
            evidence.append("void")
    return sorted(set(evidence))


def _name_from_symbol_evidence(evidence: list[str], fallback: str) -> str:
    counts = Counter(evidence)
    if counts["bath_fixture"] >= 1:
        return "Bathroom"
    if counts["kitchen_fixture"] >= 1:
        return "Kitchen"
    if counts["bed"] >= 1:
        return "Bedroom"
    if counts["living_furniture"] >= 1:
        return "Living Area"
    if counts["service_fixture"] >= 1:
        return "Service Area"
    if counts["stairs"] >= 1:
        return "Stairs"
    if counts["void"] >= 1:
        return "Void Area"
    return fallback


def _confidence_from_symbol_evidence(confidence: float, evidence: list[str]) -> float:
    if any(symbol in evidence for symbol in ("bath_fixture", "kitchen_fixture", "bed", "living_furniture", "service_fixture", "stairs", "void")):
        return min(92, confidence + 18)
    if any(symbol in evidence for symbol in ("door", "window")):
        return min(86, confidence + 6)
    return confidence


def _bounds_area(bounds: tuple[float, float, float, float]) -> float:
    return max(bounds[2] - bounds[0], 0) * max(bounds[3] - bounds[1], 0)


def _bounds_center(bounds: tuple[float, float, float, float]) -> tuple[float, float]:
    return ((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2)


def _contains_point(bounds: tuple[float, float, float, float], point: tuple[float, float]) -> bool:
    return bounds[0] <= point[0] <= bounds[2] and bounds[1] <= point[1] <= bounds[3]


def _expanded(bounds: tuple[float, float, float, float], padding: float) -> tuple[float, float, float, float]:
    return (bounds[0] - padding, bounds[1] - padding, bounds[2] + padding, bounds[3] + padding)


def _union_bounds(bounds: list[tuple[float, float, float, float]]) -> tuple[float, float, float, float]:
    return (
        min(bound[0] for bound in bounds),
        min(bound[1] for bound in bounds),
        max(bound[2] for bound in bounds),
        max(bound[3] for bound in bounds),
    )


def _bounds_intersect(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> bool:
    return a[0] <= b[2] and a[2] >= b[0] and a[1] <= b[3] and a[3] >= b[1]


def _all_bounds(entities: list[NormalizedEntity], labels: list[TextLabel]) -> tuple[float, float, float, float]:
    bounds = [entity.geometry.bounds for entity in entities if not entity.geometry.is_empty]
    bounds.extend((label.point.x, label.point.y, label.point.x, label.point.y) for label in labels)
    return _union_bounds(bounds)


def _floor_regions_from_labels(labels: list[TextLabel], drawing_bounds: tuple[float, float, float, float]) -> list[DxfFloorRegion]:
    floor_labels = [(label, normalize_floor_label(label.text)) for label in labels]
    floor_labels = [(label, name) for label, name in floor_labels if name]
    proposal_labels = [(label, name) for label, name in floor_labels if "proposal" in name.lower()]
    if len(proposal_labels) >= 2:
        floor_labels = proposal_labels
    if not floor_labels:
        return [DxfFloorRegion(("Floor Plan", drawing_bounds))]

    xs = sorted({float(label.point.x) for label, _ in floor_labels})
    ys = sorted({float(label.point.y) for label, _ in floor_labels})

    def bands(values: list[float], low: float, high: float) -> list[tuple[float, float]]:
        if len(values) <= 1:
            return [(low, high)]
        mids = [(values[index] + values[index + 1]) / 2 for index in range(len(values) - 1)]
        return [(low, mids[0]), *[(mids[index - 1], mids[index]) for index in range(1, len(mids))], (mids[-1], high)]

    x_bands = bands(xs, drawing_bounds[0], drawing_bounds[2])
    y_bands = bands(ys, drawing_bounds[1], drawing_bounds[3])
    regions: list[DxfFloorRegion] = []
    seen: set[str] = set()
    for label, name in floor_labels:
        assert name is not None
        x, y = float(label.point.x), float(label.point.y)
        x_band = next((band for band in x_bands if band[0] <= x <= band[1]), (drawing_bounds[0], drawing_bounds[2]))
        y_band = next((band for band in y_bands if band[0] <= y <= band[1]), (drawing_bounds[1], drawing_bounds[3]))
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        regions.append(DxfFloorRegion((name, (x_band[0], y_band[0], x_band[1], y_band[1]))))
    return regions or [DxfFloorRegion(("Floor Plan", drawing_bounds))]


def _floor_regions_from_geometry(entities: list[NormalizedEntity], labels: list[TextLabel], drawing_bounds: tuple[float, float, float, float]) -> list[DxfFloorRegion]:
    drawing_area = max(_bounds_area(drawing_bounds), 1)
    drawing_span = max(drawing_bounds[2] - drawing_bounds[0], drawing_bounds[3] - drawing_bounds[1], 1)
    merge_padding = drawing_span * 0.012
    min_component_area = drawing_area * 0.01
    candidates = [entity.geometry.bounds for entity in entities if 0 < _bounds_area(entity.geometry.bounds) < drawing_area * 0.72]

    components: list[list[tuple[float, float, float, float]]] = []
    for bounds in candidates:
        expanded = _expanded(bounds, merge_padding)
        matched = [index for index, component in enumerate(components) if any(_bounds_intersect(expanded, _expanded(existing, merge_padding)) for existing in component)]
        if not matched:
            components.append([bounds])
            continue
        first = matched[0]
        components[first].append(bounds)
        for index in reversed(matched[1:]):
            components[first].extend(components.pop(index))

    component_bounds = [_union_bounds(component) for component in components]
    component_bounds = [bounds for bounds in component_bounds if _bounds_area(bounds) >= min_component_area]
    if len(component_bounds) < 2:
        return []

    floor_labels = [(label, normalize_floor_label(label.text)) for label in labels]
    floor_labels = [(label, name) for label, name in floor_labels if name]

    def label_for(bounds: tuple[float, float, float, float], index: int) -> str:
        expanded = _expanded(bounds, drawing_span * 0.08)
        nearby = [(label, name) for label, name in floor_labels if _contains_point(expanded, (float(label.point.x), float(label.point.y)))]
        if nearby:
            nearby.sort(key=lambda item: abs(float(item[0].point.x) - _bounds_center(bounds)[0]) + abs(float(item[0].point.y) - bounds[1]))
            return nearby[0][1] or f"Floor Plan {index + 1}"
        return f"Floor Plan {index + 1}"

    return [DxfFloorRegion((label_for(bounds, index), bounds)) for index, bounds in enumerate(sorted(component_bounds, key=lambda bounds: (-_bounds_center(bounds)[1], _bounds_center(bounds)[0])))]


def _floor_regions_from_space_label_clusters(labels: list[TextLabel], drawing_bounds: tuple[float, float, float, float]) -> list[DxfFloorRegion]:
    space_labels = [label for label in labels if is_room_name_label(label.text)]
    if len(space_labels) < 12:
        return []

    label_xs = sorted(float(label.point.x) for label in space_labels)
    label_ys = sorted(float(label.point.y) for label in space_labels)
    span_x = max(label_xs[-1] - label_xs[0], 1)
    span_y = max(label_ys[-1] - label_ys[0], 1)

    def split_bands(values: list[float], low: float, high: float, span: float) -> list[tuple[float, float]]:
        unique = sorted(set(values))
        if len(unique) < 2:
            return [(low, high)]
        split_points = [
            (unique[index] + unique[index + 1]) / 2
            for index in range(len(unique) - 1)
            if unique[index + 1] - unique[index] >= span * 0.12
        ]
        if not split_points:
            return [(low, high)]
        edges = [low, *split_points, high]
        return list(zip(edges, edges[1:]))

    padding_x = span_x * 0.12
    padding_y = span_y * 0.15
    x_bands = split_bands(label_xs, label_xs[0] - padding_x, label_xs[-1] + padding_x, span_x)
    y_bands = split_bands(label_ys, label_ys[0] - padding_y, label_ys[-1] + padding_y, span_y)
    # Plans laid out side by side should not also be split into arbitrary rows.
    if len(x_bands) >= 2:
        y_bands = [(label_ys[0] - padding_y, label_ys[-1] + padding_y)]
    elif len(y_bands) >= 2:
        x_bands = [(label_xs[0] - padding_x, label_xs[-1] + padding_x)]
    else:
        return []

    regions: list[DxfFloorRegion] = []
    for y_band in sorted(y_bands, key=lambda band: -_bounds_center((0, band[0], 0, band[1]))[1]):
        for x_band in sorted(x_bands, key=lambda band: band[0]):
            contained = [
                label
                for label in space_labels
                if x_band[0] <= float(label.point.x) <= x_band[1] and y_band[0] <= float(label.point.y) <= y_band[1]
            ]
            if len(contained) < 2:
                continue
            regions.append(DxfFloorRegion((f"Floor Plan {len(regions) + 1}", (x_band[0], y_band[0], x_band[1], y_band[1]))))
    return regions


def _best_axis_split(values: list[float], low: float, high: float, min_gap_ratio: float = 0.1) -> float | None:
    unique = sorted(set(round(value, 6) for value in values if low <= value <= high))
    if len(unique) < 8:
        return None
    span = max(high - low, 1)
    gaps = [
        (unique[index + 1] - unique[index], (unique[index] + unique[index + 1]) / 2, index + 1, len(unique) - index - 1)
        for index in range(len(unique) - 1)
    ]
    balanced = [
        (gap, split)
        for gap, split, lower_count, upper_count in gaps
        if gap >= span * min_gap_ratio and min(lower_count, upper_count) >= max(4, len(unique) * 0.08)
    ]
    if not balanced:
        return None
    return max(balanced, key=lambda item: item[0])[1]


def _floor_regions_from_sheet_grid(
    entities: list[NormalizedEntity],
    labels: list[TextLabel],
    drawing_bounds: tuple[float, float, float, float],
) -> list[DxfFloorRegion]:
    drawing_area = max(_bounds_area(drawing_bounds), 1)
    useful_entities = []
    for entity in entities:
        bounds = entity.geometry.bounds
        if _bounds_area(bounds) <= 0:
            continue
        if _bounds_area(bounds) >= drawing_area * 0.35:
            continue
        if _classify_entity(entity) in {"dimension", "furniture"}:
            continue
        useful_entities.append(entity)
    if len(useful_entities) < 40:
        return []

    centers = [_bounds_center(entity.geometry.bounds) for entity in useful_entities]
    x_split = _best_axis_split([center[0] for center in centers], drawing_bounds[0], drawing_bounds[2])
    y_split = _best_axis_split([center[1] for center in centers], drawing_bounds[1], drawing_bounds[3])
    if x_split is None or y_split is None:
        return []

    raw_regions = [
        (drawing_bounds[0], y_split, x_split, drawing_bounds[3]),
        (x_split, y_split, drawing_bounds[2], drawing_bounds[3]),
        (drawing_bounds[0], drawing_bounds[1], x_split, y_split),
        (x_split, drawing_bounds[1], drawing_bounds[2], y_split),
    ]
    floor_label_pairs = [(label, normalize_floor_label(label.text)) for label in labels]
    floor_label_pairs = [(label, name) for label, name in floor_label_pairs if name]
    regions: list[DxfFloorRegion] = []

    def wall_components(wall_entities: list[NormalizedEntity], raw_bounds: tuple[float, float, float, float]) -> list[tuple[float, float, float, float]]:
        row_span = max(raw_bounds[2] - raw_bounds[0], raw_bounds[3] - raw_bounds[1], 1)
        merge_padding = row_span * 0.035
        components: list[list[tuple[float, float, float, float]]] = []
        for entity in wall_entities:
            bounds = entity.geometry.bounds
            expanded = _expanded(bounds, merge_padding)
            matched = [
                index
                for index, component in enumerate(components)
                if any(_bounds_intersect(expanded, _expanded(existing, merge_padding)) for existing in component)
            ]
            if not matched:
                components.append([bounds])
                continue
            first = matched[0]
            components[first].append(bounds)
            for index in reversed(matched[1:]):
                components[first].extend(components.pop(index))

        min_wall_count = 24
        min_area = _bounds_area(raw_bounds) * 0.06
        component_bounds = [
            _union_bounds(component)
            for component in components
            if len(component) >= min_wall_count and _bounds_area(_union_bounds(component)) >= min_area
        ]
        return sorted(component_bounds, key=lambda bounds: _bounds_center(bounds)[0])

    for raw_bounds in raw_regions:
        contained_entities = [
            entity
            for entity in useful_entities
            if _contains_point(raw_bounds, _bounds_center(entity.geometry.bounds))
        ]
        wall_entities = [entity for entity in contained_entities if _classify_entity(entity) == "wall"]
        contained_labels = [
            label
            for label in labels
            if _contains_point(raw_bounds, (float(label.point.x), float(label.point.y)))
            and is_room_name_label(label.text)
        ]
        if len(contained_entities) < 12 or len(wall_entities) < 24 or len(contained_labels) < 3:
            continue
        for tight_bounds in wall_components(wall_entities, raw_bounds):
            span = max(tight_bounds[2] - tight_bounds[0], tight_bounds[3] - tight_bounds[1], 1)
            tight_bounds = _expanded(tight_bounds, span * 0.045)
            nearby_labels = [
                (label, name)
                for label, name in floor_label_pairs
                if _contains_point(_expanded(tight_bounds, span * 0.45), (float(label.point.x), float(label.point.y)))
            ]
            name = nearby_labels[0][1] if nearby_labels else f"Floor Plan {len(regions) + 1}"
            regions.append(DxfFloorRegion((name, tight_bounds)))
    return regions if len(regions) >= 2 else []


def _dbscan_floor_regions_from_wall_midpoints(
    entities: list[NormalizedEntity],
    labels: list[TextLabel],
    drawing_bounds: tuple[float, float, float, float],
    metre_factor: float,
    eps_m: float = 10.0,
    min_samples: int = 20,
) -> list[DxfFloorRegion]:
    wall_entities = [
        entity
        for entity in entities
        if entity.entity_type in {"LINE", "LWPOLYLINE", "POLYLINE"}
        and _classify_entity(entity) in {"wall", "stairs", "unknown"}
        and not entity.geometry.is_empty
        and _bounds_area(entity.geometry.bounds) > 0
    ]
    if len(wall_entities) < min_samples * 2:
        return []

    points = [_bounds_center(entity.geometry.bounds) for entity in wall_entities]
    eps = eps_m / max(metre_factor, 0.000001)
    try:
        from sklearn.cluster import DBSCAN

        raw_labels = DBSCAN(eps=eps, min_samples=min_samples).fit(points).labels_
        labels_by_index = {index: int(label) + 1 for index, label in enumerate(raw_labels) if int(label) >= 0}
        cluster_ids = sorted(set(labels_by_index.values()))
    except Exception:
        visited: set[int] = set()
        labels_by_index: dict[int, int] = {}
        cluster_id = 0

        def neighbors(index: int) -> list[int]:
            x, y = points[index]
            return [
                other_index
                for other_index, (other_x, other_y) in enumerate(points)
                if math.hypot(x - other_x, y - other_y) <= eps
            ]

        for index in range(len(points)):
            if index in visited:
                continue
            visited.add(index)
            seed_neighbors = neighbors(index)
            if len(seed_neighbors) < min_samples:
                continue
            cluster_id += 1
            labels_by_index[index] = cluster_id
            queue = list(seed_neighbors)
            while queue:
                candidate = queue.pop(0)
                if candidate not in visited:
                    visited.add(candidate)
                    candidate_neighbors = neighbors(candidate)
                    if len(candidate_neighbors) >= min_samples:
                        for neighbor in candidate_neighbors:
                            if neighbor not in queue:
                                queue.append(neighbor)
                labels_by_index.setdefault(candidate, cluster_id)
        cluster_ids = list(range(1, cluster_id + 1))

    if len(cluster_ids) < 2:
        return []

    floor_label_pairs = [(label, normalize_floor_label(label.text)) for label in labels]
    floor_label_pairs = [(label, name) for label, name in floor_label_pairs if name]
    regions: list[DxfFloorRegion] = []
    for current_cluster_id in cluster_ids:
        cluster_entities = [
            wall_entities[index]
            for index, assigned_cluster_id in labels_by_index.items()
            if assigned_cluster_id == current_cluster_id
        ]
        if len(cluster_entities) < min_samples:
            continue
        bounds = _union_bounds([entity.geometry.bounds for entity in cluster_entities])
        span = max(bounds[2] - bounds[0], bounds[3] - bounds[1], 1)
        bounds = _expanded(bounds, span * 0.05)
        nearby_labels = [
            (label, name)
            for label, name in floor_label_pairs
            if _contains_point(_expanded(bounds, span * 0.25), (float(label.point.x), float(label.point.y)))
        ]
        name = nearby_labels[0][1] if nearby_labels else f"Floor Plan {len(regions) + 1}"
        regions.append(DxfFloorRegion((name, bounds)))

    drawing_area = max(_bounds_area(drawing_bounds), 1)
    regions = [region for region in regions if _bounds_area(region.bounds) >= drawing_area * 0.01]
    return sorted(regions, key=lambda region: (-_bounds_center(region.bounds)[1], _bounds_center(region.bounds)[0])) if len(regions) >= 2 else []


def _split_regions_by_internal_label_gaps(regions: list[DxfFloorRegion], labels: list[TextLabel]) -> list[DxfFloorRegion]:
    split_regions: list[DxfFloorRegion] = []
    space_labels = [label for label in labels if is_room_name_label(label.text)]

    for floor_id, region in enumerate(regions, start=1):
        contained = [
            label
            for label in space_labels
            if _contains_point(region.bounds, (float(label.point.x), float(label.point.y)))
        ]
        if len(contained) < 16:
            split_regions.append(region)
            continue

        span_x = max(region.bounds[2] - region.bounds[0], 1)
        span_y = max(region.bounds[3] - region.bounds[1], 1)

        def best_gap(values: list[float], span: float) -> tuple[float, float, int] | None:
            unique = sorted(set(values))
            if len(unique) < 2:
                return None
            gaps = [(unique[index + 1] - unique[index], (unique[index] + unique[index + 1]) / 2, index) for index in range(len(unique) - 1)]
            gap, split, index = max(gaps, key=lambda item: item[0])
            if gap < span * 0.16:
                return None
            lower_count = index + 1
            upper_count = len(unique) - lower_count
            if min(lower_count, upper_count) < 4:
                return None
            return (gap, split, index)

        x_gap = best_gap([float(label.point.x) for label in contained], span_x)
        y_gap = best_gap([float(label.point.y) for label in contained], span_y)
        if not x_gap and not y_gap:
            split_regions.append(region)
            continue

        split_axis = "y"
        split_value = y_gap[1] if y_gap else 0
        if x_gap and (not y_gap or x_gap[0] / span_x > y_gap[0] / span_y):
            split_axis = "x"
            split_value = x_gap[1]

        if split_axis == "y":
            lower = DxfFloorRegion((f"{region.name} 2", (region.bounds[0], region.bounds[1], region.bounds[2], split_value)))
            upper = DxfFloorRegion((region.name, (region.bounds[0], split_value, region.bounds[2], region.bounds[3])))
            split_regions.extend([upper, lower])
        else:
            left = DxfFloorRegion((region.name, (region.bounds[0], region.bounds[1], split_value, region.bounds[3])))
            right = DxfFloorRegion((f"{region.name} 2", (split_value, region.bounds[1], region.bounds[2], region.bounds[3])))
            split_regions.extend([left, right])

    deduped: list[DxfFloorRegion] = []
    ordered = sorted(split_regions, key=lambda item: (-_bounds_center(item.bounds)[1], _bounds_center(item.bounds)[0]))
    for index, region in enumerate(ordered, start=1):
        proposal_region = "proposal" in region.name.lower()
        generated_second_region = region.name.endswith(" 2") and "proposal" not in region.name.lower()
        label_name = region.name if proposal_region or (not region.name.startswith("Floor Plan") and not generated_second_region) else f"Floor Plan {index}"
        deduped.append(DxfFloorRegion((label_name, region.bounds)))
    return deduped


def _classify_entity(entity: NormalizedEntity) -> str:
    signal = " ".join(part for part in [entity.layer, entity.block_name, entity.entity_type] if part)
    if entity.entity_type == "HATCH":
        return "hatch"
    if entity.entity_type == "DIMENSION" or _matches(signal, DIMENSION_PATTERNS):
        return "dimension"
    if _matches(signal, DOOR_PATTERNS):
        return "door"
    if _matches(signal, WINDOW_PATTERNS):
        return "window"
    if _matches(signal, FURNITURE_PATTERNS):
        return "furniture"
    if _matches(signal, STAIR_PATTERNS):
        return "stairs"
    if _matches(signal, WALL_PATTERNS):
        return "wall"
    if _matches(signal, TEXT_PATTERNS):
        return "annotation"
    if entity.lineweight is not None and entity.lineweight >= 35:
        return "wall"
    return "unknown"


def _iter_linework(entities: list[NormalizedEntity], include_unknown: bool = True) -> list[LineString]:
    linework: list[LineString] = []
    classified_walls_exist = any(_classify_entity(entity) in {"wall", "stairs"} for entity in entities)
    for entity in entities:
        classification = _classify_entity(entity)
        if classification in {"dimension", "furniture", "door", "window", "hatch", "annotation"}:
            continue
        if classification == "unknown" and (not include_unknown or classified_walls_exist):
            continue
        geom = entity.geometry
        if isinstance(geom, LineString):
            if geom.length > 0:
                linework.append(geom)
        elif isinstance(geom, Polygon):
            coords = list(geom.exterior.coords)
            for start, end in zip(coords, coords[1:]):
                linework.append(LineString([start, end]))
    return linework


def _close_linework_gaps(
    linework: list[LineString],
    drawing_span: float,
    metre_factor: float,
    config: DxfExtractionConfig,
    diagnostics: DxfDiagnostics | None = None,
) -> list[LineString]:
    native_units_per_metre = 1 / max(metre_factor, 0.000001)
    door_width_max = config.door_width_max_m * native_units_per_metre
    small_gap_max = 0.15 * native_units_per_metre
    max_gap = door_width_max
    small_alignment = 0.08 * native_units_per_metre
    door_alignment = 0.05 * native_units_per_metre
    endpoints: list[tuple[int, tuple[float, float], tuple[float, float]]] = []

    def unit_direction(start: tuple[float, float], end: tuple[float, float]) -> tuple[float, float]:
        dx, dy = end[0] - start[0], end[1] - start[1]
        length = math.hypot(dx, dy)
        return (dx / length, dy / length) if length > 0 else (0.0, 0.0)

    def extends_toward(direction: tuple[float, float], start: tuple[float, float], end: tuple[float, float]) -> bool:
        toward = unit_direction(start, end)
        return direction[0] * toward[0] + direction[1] * toward[1] >= 0.97

    for line_index, line in enumerate(linework):
        coords = list(line.coords)
        if len(coords) >= 2:
            first = (float(coords[0][0]), float(coords[0][1]))
            second = (float(coords[1][0]), float(coords[1][1]))
            last = (float(coords[-1][0]), float(coords[-1][1]))
            previous = (float(coords[-2][0]), float(coords[-2][1]))
            endpoints.append((line_index, first, unit_direction(second, first)))
            endpoints.append((line_index, last, unit_direction(previous, last)))

    candidates: list[tuple[float, bool, tuple[float, float], tuple[float, float]]] = []
    for index, (start_line, start, start_direction) in enumerate(endpoints):
        for end_line, end, end_direction in endpoints[index + 1 :]:
            if start_line == end_line:
                continue
            dx = abs(start[0] - end[0])
            dy = abs(start[1] - end[1])
            distance = math.hypot(dx, dy)
            if distance <= 0.000001 or distance > max_gap:
                continue
            is_small_gap = distance <= small_gap_max
            alignment_tolerance = small_alignment if is_small_gap else door_alignment
            if min(dx, dy) > alignment_tolerance:
                continue
            if not extends_toward(start_direction, start, end) or not extends_toward(end_direction, end, start):
                continue
            candidates.append((distance, is_small_gap, start, end))

    # Close short T-junction breaks where a wall endpoint stops just before the
    # middle of another wall segment. These cannot be found by endpoint pairing.
    for start_line, start, start_direction in endpoints:
        start_point = Point(start)
        for end_line, target_line in enumerate(linework):
            if start_line == end_line:
                continue
            projected = target_line.interpolate(target_line.project(start_point))
            end = (float(projected.x), float(projected.y))
            distance = math.dist(start, end)
            if distance <= 0.000001 or distance > small_gap_max:
                continue
            if not extends_toward(start_direction, start, end):
                continue
            candidates.append((distance, True, start, end))

    closed = list(linework)
    used: set[tuple[float, float]] = set()
    for _, is_small_gap, start, end in sorted(candidates, key=lambda item: item[0]):
        if start in used or end in used:
            continue
        closed.append(LineString([start, end]))
        used.add(start)
        used.add(end)
        if diagnostics:
            if is_small_gap:
                diagnostics.closed_small_gaps += 1
            else:
                diagnostics.closed_door_gaps += 1
    return closed


def _polygon_parts(geometry: object) -> list[Polygon]:
    if isinstance(geometry, Polygon):
        return [geometry]
    if isinstance(geometry, MultiPolygon):
        return list(geometry.geoms)
    return []


def _axis_aligned_label_partitions(
    bounds: tuple[float, float, float, float],
    indexed_points: list[tuple[int, Point]],
    obstacles: list[Polygon],
) -> dict[int, Polygon]:
    partitions: dict[int, Polygon] = {}

    def split(cell: tuple[float, float, float, float], items: list[tuple[int, Point]]) -> None:
        if len(items) == 1:
            index, point = items[0]
            candidate = box(*cell)
            for obstacle in obstacles:
                if candidate.intersection(obstacle).area <= 0 or obstacle.covers(point):
                    continue
                min_x, min_y, max_x, max_y = candidate.bounds
                obstacle_min_x, obstacle_min_y, obstacle_max_x, obstacle_max_y = obstacle.bounds
                trims = [
                    box(obstacle_max_x, min_y, max_x, max_y),
                    box(min_x, min_y, obstacle_min_x, max_y),
                    box(min_x, obstacle_max_y, max_x, max_y),
                    box(min_x, min_y, max_x, obstacle_min_y),
                ]
                valid = [trim for trim in trims if trim.area > 0 and trim.covers(point)]
                if valid:
                    candidate = max(valid, key=lambda trim: trim.area)
            partitions[index] = candidate
            return

        xs = [float(point.x) for _, point in items]
        ys = [float(point.y) for _, point in items]
        axis = 0 if max(xs) - min(xs) >= max(ys) - min(ys) else 1
        ordered = sorted(items, key=lambda item: float(item[1].x if axis == 0 else item[1].y))
        midpoint = len(ordered) // 2
        lower_items, upper_items = ordered[:midpoint], ordered[midpoint:]
        lower_value = float(lower_items[-1][1].x if axis == 0 else lower_items[-1][1].y)
        upper_value = float(upper_items[0][1].x if axis == 0 else upper_items[0][1].y)
        cut = (lower_value + upper_value) / 2
        min_x, min_y, max_x, max_y = cell
        if axis == 0:
            split((min_x, min_y, cut, max_y), lower_items)
            split((cut, min_y, max_x, max_y), upper_items)
        else:
            split((min_x, min_y, max_x, cut), lower_items)
            split((min_x, cut, max_x, max_y), upper_items)

    split(bounds, indexed_points)
    return partitions


def _polygon_is_usable_space_shape(polygon: Polygon, metre_factor: float, config: DxfExtractionConfig) -> bool:
    min_x, min_y, max_x, max_y = polygon.bounds
    width_m = (max_x - min_x) * metre_factor
    height_m = (max_y - min_y) * metre_factor
    short_side = min(width_m, height_m)
    long_side = max(width_m, height_m)
    area_sqm = polygon.area * metre_factor * metre_factor
    if area_sqm < config.min_space_area_sqm:
        return False
    if short_side < 0.65 and long_side > short_side * 3:
        return False
    if area_sqm < 1.2 and short_side < 0.9 and long_side > short_side * 2.5:
        return False
    return True


def _polygon_centroid_key(polygon: Polygon, tolerance: float) -> tuple[int, int, int]:
    centroid = polygon.centroid
    area_bucket = round(polygon.area / max(tolerance * tolerance, 0.000001))
    return (round(float(centroid.x) / tolerance), round(float(centroid.y) / tolerance), area_bucket)


def _label_point(label: TextLabel) -> Point:
    # We only persist insertion coordinates today. Keeping this helper isolates the
    # MTEXT quirk: once text extents are available, this should return the bbox centroid.
    return label.point


def _is_candidate_room_text(label: TextLabel) -> bool:
    text = label.text.strip()
    if not text or normalize_floor_label(text) or extract_dimension_only(text):
        return False
    if is_room_name_label(text) or extract_room_dimension(text):
        return True
    if len(text) > 80:
        return False
    words = re.findall(r"[A-Za-zÀ-ÿ]{2,}", text)
    return 1 <= len(words) <= 8


def _room_label_count(polygon: Polygon, labels: list[TextLabel], tolerance: float = 0.0) -> int:
    tested = polygon.buffer(tolerance) if tolerance > 0 else polygon
    return sum(1 for label in labels if tested.contains(_label_point(label)) or tested.touches(_label_point(label)))


def _authoritative_polygon_score(polygon: Polygon, source: NormalizedEntity | None) -> tuple[int, float]:
    if source is None:
        return (1, polygon.area)
    signal = f"{source.layer} {source.block_name or ''}".lower()
    if "room" in signal or "area" in signal:
        return (4, polygon.area)
    if "hatch" in source.entity_type.lower() or "floor" in signal:
        return (2, polygon.area)
    return (3, polygon.area)


def _dedupe_polygons(
    candidates: list[tuple[Polygon, NormalizedEntity | None]],
    tolerance: float,
) -> list[tuple[Polygon, NormalizedEntity | None]]:
    # DXFs often carry identical loops on wall, hatch, and finish layers. Count geometry,
    # not entities, or the UI gets duplicate rooms stacked on top of each other.
    grouped: dict[tuple[int, int, int], tuple[Polygon, NormalizedEntity | None]] = {}
    for polygon, source in candidates:
        key = _polygon_centroid_key(polygon, tolerance)
        existing = grouped.get(key)
        if existing is None or _authoritative_polygon_score(polygon, source) > _authoritative_polygon_score(*existing):
            grouped[key] = (polygon, source)
    return list(grouped.values())


def _discard_container_polygons(
    candidates: list[tuple[Polygon, NormalizedEntity | None]],
    labels: list[TextLabel],
    tolerance: float,
) -> list[tuple[Polygon, NormalizedEntity | None]]:
    filtered: list[tuple[Polygon, NormalizedEntity | None]] = []
    for polygon, source in candidates:
        contained_rooms = [
            other
            for other, _ in candidates
            if other is not polygon
            and polygon.contains(other.representative_point())
            and other.area < polygon.area * 0.85
        ]
        # A floor plate/sheet border contains many room labels and smaller room loops.
        # It is useful as context, but it must never become a quote segment.
        if len(contained_rooms) >= 2 and _room_label_count(polygon, labels, tolerance) >= 2:
            continue
        filtered.append((polygon, source))
    return filtered


def _closed_entity_room_candidates(
    floor_entities: list[NormalizedEntity],
    labels: list[TextLabel],
    bounds: tuple[float, float, float, float],
    metre_factor: float,
    config: DxfExtractionConfig,
) -> list[tuple[Polygon, NormalizedEntity | None]]:
    floor_area = max(_bounds_area(bounds), 1)
    drawing_span = max(bounds[2] - bounds[0], bounds[3] - bounds[1], 1)
    floor_box = box(*bounds)
    candidates: list[tuple[Polygon, NormalizedEntity | None]] = []
    for entity in floor_entities:
        if not isinstance(entity.geometry, Polygon):
            continue
        classification = _classify_entity(entity)
        # Closed symbols, doors, stairs, furniture, and dimensions are common DXF loops.
        # They look polygonal but are not usable rooms.
        if classification in {"dimension", "furniture", "door", "window", "stairs", "annotation"}:
            continue
        polygon = entity.geometry
        if not polygon.is_valid or polygon.area <= 0:
            continue
        if polygon.intersection(floor_box).area / max(polygon.area, 0.000001) < 0.9:
            continue
        if not _polygon_is_usable_space_shape(polygon, metre_factor, config):
            continue
        label_tolerance = min(
            max(config.snap_tolerance_m, config.label_match_distance_m / max(metre_factor, 0.000001)),
            drawing_span * 0.08,
        )
        label_count = _room_label_count(polygon, labels, label_tolerance)
        # Large closed loops are usually floor plates, tile boundaries, or exterior envelopes.
        # Keep them only if there is a single label and no better evidence later.
        if _bounds_area(polygon.bounds) / floor_area > 0.45 and label_count != 1 and labels:
            continue
        candidates.append((polygon, entity))
    return candidates


def _printed_area_for(label: TextLabel, labels: list[TextLabel], drawing_span: float) -> float | None:
    room = extract_room_dimension(label.text)
    if room:
        return round(room[1] * room[2], 2)
    label_point = (float(label.point.x), float(label.point.y))
    candidates = []
    for dimension_label in labels:
        printed_area = extract_printed_area(dimension_label.text)
        if printed_area:
            dimension_point = (float(dimension_label.point.x), float(dimension_label.point.y))
            dx = abs(dimension_point[0] - label_point[0])
            dy = abs(dimension_point[1] - label_point[1])
            if dx <= drawing_span * 0.1 and dy <= drawing_span * 0.08:
                candidates.append((dx + dy * 1.5, None, printed_area))
        dimensions = extract_dimension_only(dimension_label.text)
        if not dimensions:
            continue
        dimension_point = (float(dimension_label.point.x), float(dimension_label.point.y))
        dx = abs(dimension_point[0] - label_point[0])
        dy = abs(dimension_point[1] - label_point[1])
        if dx <= drawing_span * 0.1 and dy <= drawing_span * 0.08:
            candidates.append((dx + dy * 1.5, dimensions, None))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0])
    _, dimensions, printed_area = candidates[0]
    if printed_area is not None:
        return round(printed_area, 2)
    length, width = dimensions
    return round(length * width, 2)


def _confidence(label: TextLabel | None, polygon: Polygon, printed_area: float | None, area_sqm: float, inferred: bool, door_validated: bool = False) -> float:
    """Calculate confidence score for detected space.
    
    Base: 42
    Label present: +25
    Label inside polygon: +15
    Dimensions match: +20
    Door validation confirms: +15
    Inferred boundary: -12
    Void area: -10
    
    Final range: 35-98
    """
    score = 42.0
    if label:
        score += 25
    if label and polygon.contains(label.point):
        score += 15
    if printed_area:
        relative_error = abs(area_sqm - printed_area) / max(printed_area, 0.01)
        score += max(0, 20 - relative_error * 40)
    if door_validated:
        score += 15  # Doors confirm interior space
    if inferred:
        score -= 12
    if canonical_name(label.text if label else "") in {"void area"}:
        score -= 10
    return round(max(35, min(98, score)), 0)


def _minimum_area_for_named_room(name: str) -> float:
    """Reject tiny CAD detail faces that happen to contain a room label."""
    if canonical_name(name) in {
        "bedroom",
        "dining room",
        "dining rom",
        "foyer",
        "living",
        "living room",
        "lobby",
        "kitchen",
        "car garage",
        "garage",
        "family room",
        "fam. room",
        "study",
        "bathroom",
        "wc",
    }:
        return 4.0
    return 1.0


def _dimension_fallback_polygon(
    label: TextLabel,
    labels: list[TextLabel],
    bounds: tuple[float, float, float, float],
    drawing_span: float,
    metre_factor: float,
) -> Polygon | None:
    room = extract_room_dimension(label.text)
    if room:
        length, width = room[1], room[2]
    else:
        label_name = space_label_name(label.text)
        if canonical_name(label_name or "") in {"corridor", "hallway", "lobby", "entrance", "void area"}:
            return None
        dimensions = _printed_area_dimensions_for(label, labels, drawing_span)
        if dimensions:
            length, width = dimensions
        else:
            printed_area = _printed_area_for(label, labels, drawing_span)
            if not printed_area:
                return None
            length = math.sqrt(printed_area * 1.25)
            width = printed_area / length
    if length <= 0 or width <= 0:
        return None

    # Printed room dimensions are expressed in metres. Polygon coordinates must use the
    # drawing's native unit system, which is often millimetres for architectural DXFs.
    length /= max(metre_factor, 0.000001)
    width /= max(metre_factor, 0.000001)

    x = float(label.point.x)
    y = float(label.point.y)
    candidates = [
        box(x - length / 2, y - width / 2, x + length / 2, y + width / 2),
        box(x - width / 2, y - length / 2, x + width / 2, y + length / 2),
    ]
    min_x, min_y, max_x, max_y = bounds
    fitted = []
    for candidate in candidates:
        candidate_min_x, candidate_min_y, candidate_max_x, candidate_max_y = candidate.bounds
        dx = max(min_x - candidate_min_x, 0) - max(candidate_max_x - max_x, 0)
        dy = max(min_y - candidate_min_y, 0) - max(candidate_max_y - max_y, 0)
        fitted.append(translate(candidate, xoff=dx, yoff=dy))
    candidates = fitted
    candidates = [candidate for candidate in candidates if isinstance(candidate, Polygon) and candidate.is_valid and candidate.area > 0]
    if not candidates:
        return None
    candidates.sort(key=lambda polygon: (not polygon.contains(label.point), -polygon.area))
    return candidates[0]


def _printed_area_dimensions_for(label: TextLabel, labels: list[TextLabel], drawing_span: float) -> tuple[float, float] | None:
    label_point = (float(label.point.x), float(label.point.y))
    candidates = []
    for dimension_label in labels:
        dimensions = extract_dimension_only(dimension_label.text)
        if not dimensions:
            continue
        dimension_point = (float(dimension_label.point.x), float(dimension_label.point.y))
        dx = abs(dimension_point[0] - label_point[0])
        dy = abs(dimension_point[1] - label_point[1])
        if dx <= drawing_span * 0.1 and dy <= drawing_span * 0.08:
            candidates.append((dx + dy * 1.5, dimensions))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0])
    return candidates[0][1]


def _candidate_spaces_for_floor(
    floor_entities: list[NormalizedEntity],
    floor_labels: list[TextLabel],
    bounds: tuple[float, float, float, float],
    metre_factor: float,
    config: DxfExtractionConfig,
    diagnostics: DxfDiagnostics,
) -> list[CandidateSpace]:
    """Multi-pass space detection:
    
    Pass 1: Hatch fills (95%+ confidence)
    Pass 2: Closed linework with labels (high confidence)
    Pass 3: Dimension fallback (medium confidence)
    Pass 4: Linework-only (lower confidence)
    
    Each pass deduplicates against previous findings.
    """
    drawing_span = max(bounds[2] - bounds[0], bounds[3] - bounds[1], 1)
    floor_area = max(_bounds_area(bounds), 1)
    floor_box = box(*bounds)
    labels = [label for label in floor_labels if _is_candidate_room_text(label)]
    
    # Extract doors for validation
    doors = _extract_doors(floor_entities) if config.enable_door_validation else []
    
    spaces: list[CandidateSpace] = []
    used_keys: set[tuple[tuple[float, float], ...]] = set()
    used_labels: set[str] = set()

    def polygon_key(polygon: Polygon) -> tuple[tuple[float, float], ...]:
        return tuple(sorted((round(float(x), 4), round(float(y), 4)) for x, y in list(polygon.exterior.coords)[:-1]))
    
    # ===== PASS 1: HATCH CANDIDATES (95%+ confidence) =====
    hatch_candidates = _extract_hatch_candidates(floor_entities, bounds, metre_factor, config, diagnostics)
    for polygon, hatch_entity, hatch_confidence in hatch_candidates:
        key = polygon_key(polygon)
        if key in used_keys:
            continue
        
        # Check if hatch has label inside it
        containing_labels = [label for label in labels if polygon.contains(_label_point(label)) or polygon.touches(_label_point(label))]
        
        if containing_labels:
            # High confidence: labeled hatch
            label = containing_labels[0]
            name = space_label_name(label.text) or label.text.strip() or f"Space {len(spaces) + 1}"
            area_sqm = round(polygon.area * metre_factor * metre_factor, 2)
            
            # Door validation boost
            door_valid, door_count = _validate_space_with_doors(polygon, doors)
            confidence = _space_confidence_from_door_validation(door_count, hatch_confidence + 10)
            
            spaces.append(CandidateSpace(polygon, label, name, canonical_name(name), confidence, False, (label.handle,), ()))
            used_keys.add(key)
            used_labels.add(label.handle)
            diagnostics.door_validated_spaces += 1 if door_count > 0 else 0
        else:
            # Unlabeled hatch - still high confidence
            area_sqm = round(polygon.area * metre_factor * metre_factor, 2)
            symbol_evidence = _symbol_evidence_for_polygon(polygon, floor_entities, floor_labels, drawing_span)
            name = _name_from_symbol_evidence(symbol_evidence, "Unlabeled Space")
            
            # Door validation
            door_valid, door_count = _validate_space_with_doors(polygon, doors)
            if door_valid or area_sqm >= 3.0:  # Accept if has doors or is reasonable size
                confidence = _space_confidence_from_door_validation(door_count, hatch_confidence)
                confidence = _confidence_from_symbol_evidence(confidence, symbol_evidence)
                warnings = ["Hatch fill detected - no text label."]
                if symbol_evidence:
                    warnings.append(f"Symbol evidence: {', '.join(symbol_evidence)}.")
                spaces.append(CandidateSpace(polygon, None, name, canonical_name(name), confidence, True, (), tuple(warnings)))
                used_keys.add(key)
                diagnostics.door_validated_spaces += 1 if door_count > 0 else 0
    
    # ===== PASS 2: LINEWORK + LABELS (original method) =====
    min_area = config.min_space_area_sqm / max(metre_factor * metre_factor, 0.000001)
    linework = _iter_linework(floor_entities)
    diagnostics.candidate_wall_entities += len(linework)
    closed_linework = _close_linework_gaps(linework, drawing_span, metre_factor, config, diagnostics)
    native_label_distance = config.label_match_distance_m / max(metre_factor, 0.000001)
    native_snap_tolerance = config.snap_tolerance_m / max(metre_factor, 0.000001)
    try:
        line_graph = unary_union(closed_linework)
        snapped_graph = snap(line_graph, line_graph, 0.15 / max(metre_factor, 0.000001))
        polygons = [polygon for polygon in polygonize(snapped_graph) if polygon.is_valid and polygon.area > 0]
    except Exception:
        diagnostics.warnings.append("polygonize_failed")
        polygons = []

    floor_area = max(_bounds_area(bounds), 1)
    floor_box = box(*bounds)
    wall_entities = [entity for entity in floor_entities if "wall" in entity.layer.lower()]
    outer_wall_entities = [entity for entity in wall_entities if "outer" in entity.layer.lower()]
    if outer_wall_entities:
        outer_bounds = unary_union([entity.geometry for entity in outer_wall_entities]).bounds
        fallback_bounds = tuple(float(value) for value in outer_bounds)
    elif wall_entities:
        wall_bounds = unary_union([entity.geometry for entity in wall_entities]).bounds
        fallback_bounds = tuple(float(value) for value in wall_bounds)
    else:
        fallback_bounds = bounds
    labels = [label for label in floor_labels if is_room_name_label(label.text)]
    min_area = config.min_space_area_sqm / max(metre_factor * metre_factor, 0.000001)
    candidate_polygons = [
        (polygon, None)
        for polygon in polygons
        if polygon.area >= min_area
        and _polygon_is_usable_space_shape(polygon, metre_factor, config)
        and (
            _bounds_area(polygon.bounds) / floor_area <= 0.45
            or any(polygon.contains(label.point) or polygon.touches(label.point) for label in labels)
        )
        and polygon.intersection(floor_box).area / max(polygon.area, 0.000001) >= 0.9
    ]
    candidate_polygons.extend(_closed_entity_room_candidates(floor_entities, labels, bounds, metre_factor, config))
    candidate_polygons = _dedupe_polygons(candidate_polygons, max(config.snap_tolerance_m, drawing_span * 0.0005))
    candidate_polygons = _discard_container_polygons(candidate_polygons, labels, max(config.snap_tolerance_m, drawing_span * 0.0005))
    diagnostics.candidate_spaces += len(candidate_polygons)

    # Add labeled candidates from linework (skipping already-found from hatches)
    for label in labels:
        if label.handle in used_labels:
            continue
        
        name = space_label_name(label.text) or (extract_room_dimension(label.text) or (label.text.strip() or "Unclassified Space", 0, 0))[0]
        canonical = canonical_name(name)
        printed_area = _printed_area_for(label, floor_labels, drawing_span)
        label_point = _label_point(label)
        
        # Label matching
        candidates = [polygon for polygon, _ in candidate_polygons if polygon.contains(label_point) or polygon.touches(label_point)]
        if not candidates:
            candidates = [polygon for polygon, _ in candidate_polygons if polygon.distance(label.point) <= native_label_distance]
        if not candidates and printed_area:
            candidates = [
                polygon
                for polygon, _ in candidate_polygons
                if polygon.distance(label.point) <= max(native_label_distance, drawing_span * 0.2)
            ]
        
        if printed_area:
            area_limit = min(max(floor_area * 0.18, 90 / max(metre_factor * metre_factor, 0.000001)), 120 / max(metre_factor * metre_factor, 0.000001))
            if canonical in {"corridor", "hallway", "lobby", "entrance"}:
                area_limit = min(max(floor_area * 0.16, 30 / max(metre_factor * metre_factor, 0.000001)), 180 / max(metre_factor * metre_factor, 0.000001))
            fitted_candidates = [
                polygon
                for polygon in candidates
                if polygon.area * metre_factor * metre_factor <= max(printed_area * 3.5, printed_area + 12, 30)
            ]
            if fitted_candidates:
                candidates = fitted_candidates
            else:
                candidates = [polygon for polygon in candidates if polygon.area <= area_limit]
        else:
            area_limit = min(max(floor_area * 0.18, 90 / max(metre_factor * metre_factor, 0.000001)), 120 / max(metre_factor * metre_factor, 0.000001))
            if canonical in {"corridor", "hallway", "lobby", "entrance"}:
                area_limit = min(max(floor_area * 0.16, 30 / max(metre_factor * metre_factor, 0.000001)), 180 / max(metre_factor * metre_factor, 0.000001))
            candidates = [polygon for polygon in candidates if polygon.area <= area_limit]
        
        if printed_area:
            candidates = sorted(candidates, key=lambda polygon: (abs((polygon.area * metre_factor * metre_factor) - printed_area), polygon.distance(label.point), polygon.area))
            if candidates:
                closest_area = candidates[0].area * metre_factor * metre_factor
                if abs(closest_area - printed_area) > max(printed_area * 0.75, 12):
                    candidates = []
        else:
            candidates = sorted(candidates, key=lambda polygon: (polygon.distance(label.point), polygon.area))
        used_fallback = False
        if not candidates:
            polygon = _dimension_fallback_polygon(label, floor_labels, fallback_bounds, drawing_span, metre_factor)
            if polygon is None:
                diagnostics.unmatched_labels += 1
                continue
            used_fallback = True
        else:
            polygon = candidates[0]
        
        key = polygon_key(polygon)
        if key in used_keys:
            continue
        
        area_sqm = round(polygon.area * metre_factor * metre_factor, 2)
        if area_sqm <= 0:
            diagnostics.warnings.append("zero_area_segment_rejected")
            continue
        if not used_fallback and area_sqm < _minimum_area_for_named_room(name):
            # Leave the label unmatched so the shared-shell pass can find the
            # actual room/open-plan shell instead of accepting furniture detail.
            continue
        inferred = used_fallback or not polygon.contains(label.point)
        confidence = _confidence(label, polygon, printed_area, area_sqm, inferred=inferred)
        if used_fallback:
            confidence = min(confidence, 60)
        warnings = ("Boundary estimated from the printed area; verify against the walls.",) if used_fallback else ()
        spaces.append(CandidateSpace(polygon, label, name, canonical_name(name), confidence, inferred, (label.handle,), warnings, printed_area if used_fallback else None))
        used_keys.add(key)
        used_labels.add(label.handle)
        _, door_count = _validate_space_with_doors(polygon, doors)
        diagnostics.door_validated_spaces += 1 if door_count > 0 else 0

    fallback_indexes = [index for index, space in enumerate(spaces) if space.reported_area_sqm is not None and space.label is not None]
    if len(fallback_indexes) >= 2:
        fallback_points = [spaces[index].label.point for index in fallback_indexes]
        shared_shells = [polygon for polygon in polygons if all(polygon.covers(point) for point in fallback_points)]
        if shared_shells:
            shared_shell = min(shared_shells, key=lambda polygon: polygon.area)
            detected = [space.polygon for index, space in enumerate(spaces) if index not in fallback_indexes]
            partitions = _axis_aligned_label_partitions(
                tuple(float(value) for value in shared_shell.bounds),
                [(index, spaces[index].label.point) for index in fallback_indexes],
                detected,
            )
            for index in fallback_indexes:
                space = spaces[index]
                piece = partitions.get(index)
                if piece is None or piece.area <= 0:
                    continue
                warning = "Open area partition estimated from nearby room labels; verify the boundary."
                spaces[index] = replace(space, polygon=piece, warnings=(warning,))

    unmatched = [label for label in labels if label.handle not in used_labels]
    shared_groups: dict[tuple[tuple[float, float], ...], tuple[Polygon, list[TextLabel]]] = {}
    for label in unmatched:
        label_name = space_label_name(label.text) or "Unclassified Space"
        containing = [
            polygon
            for polygon in polygons
            if polygon.covers(label.point)
            and _minimum_area_for_named_room(label_name) <= polygon.area * metre_factor * metre_factor <= 200
        ]
        if not containing:
            diagnostics.unmatched_labels += 1
            continue
        shell = min(containing, key=lambda polygon: polygon.area)
        key = polygon_key(shell)
        if key not in shared_groups:
            shared_groups[key] = (shell, [])
        shared_groups[key][1].append(label)

    for shell, group_labels in shared_groups.values():
        if len(group_labels) == 1:
            label = group_labels[0]
            key = polygon_key(shell)
            if key in used_keys:
                continue
            name = space_label_name(label.text) or "Unclassified Space"
            spaces.append(CandidateSpace(shell, label, name, canonical_name(name), 72, False, (label.handle,), ()))
            used_keys.add(key)
            used_labels.add(label.handle)
            continue

        partitions = _axis_aligned_label_partitions(
            tuple(float(value) for value in shell.bounds),
            list(enumerate([label.point for label in group_labels])),
            [],
        )
        for index, label in enumerate(group_labels):
            piece = partitions.get(index)
            if piece is None or piece.area <= 0:
                continue
            name = space_label_name(label.text) or "Unclassified Space"
            area_sqm = round(piece.area * metre_factor * metre_factor, 2)
            warning = "Room label found inside a shared floor shell; verify the area and boundary."
            spaces.append(CandidateSpace(piece, label, name, canonical_name(name), 60, True, (label.handle,), (warning,), area_sqm))
            used_labels.add(label.handle)

    # Architectural drawings frequently leave door openings in otherwise clear
    # room walls. Keep every recognized room visible for review when those gaps
    # prevent polygonization, but mark the resulting partition as estimated.
    remaining_labels = [label for label in labels if label.handle not in used_labels]
    if remaining_labels:
        partitions = _axis_aligned_label_partitions(
            fallback_bounds,
            list(enumerate([label.point for label in remaining_labels])),
            [space.polygon for space in spaces],
        )
        for index, label in enumerate(remaining_labels):
            piece = partitions.get(index)
            if piece is None or piece.area <= 0:
                continue
            name = space_label_name(label.text) or "Unclassified Space"
            area_sqm = round(piece.area * metre_factor * metre_factor, 2)
            if area_sqm <= 0:
                continue
            if canonical_name(name) in {"bathroom", "wc"} and _printed_area_for(label, floor_labels, drawing_span) is None:
                area_sqm = 6.0
            warning = "Room walls are not closed in the DXF; verify the estimated boundary."
            spaces.append(CandidateSpace(piece, label, name, canonical_name(name), 55, True, (label.handle,), (warning,), area_sqm))
            used_labels.add(label.handle)

    labeled_union = unary_union([space.polygon for space in spaces]) if spaces else None
    # When named rooms exist, unmatched CAD faces are usually furniture, wall
    # cavities, or annotation boxes rather than additional rooms.
    unclassified_candidates = candidate_polygons if not labels else []
    min_area_threshold = 0.8
    for polygon, _ in unclassified_candidates:
        key = polygon_key(polygon)
        if key in used_keys:
            continue
        if any(polygon.distance(space.polygon) <= native_snap_tolerance and polygon.area < space.polygon.area * 0.12 for space in spaces):
            continue
        max_room_area = min(max(floor_area * 0.18, 90 / max(metre_factor * metre_factor, 0.000001)), 120 / max(metre_factor * metre_factor, 0.000001))
        if polygon.area > max_room_area:
            continue
        
        area_sqm = round(polygon.area * metre_factor * metre_factor, 2)
        if area_sqm <= 0 or area_sqm < max(config.min_space_area_sqm * min_area_threshold, 0.5):
            continue
        
        # Less aggressive overlap check: only skip if mostly overlapped with labeled spaces
        if labeled_union is not None and polygon.intersection(labeled_union).area / max(polygon.area, 0.000001) > 0.6:
            continue
        
        symbol_evidence = _symbol_evidence_for_polygon(polygon, floor_entities, floor_labels, drawing_span)
        name = _name_from_symbol_evidence(symbol_evidence, "Unclassified Space")
        
        # Higher confidence if doors validated
        door_valid, door_count = _validate_space_with_doors(polygon, doors)
        if door_valid:
            base_confidence = 65.0 + (door_count * 5)  # 65% base + 5% per door
            base_confidence = min(base_confidence, 85.0)
        else:
            base_confidence = 50.0
        
        confidence = _space_confidence_from_door_validation(door_count, base_confidence)
        confidence = _confidence_from_symbol_evidence(confidence, symbol_evidence)
        
        warnings = ["No room label found."]
        if symbol_evidence:
            warnings.append(f"Symbol evidence: {', '.join(symbol_evidence)}.")
        spaces.append(CandidateSpace(polygon, None, name, canonical_name(name), confidence, True, (), tuple(warnings)))
        diagnostics.unclassified_spaces += 1
        used_keys.add(key)
        diagnostics.door_validated_spaces += 1 if door_count > 0 else 0

    diagnostics.segments_before_filtering += len(spaces)
    return spaces


def _screen_transform(bounds: tuple[float, float, float, float], width: int, height: int, padding: int):
    min_x, min_y, max_x, max_y = bounds
    scale = min((width - 2 * padding) / max(max_x - min_x, 1), (height - 2 * padding) / max(max_y - min_y, 1))

    def screen(point: tuple[float, float]) -> tuple[float, float]:
        x, y = point
        return (round(padding + (x - min_x) * scale, 2), round(height - padding - (y - min_y) * scale, 2))

    return screen


def _legend_for_segments(segments: list[ExtractedSegment]) -> list[BlueprintLegendItem]:
    totals: dict[str, tuple[str, float, float]] = {}
    for segment in segments:
        if not segment.category or not segment.color_hex or segment.alpha is None:
            continue
        color_hex, alpha, area = totals.get(segment.category, (segment.color_hex, segment.alpha, 0.0))
        totals[segment.category] = (color_hex, alpha, area + segment.area_sqm)
    return [
        BlueprintLegendItem(category=category, color_hex=color_hex, alpha=alpha, total_area_sqm=round(area, 2))
        for category, (color_hex, alpha, area) in totals.items()
    ]


def _confidence_buckets_for_segments(segments: list[ExtractedSegment]) -> BlueprintConfidenceBuckets:
    return BlueprintConfidenceBuckets(
        high_confidence=[segment for segment in segments if segment.confidence_score is not None and segment.confidence_score >= 85],
        medium_confidence=[segment for segment in segments if segment.confidence_score is not None and 60 <= segment.confidence_score < 85],
        low_confidence=[segment for segment in segments if segment.confidence_score is not None and segment.confidence_score < 60],
        uncertain=[segment for segment in segments if segment.confidence_score is None],
    )


def _render_svg(
    entities: list[NormalizedEntity],
    labels: list[TextLabel],
    segments: list[ExtractedSegment],
    bounds: tuple[float, float, float, float],
    width: int,
    height: int,
    padding: int,
) -> str:
    screen = _screen_transform(bounds, width, height, padding)
    svg_paths: list[str] = []
    for entity in entities:
        geometry = entity.geometry
        if isinstance(geometry, LineString):
            coords = [screen((float(x), float(y))) for x, y in geometry.coords]
            if len(coords) >= 2:
                svg_paths.append(f'<polyline points="{" ".join(f"{x},{y}" for x, y in coords)}" stroke="#111827" stroke-width="1.15" fill="none"/>')
        elif isinstance(geometry, Polygon):
            coords = [screen((float(x), float(y))) for x, y in list(geometry.exterior.coords)[:-1]]
            svg_paths.append(f'<polygon points="{" ".join(f"{x},{y}" for x, y in coords)}" stroke="#111827" stroke-width="1.2" fill="none"/>')
    for label in labels:
        x, y = screen((float(label.point.x), float(label.point.y)))
        svg_paths.append(f'<text x="{x}" y="{y}" fill="#2563eb" font-size="12">{html.escape(label.text[:80])}</text>')
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
        f'<defs><clipPath id="floor-region-clip"><rect x="0" y="0" width="{width}" height="{height}"/></clipPath></defs>'
        f'<rect width="100%" height="100%" fill="white"/><g clip-path="url(#floor-region-clip)">{"".join(svg_paths)}</g></svg>'
    )


def _to_segment(
    space: CandidateSpace,
    bounds: tuple[float, float, float, float],
    width: int,
    height: int,
    padding: int,
    metre_factor: float,
    unlabeled_id: int,
    segment_index: int,
    floor_id: int,
) -> ExtractedSegment:
    screen = _screen_transform(bounds, width, height, padding)
    coords = [screen((float(x), float(y))) for x, y in list(space.polygon.exterior.coords)[:-1]]
    name = space.name
    symbol_inferred = any(warning.startswith("Symbol evidence:") for warning in space.warnings)
    labeled = space.label is not None or symbol_inferred
    if not labeled and canonical_name(name) in {"unclassified space", "unlabeled space", "unlabeled"}:
        name = f"UNLABELED_SPACE_{unlabeled_id}"
    category, color_hex, alpha = _category_for_space(name, space.polygon, labeled)
    normalized = _normalize_label_with_gemini(name, category, color_hex) if labeled else None
    if normalized:
        name = normalized.standardized_name
        category = normalized.category
        color_hex = normalized.color_hex
    overlay = RoomOverlay(category=category, color_hex=color_hex, alpha=alpha, rgba=_hex_to_rgba(color_hex, alpha))
    return ExtractedSegment(
        segment_name=space.name[:150],
        area_sqm=space.reported_area_sqm or round(space.polygon.area * metre_factor * metre_factor, 2),
        polygon_coords=coords,
        confidence_score=space.confidence,
        geometry_flagged=bool(space.warnings),
        geometry_warnings=list(space.warnings),
        boundary_estimated=space.reported_area_sqm is not None,
    )


def debug_dxf_blueprint(path: str | Path) -> dict[str, object]:
    import ezdxf

    document = ezdxf.readfile(path)
    modelspace = document.modelspace()
    diagnostics = DxfDiagnostics()
    config = DxfExtractionConfig()
    entities, labels = parse_layout(modelspace, "Model", config, diagnostics)
    drawing_bounds = _all_bounds(entities, labels) if entities or labels else (0, 0, 0, 0)
    candidate_polygons = [
        entity
        for entity in entities
        if isinstance(entity.geometry, Polygon)
        and _classify_entity(entity) not in {"dimension", "furniture", "door", "window", "stairs", "annotation"}
    ]
    return {
        "layers": [layer.dxf.name for layer in document.layers],
        "modelspace_entity_counts": dict(Counter(entity.dxftype() for entity in modelspace)),
        "expanded_entity_counts": diagnostics.entities_by_type,
        "expanded_block_entities": diagnostics.expanded_block_entities,
        "entities_by_layer": diagnostics.entities_by_layer,
        "labels": len(labels),
        "drawing_bounds": drawing_bounds,
        "closed_polygon_candidates": [
            {
                "handle": entity.handle,
                "type": entity.entity_type,
                "layer": entity.layer,
                "block": entity.block_name,
                "bounds": entity.geometry.bounds,
                "area": entity.geometry.area,
            }
            for entity in sorted(candidate_polygons, key=lambda item: item.geometry.area, reverse=True)[:50]
        ],
    }


def extract_dxf_blueprint(content: bytes, config: DxfExtractionConfig | None = None) -> BlueprintExtractionResult:
    import ezdxf

    started = time.perf_counter()
    config = config or DxfExtractionConfig()
    diagnostics = DxfDiagnostics()
    # Some third-party exporters emit LWPOLYLINE records without the required DXF
    # subclass markers. ezdxf cannot recover those records itself. Add only the missing
    # markers, leaving valid entities untouched, so imperfect ASCII DXFs remain readable.
    text = content.decode("utf-8", errors="replace")
    newline = "\r\n" if "\r\n" in text else "\n"
    if "$ACADVER" not in text and f"2{newline}HEADER{newline}" in text:
        text = text.replace(
            f"2{newline}HEADER{newline}",
            f"2{newline}HEADER{newline}9{newline}$ACADVER{newline}1{newline}AC1015{newline}",
            1,
        )

    def repair_lwpolyline(match: re.Match[str]) -> str:
        entity = match.group(0)
        if "AcDbPolyline" in entity:
            return entity
        marker = f"0{newline}LWPOLYLINE{newline}"
        remainder = entity[len(marker):]
        layer_match = re.match(rf"8{re.escape(newline)}[^\r\n]+{re.escape(newline)}", remainder)
        entity_subclass = f"100{newline}AcDbEntity{newline}"
        polyline_subclass = f"100{newline}AcDbPolyline{newline}"
        if layer_match:
            layer_pair = layer_match.group(0)
            return marker + entity_subclass + layer_pair + polyline_subclass + remainder[len(layer_pair):]
        return marker + entity_subclass + polyline_subclass + remainder

    repaired = re.sub(
        rf"0{re.escape(newline)}LWPOLYLINE{re.escape(newline)}.*?(?=0{re.escape(newline)}(?:[A-Z_]+){re.escape(newline)}|\Z)",
        repair_lwpolyline,
        text,
        flags=re.DOTALL,
    ).encode("utf-8")

    with tempfile.NamedTemporaryFile(suffix=".dxf", delete=False) as temp:
        temp.write(content)
        temp_path = Path(temp.name)
    try:
        try:
            # Preserve the DXF's declared code page. Re-encoding every drawing as
            # UTF-8 corrupts accented room labels in otherwise valid files.
            document = ezdxf.readfile(temp_path)
        except Exception:
            temp_path.write_bytes(repaired)
            document = ezdxf.readfile(temp_path)
    finally:
        temp_path.unlink(missing_ok=True)

    entities, labels = parse_layout(document.modelspace(), "Model", config, diagnostics)
    if not entities and not labels:
        raise ValueError("No readable drawing geometry was found in this DXF.")

    drawing_bounds = _all_bounds(entities, labels)
    metre_factor, units_name, unit_confidence, unit_warnings = infer_unit_factor(int(document.header.get("$INSUNITS", 0)), drawing_bounds, labels)
    diagnostics.warnings.extend(unit_warnings)
    dbscan_regions = _dbscan_floor_regions_from_wall_midpoints(entities, labels, drawing_bounds, metre_factor)
    grid_regions = _floor_regions_from_sheet_grid(entities, labels, drawing_bounds)
    label_regions = _floor_regions_from_labels(labels, drawing_bounds)
    geometry_regions = _floor_regions_from_geometry(entities, labels, drawing_bounds)
    cluster_regions = _floor_regions_from_space_label_clusters(labels, drawing_bounds)
    proposal_label_regions = [region for region in label_regions if "proposal" in region.name.lower()]
    if len(proposal_label_regions) >= 2:
        regions = proposal_label_regions
    elif len(dbscan_regions) >= 2:
        regions = dbscan_regions
    elif len(grid_regions) >= 2:
        regions = grid_regions
    elif len(label_regions) > 1:
        regions = label_regions
    elif cluster_regions and len(cluster_regions) >= len(geometry_regions):
        regions = cluster_regions
    else:
        regions = geometry_regions or label_regions
    if not dbscan_regions and not grid_regions:
        regions = _split_regions_by_internal_label_gaps(regions, labels)
    
    # CRITICAL FIX: Calculate output dimensions based on visible_bounds aspect ratio
    # This prevents room distortion when blueprint aspect ratio doesn't match hardcoded 1400x900
    # CRITICAL: NO PADDING - visible_bounds has no padding, so _screen_transform must also use 0
    padding = 0

    floors: list[BlueprintFloor] = []
    floor_region_bounds: list[tuple[float, float, float, float]] = []
    all_segment_polygons: list[Polygon] = []
    for floor_id, region in enumerate(regions, start=1):
        region_bounds = _expanded(region.bounds, max(drawing_bounds[2] - drawing_bounds[0], drawing_bounds[3] - drawing_bounds[1]) * 0.015)
        
        # First pass: get all entities in region using geometry intersection
        floor_entities_raw = [
            entity for entity in entities 
            if _bounds_intersect(region_bounds, entity.geometry.bounds)
        ]
        
        # Filter out only annotation entity types (dimension lines, dimension text, leaders)
        # Keep everything else including borders/frames (LWPOLYLINE, POLYLINE, HATCH, etc.)
        non_architectural_types = {"DIMENSION", "MTEXT", "LEADER", "MULTILEADER"}
        floor_entities = [
            entity for entity in floor_entities_raw
            if entity.entity_type not in non_architectural_types
        ]
        
        # If filtering removed everything, keep original (fallback for edge cases)
        if not floor_entities:
            floor_entities = floor_entities_raw
        
        floor_labels = [label for label in labels if _contains_point(region_bounds, (float(label.point.x), float(label.point.y)))]
        
        # Calculate visible_bounds from architectural entities and labels
        entity_bounds = [entity.geometry.bounds for entity in floor_entities if not entity.geometry.is_empty]
        label_bounds = [(label.point.x, label.point.y, label.point.x, label.point.y) for label in floor_labels]
        
        if entity_bounds or label_bounds:
            visible_bounds = _union_bounds(entity_bounds + label_bounds)
            # Add MODEST padding (2%) to show borders/frame and some white space around blueprint
            # This is much less than the old 40px but enough to see the frame
            padding_pct = max(visible_bounds[2] - visible_bounds[0], visible_bounds[3] - visible_bounds[1]) * 0.02
            visible_bounds = (
                visible_bounds[0] - padding_pct,
                visible_bounds[1] - padding_pct,
                visible_bounds[2] + padding_pct,
                visible_bounds[3] + padding_pct,
            )
        else:
            visible_bounds = region_bounds
        
        # Calculate image dimensions preserving aspect ratio to prevent room distortion
        bounds_width = visible_bounds[2] - visible_bounds[0]
        bounds_height = visible_bounds[3] - visible_bounds[1]
        aspect_ratio = max(bounds_width, 1) / max(bounds_height, 1)
        
        # Maintain quality while preserving aspect ratio
        max_dimension = 1400
        if aspect_ratio > 1.6:  # Very wide (e.g., landscape)
            width = max_dimension
            height = int(max_dimension / aspect_ratio)
        elif aspect_ratio < 0.6:  # Very tall
            height = 900
            width = int(900 * aspect_ratio)
        else:  # Normal aspect ratio
            width = 1400
            height = int(1400 / aspect_ratio) if aspect_ratio > 0 else 900
        # Calculate image dimensions preserving aspect ratio to prevent room distortion
        bounds_width = visible_bounds[2] - visible_bounds[0]
        bounds_height = visible_bounds[3] - visible_bounds[1]
        aspect_ratio = max(bounds_width, 1) / max(bounds_height, 1)
        
        # Maintain quality while preserving aspect ratio
        max_dimension = 1400
        if aspect_ratio > 1.6:  # Very wide (e.g., landscape)
            width = max_dimension
            height = int(max_dimension / aspect_ratio)
        elif aspect_ratio < 0.6:  # Very tall
            height = 900
            width = int(900 * aspect_ratio)
        else:  # Normal aspect ratio
            width = 1400
            height = int(1400 / aspect_ratio) if aspect_ratio > 0 else 900
        
        # Clamp to reasonable minimums
        width = max(width, 600)
        height = max(height, 400)
        
        spaces = _candidate_spaces_for_floor(floor_entities, floor_labels, visible_bounds, metre_factor, config, diagnostics)
        segments: list[ExtractedSegment] = []
        unlabeled_id = 1
        for space in spaces:
            if not space.polygon.is_valid or space.polygon.area <= 0:
                continue
            segment = _to_segment(space, visible_bounds, width, height, padding, metre_factor, unlabeled_id, len(segments) + 1, floor_id)
            if segment.segment_name.startswith("UNLABELED_SPACE_"):
                unlabeled_id += 1
            segments.append(segment)
        diagnostics.segments_after_filtering += len(segments)
        all_segment_polygons.extend(space.polygon for space in spaces)
        legend = _legend_for_segments(segments)
        confidence_buckets = _confidence_buckets_for_segments(segments)
        svg = _render_svg(floor_entities, floor_labels, segments, visible_bounds, width, height, padding)
        image_url = f"data:image/svg+xml;charset=utf-8,{quote(svg)}"
        focus_bounds = None
        if entity_bounds:
            focus_screen = _screen_transform(visible_bounds, width, height, padding)
            min_x, min_y, max_x, max_y = _union_bounds(entity_bounds)
            screen_min_x, screen_max_y = focus_screen((min_x, min_y))
            screen_max_x, screen_min_y = focus_screen((max_x, max_y))
            focus_bounds = (
                min(screen_min_x, screen_max_x),
                min(screen_min_y, screen_max_y),
                max(screen_min_x, screen_max_x),
                max(screen_min_y, screen_max_y),
            )
        floors.append(
            BlueprintFloor(
                floor_id=floor_id,
                floor_level=region.name,
                floor_name=region.name,
                image_url=image_url,
                image_width=width,
                image_height=height,
                focus_bounds=focus_bounds,
                viewport_bbox=region.bounds,
                segments=segments,
                confidence_buckets=confidence_buckets,
                review_required=bool(
                    confidence_buckets.medium_confidence
                    or confidence_buckets.low_confidence
                    or confidence_buckets.uncertain
                ),
                legend=legend,
                visual_preview_url=image_url,
                report_page_url=image_url,
            )
        )
        floor_region_bounds.append(region.bounds)

    populated = [(floor, bounds) for floor, bounds in zip(floors, floor_region_bounds) if floor.segments]
    populated_floors = [floor for floor, _ in populated]
    if populated_floors:
        dropped = len(floors) - len(populated_floors)
        if dropped:
            diagnostics.warnings.append(f"dropped_empty_floor_regions={dropped}")
        floors = populated_floors
        floor_region_bounds = [bounds for _, bounds in populated]

    expected_area = sum(max(_bounds_area(bounds), 1) for bounds in floor_region_bounds)
    detected_area = unary_union(all_segment_polygons).area if all_segment_polygons else 0
    diagnostics.coverage_percent = round(min(100, detected_area / max(expected_area, 1) * 100), 2)
    diagnostics.warnings.append(f"units={units_name}; unit_confidence={unit_confidence}")
    diagnostics.warnings.append(f"elapsed_ms={round((time.perf_counter() - started) * 1000, 2)}")
    structured_json = {
        "floors": [
            {
                "floor_level": floor.floor_level,
                "floor_id": floor.floor_id,
                "floor_name": floor.floor_name or floor.floor_level,
                "viewport_bbox": floor.viewport_bbox,
                "rooms": [
                    {
                        "id": segment.segment_id,
                        "room_name": segment.segment_name,
                        "name": segment.segment_name,
                        "category": segment.category,
                        "area_sqm": segment.area_sqm,
                        "perimeter_m": segment.perimeter_m,
                        "color_hex": segment.color_hex,
                        "alpha": segment.alpha,
                        "confidence_score": round((segment.confidence_score or 0) / 100, 2),
                        "status": segment.status,
                        "polygon_coords": segment.polygon_coords,
                    }
                    for segment in floor.segments
                ],
                "confidence_buckets": {
                    "high_confidence": [segment.segment_id for segment in floor.confidence_buckets.high_confidence],
                    "medium_confidence": [segment.segment_id for segment in floor.confidence_buckets.medium_confidence],
                    "low_confidence": [segment.segment_id for segment in floor.confidence_buckets.low_confidence],
                    "uncertain": [segment.segment_id for segment in floor.confidence_buckets.uncertain],
                },
                "review_required": floor.review_required,
                "legend": [item.model_dump() for item in floor.legend],
            }
            for floor in floors
        ]
    }
    return BlueprintExtractionResult(floors=floors, diagnostics=diagnostics.__dict__, structured_json=structured_json, report_url=floors[0].report_page_url if floors else None)
