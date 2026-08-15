import html
import math
import tempfile
import re
import time
from dataclasses import replace
from pathlib import Path
from urllib.parse import quote

from shapely.affinity import translate
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box
from shapely.ops import polygonize, unary_union

from app.schemas.blueprint import BlueprintExtractionResult, BlueprintFloor, ExtractedSegment

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
from .schemas import CandidateSpace, DxfDiagnostics, DxfExtractionConfig, NormalizedEntity, TextLabel
from .units import infer_unit_factor


class DxfFloorRegion(tuple):
    @property
    def name(self) -> str:
        return self[0]

    @property
    def bounds(self) -> tuple[float, float, float, float]:
        return self[1]


WALL_PATTERNS = ("wall", "a-wall", "partition", "column", "coloumn", "coloumns", "muro", "struct", "rooms", "room boundary", "space boundary")
DOOR_PATTERNS = ("door", "a-door", " dr", "dr-", "swing", "puerta")
WINDOW_PATTERNS = ("window", "win")
FURNITURE_PATTERNS = ("furn", "fixture", "fixer", "equip", "furniture", "bed", "chair", "table", "sofa", "closet", "gamla")
DIMENSION_PATTERNS = ("dim", "dimension")
TEXT_PATTERNS = ("text", "anno")
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


def _split_regions_by_internal_label_gaps(regions: list[DxfFloorRegion], labels: list[TextLabel]) -> list[DxfFloorRegion]:
    split_regions: list[DxfFloorRegion] = []
    space_labels = [label for label in labels if is_room_name_label(label.text)]

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
    drawing_span = max(bounds[2] - bounds[0], bounds[3] - bounds[1], 1)
    linework = _iter_linework(floor_entities)
    diagnostics.candidate_wall_entities += len(linework)
    closed_linework = _close_linework_gaps(linework, drawing_span, metre_factor, config, diagnostics)
    native_label_distance = config.label_match_distance_m / max(metre_factor, 0.000001)
    native_snap_tolerance = config.snap_tolerance_m / max(metre_factor, 0.000001)
    try:
        polygons = [polygon for polygon in polygonize(unary_union(closed_linework)) if polygon.is_valid and polygon.area > 0]
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
            candidates = [polygon for polygon in candidate_polygons if polygon.distance(label.point) <= native_label_distance]
        if not candidates and printed_area:
            candidates = [
                polygon
                for polygon in candidate_polygons
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
    for polygon in unclassified_candidates:
        key = polygon_key(polygon)
        if key in used_keys:
            continue
        if any(polygon.distance(space.polygon) <= native_snap_tolerance and polygon.area < space.polygon.area * 0.12 for space in spaces):
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
        area_sqm=space.reported_area_sqm or round(space.polygon.area * metre_factor * metre_factor, 2),
        polygon_coords=coords,
        confidence_score=space.confidence,
        geometry_flagged=bool(space.warnings),
        geometry_warnings=list(space.warnings),
        boundary_estimated=space.reported_area_sqm is not None,
    )


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
    grid_regions = _floor_regions_from_sheet_grid(entities, labels, drawing_bounds)
    label_regions = _floor_regions_from_labels(labels, drawing_bounds)
    geometry_regions = _floor_regions_from_geometry(entities, labels, drawing_bounds)
    cluster_regions = _floor_regions_from_space_label_clusters(labels, drawing_bounds)
    if len(grid_regions) >= 2:
        regions = grid_regions
    elif len(label_regions) > 1:
        regions = label_regions
    elif cluster_regions and len(cluster_regions) >= len(geometry_regions):
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
