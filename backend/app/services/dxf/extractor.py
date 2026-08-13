import html
import math
import tempfile
import time
from pathlib import Path
from urllib.parse import quote

from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box
from shapely.ops import polygonize, unary_union

from app.schemas.blueprint import BlueprintExtractionResult, BlueprintFloor, ExtractedSegment

from .labels import (
    canonical_name,
    extract_dimension_only,
    extract_room_dimension,
    is_room_name_label,
    normalize_floor_label,
    space_label_name,
)
from .parser import parse_layout
from .schemas import CandidateSpace, DxfDiagnostics, DxfExtractionConfig, NormalizedEntity, TextLabel
from .units import infer_unit_factor


class DxfFloorRegion(tuple):
    @property
    def name(self) -> str:
        return self[0]

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        return self[1]


WALL_PATTERNS = ("wall", "a-wall", "partition", "column", "coloumn", "coloumns", "muro", "struct")
DOOR_PATTERNS = ("door", "a-door", " dr", "dr-", "swing", "puerta")
WINDOW_PATTERNS = ("window", "win")
FURNITURE_PATTERNS = ("furn", "fixture", "fixer", "equip", "furniture", "bed", "chair", "table", "sofa", "closet", "gamla")
DIMENSION_PATTERNS = ("dim", "dimension")
TEXT_PATTERNS = ("text", "anno", "room")
STAIR_PATTERNS = ("stair", "stairs")


def _matches(value: str | None, patterns: tuple[str, ...]) -> bool:
    lowered = f" {value or ''} ".lower()
    return any(pattern in lowered for pattern in patterns)


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
    space_labels = [label for label in labels if is_room_name_label(label.text) or extract_room_dimension(label.text)]
    if len(space_labels) < 12:
        return []

    span_x = max(drawing_bounds[2] - drawing_bounds[0], 1)
    span_y = max(drawing_bounds[3] - drawing_bounds[1], 1)

    def split_bands(values: list[float], low: float, high: float, span: float) -> list[tuple[float, float]]:
        unique = sorted(set(values))
        if len(unique) < 2:
            return [(low, high)]
        gaps = [(unique[index + 1] - unique[index], index) for index in range(len(unique) - 1)]
        large_gaps = [(gap, index) for gap, index in gaps if gap >= span * 0.16]
        if not large_gaps:
            return [(low, high)]
        gap, index = max(large_gaps, key=lambda item: item[0])
        split = (unique[index] + unique[index + 1]) / 2
        return [(low, split), (split, high)]

    x_bands = split_bands([float(label.point.x) for label in space_labels], drawing_bounds[0], drawing_bounds[2], span_x)
    y_bands = split_bands([float(label.point.y) for label in space_labels], drawing_bounds[1], drawing_bounds[3], span_y)
    if len(x_bands) * len(y_bands) < 2:
        return []

    regions: list[DxfFloorRegion] = []
    for y_band in sorted(y_bands, key=lambda band: -_bounds_center((0, band[0], 0, band[1]))[1]):
        for x_band in sorted(x_bands, key=lambda band: band[0]):
            contained = [
                label
                for label in space_labels
                if x_band[0] <= float(label.point.x) <= x_band[1] and y_band[0] <= float(label.point.y) <= y_band[1]
            ]
            if len(contained) < 3:
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
            and (is_room_name_label(label.text) or extract_room_dimension(label.text))
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


def _split_regions_by_internal_label_gaps(regions: list[DxfFloorRegion], labels: list[TextLabel]) -> list[DxfFloorRegion]:
    split_regions: list[DxfFloorRegion] = []
    space_labels = [label for label in labels if is_room_name_label(label.text) or extract_room_dimension(label.text)]

    for region in regions:
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
        label_name = region.name if not region.name.startswith("Floor Plan") and not region.name.endswith(" 2") else f"Floor Plan {index}"
        deduped.append(DxfFloorRegion((label_name, region.bounds)))
    return deduped


def _classify_entity(entity: NormalizedEntity) -> str:
    signal = " ".join(part for part in [entity.layer, entity.block_name, entity.entity_type] if part)
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
        if classification in {"dimension", "furniture", "door", "window"}:
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


def _close_linework_gaps(linework: list[LineString], drawing_span: float, config: DxfExtractionConfig) -> list[LineString]:
    max_gap = min(max(drawing_span * 0.014, config.door_width_min_m), config.door_width_max_m)
    alignment_tolerance = min(max(drawing_span * 0.002, config.snap_tolerance_m), 0.18)
    endpoints: list[tuple[float, float]] = []
    for line in linework:
        coords = list(line.coords)
        if len(coords) >= 2:
            endpoints.append((float(coords[0][0]), float(coords[0][1])))
            endpoints.append((float(coords[-1][0]), float(coords[-1][1])))

    candidates: list[tuple[float, tuple[float, float], tuple[float, float]]] = []
    for index, start in enumerate(endpoints):
        for end in endpoints[index + 1 :]:
            dx = abs(start[0] - end[0])
            dy = abs(start[1] - end[1])
            distance = math.hypot(dx, dy)
            if distance <= config.snap_tolerance_m or distance > max_gap:
                continue
            if min(dx, dy) > alignment_tolerance:
                continue
            candidates.append((distance, start, end))

    closed = list(linework)
    used: set[tuple[float, float]] = set()
    for _, start, end in sorted(candidates, key=lambda item: item[0]):
        if start in used or end in used:
            continue
        closed.append(LineString([start, end]))
        used.add(start)
        used.add(end)
    return closed


def _polygon_parts(geometry: object) -> list[Polygon]:
    if isinstance(geometry, Polygon):
        return [geometry]
    if isinstance(geometry, MultiPolygon):
        return list(geometry.geoms)
    return []


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


def _printed_area_for(label: TextLabel, labels: list[TextLabel], drawing_span: float) -> float | None:
    room = extract_room_dimension(label.text)
    if room:
        return round(room[1] * room[2], 2)
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
    length, width = candidates[0][1]
    return round(length * width, 2)


def _confidence(label: TextLabel | None, polygon: Polygon, printed_area: float | None, area_sqm: float, inferred: bool) -> float:
    score = 42.0
    if label:
        score += 25
    if label and polygon.contains(label.point):
        score += 15
    if printed_area:
        relative_error = abs(area_sqm - printed_area) / max(printed_area, 0.01)
        score += max(0, 20 - relative_error * 40)
    if inferred:
        score -= 12
    if canonical_name(label.text if label else "") in {"void area"}:
        score -= 10
    return round(max(35, min(98, score)), 0)


def _dimension_fallback_polygon(label: TextLabel, labels: list[TextLabel], bounds: tuple[float, float, float, float], drawing_span: float) -> Polygon | None:
    room = extract_room_dimension(label.text)
    if room:
        length, width = room[1], room[2]
    else:
        label_name = space_label_name(label.text)
        if canonical_name(label_name or "") in {"corridor", "hallway", "lobby", "entrance", "void area"}:
            return None
        dimensions = _printed_area_dimensions_for(label, labels, drawing_span)
        if not dimensions:
            return None
        length, width = dimensions
    if length <= 0 or width <= 0:
        return None

    x = float(label.point.x)
    y = float(label.point.y)
    candidates = [
        box(x - length / 2, y - width / 2, x + length / 2, y + width / 2),
        box(x - width / 2, y - length / 2, x + width / 2, y + length / 2),
    ]
    floor_box = box(*bounds)
    candidates = [candidate.intersection(floor_box) for candidate in candidates]
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
    drawing_span = max(bounds[2] - bounds[0], bounds[3] - bounds[1], 1)
    linework = _iter_linework(floor_entities)
    diagnostics.candidate_wall_entities += len(linework)
    closed_linework = _close_linework_gaps(linework, drawing_span, config)
    try:
        polygons = [polygon for polygon in polygonize(unary_union(closed_linework)) if polygon.is_valid and polygon.area > 0]
    except Exception:
        diagnostics.warnings.append("polygonize_failed")
        polygons = []

    floor_area = max(_bounds_area(bounds), 1)
    floor_box = box(*bounds)
    labels = [label for label in floor_labels if is_room_name_label(label.text) or extract_room_dimension(label.text)]
    min_area = config.min_space_area_sqm / max(metre_factor * metre_factor, 0.000001)
    candidate_polygons = [
        polygon
        for polygon in polygons
        if polygon.area >= min_area
        and _polygon_is_usable_space_shape(polygon, metre_factor, config)
        and (
            _bounds_area(polygon.bounds) / floor_area <= 0.45
            or any(polygon.contains(label.point) or polygon.touches(label.point) for label in labels)
        )
        and polygon.intersection(floor_box).area / max(polygon.area, 0.000001) >= 0.9
    ]
    diagnostics.candidate_spaces += len(candidate_polygons)

    spaces: list[CandidateSpace] = []
    used_keys: set[tuple[tuple[float, float], ...]] = set()
    used_labels: set[str] = set()

    def polygon_key(polygon: Polygon) -> tuple[tuple[float, float], ...]:
        return tuple(sorted((round(float(x), 4), round(float(y), 4)) for x, y in list(polygon.exterior.coords)[:-1]))

    for label in labels:
        name = space_label_name(label.text) or (extract_room_dimension(label.text) or ("Unclassified Space", 0, 0))[0]
        canonical = canonical_name(name)
        printed_area = _printed_area_for(label, floor_labels, drawing_span)
        candidates = [polygon for polygon in candidate_polygons if polygon.contains(label.point) or polygon.touches(label.point)]
        if not candidates:
            candidates = [polygon for polygon in candidate_polygons if polygon.distance(label.point) <= config.label_match_distance_m]
        if not candidates and printed_area:
            candidates = [
                polygon
                for polygon in candidate_polygons
                if polygon.distance(label.point) <= max(config.label_match_distance_m, drawing_span * 0.2)
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
        else:
            candidates = sorted(candidates, key=lambda polygon: (polygon.distance(label.point), polygon.area))
        if not candidates:
            polygon = _dimension_fallback_polygon(label, floor_labels, bounds, drawing_span)
            if polygon is None:
                diagnostics.unmatched_labels += 1
                continue
        else:
            polygon = candidates[0]
        key = polygon_key(polygon)
        if key in used_keys:
            continue
        area_sqm = round(polygon.area * metre_factor * metre_factor, 2)
        if area_sqm <= 0:
            diagnostics.warnings.append("zero_area_segment_rejected")
            continue
        confidence = _confidence(label, polygon, printed_area, area_sqm, inferred=not polygon.contains(label.point))
        spaces.append(CandidateSpace(polygon, label, name, canonical_name(name), confidence, not polygon.contains(label.point), (label.handle,), ()))
        used_keys.add(key)
        used_labels.add(label.handle)

    labeled_union = unary_union([space.polygon for space in spaces]) if spaces else None
    for polygon in candidate_polygons:
        key = polygon_key(polygon)
        if key in used_keys:
            continue
        if any(polygon.distance(space.polygon) <= config.snap_tolerance_m and polygon.area < space.polygon.area * 0.12 for space in spaces):
            continue
        max_room_area = min(max(floor_area * 0.18, 90 / max(metre_factor * metre_factor, 0.000001)), 120 / max(metre_factor * metre_factor, 0.000001))
        if polygon.area > max_room_area:
            continue
        area_sqm = round(polygon.area * metre_factor * metre_factor, 2)
        if area_sqm <= 0 or area_sqm < max(config.min_space_area_sqm, 1.0):
            continue
        if labeled_union is not None and polygon.intersection(labeled_union).area / max(polygon.area, 0.000001) > 0.2:
            continue
        spaces.append(CandidateSpace(polygon, None, "Unclassified Space", "unclassified", 50, True, (), ("No room label found.",)))
        diagnostics.unclassified_spaces += 1
        used_keys.add(key)

    diagnostics.segments_before_filtering += len(spaces)
    return spaces


def _screen_transform(bounds: tuple[float, float, float, float], width: int, height: int, padding: int):
    min_x, min_y, max_x, max_y = bounds
    scale = min((width - 2 * padding) / max(max_x - min_x, 1), (height - 2 * padding) / max(max_y - min_y, 1))

    def screen(point: tuple[float, float]) -> tuple[float, float]:
        x, y = point
        return (round(padding + (x - min_x) * scale, 2), round(height - padding - (y - min_y) * scale, 2))

    return screen


def _render_svg(entities: list[NormalizedEntity], labels: list[TextLabel], bounds: tuple[float, float, float, float], width: int, height: int, padding: int) -> str:
    screen = _screen_transform(bounds, width, height, padding)
    svg_paths: list[str] = []
    for entity in entities:
        geometry = entity.geometry
        if isinstance(geometry, LineString):
            coords = [screen((float(x), float(y))) for x, y in geometry.coords]
            if len(coords) >= 2:
                svg_paths.append(f'<polyline points="{" ".join(f"{x},{y}" for x, y in coords)}" stroke="#94a3b8" stroke-width="1.2" fill="none"/>')
        elif isinstance(geometry, Polygon):
            coords = [screen((float(x), float(y))) for x, y in list(geometry.exterior.coords)[:-1]]
            svg_paths.append(f'<polygon points="{" ".join(f"{x},{y}" for x, y in coords)}" stroke="#334155" stroke-width="1.4" fill="none"/>')
    for label in labels:
        x, y = screen((float(label.point.x), float(label.point.y)))
        svg_paths.append(f'<text x="{x}" y="{y}" fill="#2563eb" font-size="12">{html.escape(label.text[:80])}</text>')
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
        f'<defs><clipPath id="floor-region-clip"><rect x="0" y="0" width="{width}" height="{height}"/></clipPath></defs>'
        f'<rect width="100%" height="100%" fill="white"/><g clip-path="url(#floor-region-clip)">{"".join(svg_paths)}</g></svg>'
    )


def _to_segment(space: CandidateSpace, bounds: tuple[float, float, float, float], width: int, height: int, padding: int, metre_factor: float) -> ExtractedSegment:
    screen = _screen_transform(bounds, width, height, padding)
    coords = [screen((float(x), float(y))) for x, y in list(space.polygon.exterior.coords)[:-1]]
    return ExtractedSegment(
        segment_name=space.name[:150],
        area_sqm=round(space.polygon.area * metre_factor * metre_factor, 2),
        polygon_coords=coords,
        confidence_score=space.confidence,
    )


def extract_dxf_blueprint(content: bytes, config: DxfExtractionConfig | None = None) -> BlueprintExtractionResult:
    import ezdxf

    started = time.perf_counter()
    config = config or DxfExtractionConfig()
    diagnostics = DxfDiagnostics()
    with tempfile.NamedTemporaryFile(suffix=".dxf", delete=False) as temp:
        temp.write(content)
        temp_path = Path(temp.name)
    try:
        document = ezdxf.readfile(temp_path)
    finally:
        temp_path.unlink(missing_ok=True)

    entities, labels = parse_layout(document.modelspace(), "Model", config, diagnostics)
    if not entities and not labels:
        raise ValueError("No readable drawing geometry was found in this DXF.")

    drawing_bounds = _all_bounds(entities, labels)
    metre_factor, units_name, unit_confidence, unit_warnings = infer_unit_factor(int(document.header.get("$INSUNITS", 0)), drawing_bounds, labels)
    diagnostics.warnings.extend(unit_warnings)
    grid_regions = _floor_regions_from_sheet_grid(entities, labels, drawing_bounds)
    label_regions = _floor_regions_from_labels(labels, drawing_bounds)
    geometry_regions = _floor_regions_from_geometry(entities, labels, drawing_bounds)
    cluster_regions = _floor_regions_from_space_label_clusters(labels, drawing_bounds)
    if len(grid_regions) >= 2:
        regions = grid_regions
    elif len(label_regions) > 1:
        regions = label_regions
    elif len(cluster_regions) > len(geometry_regions):
        regions = cluster_regions
    else:
        regions = geometry_regions or label_regions
    if not grid_regions:
        regions = _split_regions_by_internal_label_gaps(regions, labels)
    width, height, padding = 1400, 900, 40

    floors: list[BlueprintFloor] = []
    floor_region_bounds: list[tuple[float, float, float, float]] = []
    all_segment_polygons: list[Polygon] = []
    for region in regions:
        region_bounds = _expanded(region.bounds, max(drawing_bounds[2] - drawing_bounds[0], drawing_bounds[3] - drawing_bounds[1]) * 0.015)
        floor_entities = [entity for entity in entities if _contains_point(region_bounds, _bounds_center(entity.geometry.bounds))]
        floor_labels = [label for label in labels if _contains_point(region_bounds, (float(label.point.x), float(label.point.y)))]
        visible_bounds = region_bounds
        spaces = _candidate_spaces_for_floor(floor_entities, floor_labels, visible_bounds, metre_factor, config, diagnostics)
        segments = [_to_segment(space, visible_bounds, width, height, padding, metre_factor) for space in spaces if space.polygon.is_valid and space.polygon.area > 0]
        diagnostics.segments_after_filtering += len(segments)
        all_segment_polygons.extend(space.polygon for space in spaces)
        svg = _render_svg(floor_entities, floor_labels, visible_bounds, width, height, padding)
        floors.append(
            BlueprintFloor(
                floor_level=region.name,
                image_url=f"data:image/svg+xml;charset=utf-8,{quote(svg)}",
                image_width=width,
                image_height=height,
                segments=segments,
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
    return BlueprintExtractionResult(floors=floors, diagnostics=diagnostics.__dict__)
