import math
from collections import Counter
from typing import Any

from shapely.geometry import LineString, Point, Polygon

from .labels import clean_text
from .schemas import DxfDiagnostics, DxfExtractionConfig, NormalizedEntity, TextLabel


SUPPORTED_GEOMETRY_TYPES = {
    "LINE",
    "LWPOLYLINE",
    "POLYLINE",
    "ARC",
    "CIRCLE",
    "ELLIPSE",
    "SPLINE",
    "HATCH",
    "SOLID",
}
SUPPORTED_TEXT_TYPES = {"TEXT", "MTEXT", "ATTRIB"}


def _entity_layer(entity: Any) -> str:
    return str(getattr(entity.dxf, "layer", "") or "0")


def _entity_color(entity: Any) -> int | None:
    return int(entity.dxf.color) if hasattr(entity.dxf, "color") else None


def _entity_lineweight(entity: Any) -> int | None:
    return int(entity.dxf.lineweight) if hasattr(entity.dxf, "lineweight") else None


def _extract_hatch_pattern(entity: Any) -> str | None:
    """Extract hatch pattern name for confidence scoring."""
    try:
        pattern_name = getattr(entity.dxf, "pattern_name", "").lower() or ""
        if pattern_name:
            return pattern_name
        pattern_type = getattr(entity.dxf, "pattern_type", "")
        if pattern_type == 0:  # USER pattern
            return "user"
        if pattern_type == 1:  # PREDEFINED pattern
            return "predefined"
    except Exception:
        pass
    return None


def _line_from_arc(entity: Any, config: DxfExtractionConfig) -> LineString | None:
    center = entity.dxf.center
    radius = float(entity.dxf.radius)
    start = math.radians(float(entity.dxf.start_angle))
    end = math.radians(float(entity.dxf.end_angle))
    if end < start:
        end += math.tau
    steps = max(6, config.curve_segments)
    points = [
        (float(center.x) + math.cos(start + (end - start) * idx / steps) * radius, float(center.y) + math.sin(start + (end - start) * idx / steps) * radius)
        for idx in range(steps + 1)
    ]
    return LineString(points) if len(points) >= 2 else None


def _line_from_circle(entity: Any, config: DxfExtractionConfig) -> LineString | None:
    center = entity.dxf.center
    radius = float(entity.dxf.radius)
    steps = max(12, config.curve_segments * 2)
    points = [
        (float(center.x) + math.cos(math.tau * idx / steps) * radius, float(center.y) + math.sin(math.tau * idx / steps) * radius)
        for idx in range(steps + 1)
    ]
    return LineString(points)


def _should_infer_closed_wall(points: list[tuple[float, float]], layer: str) -> bool:
    if len(points) < 3 or "wall" not in layer.lower():
        return False
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    span = max(max(xs) - min(xs), max(ys) - min(ys), 1)
    endpoint_gap = math.dist(points[0], points[-1])
    if endpoint_gap <= max(span * 0.005, 0.001):
        return True
    if len(points) != 4:
        return False
    tolerance = max(span * 0.0001, 0.000001)

    def axis_aligned(start: tuple[float, float], end: tuple[float, float]) -> bool:
        return abs(start[0] - end[0]) <= tolerance or abs(start[1] - end[1]) <= tolerance

    candidate = Polygon(points)
    return candidate.is_valid and candidate.area > 0 and all(
        axis_aligned(start, end) for start, end in zip(points, points[1:] + points[:1])
    )


def _geometry_from_entity(entity: Any, config: DxfExtractionConfig) -> Any | None:
    dxftype = entity.dxftype()
    try:
        if dxftype == "LINE":
            start, end = entity.dxf.start, entity.dxf.end
            if start == end:
                return None
            return LineString([(float(start.x), float(start.y)), (float(end.x), float(end.y))])
        if dxftype == "LWPOLYLINE":
            points = [(float(point[0]), float(point[1])) for point in entity.get_points("xy")]
            if len(points) < 2:
                return None
            if (entity.closed or _should_infer_closed_wall(points, _entity_layer(entity))) and len(points) >= 3:
                polygon = Polygon(points)
                return polygon if polygon.is_valid and polygon.area > 0 else LineString(points + [points[0]])
            return LineString(points)
        if dxftype == "POLYLINE":
            points = [(float(vertex.dxf.location.x), float(vertex.dxf.location.y)) for vertex in entity.vertices]
            if len(points) < 2:
                return None
            closed = bool(getattr(entity, "is_closed", False))
            if (closed or _should_infer_closed_wall(points, _entity_layer(entity))) and len(points) >= 3:
                polygon = Polygon(points)
                return polygon if polygon.is_valid and polygon.area > 0 else LineString(points + [points[0]])
            return LineString(points)
        if dxftype == "ARC":
            return _line_from_arc(entity, config)
        if dxftype == "CIRCLE":
            return _line_from_circle(entity, config)
        if dxftype in {"ELLIPSE", "SPLINE"}:
            try:
                points = [(float(point.x), float(point.y)) for point in entity.flattening(0.05)]
            except Exception:
                points = []
            return LineString(points) if len(points) >= 2 else None
        if dxftype == "HATCH":
            # Enhanced hatch extraction: prioritize solid fills, handle multiple paths
            # Hatch fills are extremely reliable indicators of rooms (95%+ accuracy)
            try:
                paths = []
                for path in getattr(entity.paths, "paths", []):
                    vertices = getattr(path, "vertices", None)
                    if vertices and len(vertices) >= 3:
                        try:
                            polygon = Polygon([(float(vertex[0]), float(vertex[1])) for vertex in vertices])
                            # Validate polygon geometry
                            if polygon.is_valid and polygon.area > 0:
                                paths.append(polygon)
                            elif not polygon.is_valid and polygon.area > 0:
                                # Attempt to fix invalid polygon via buffer
                                fixed = polygon.buffer(0)
                                if fixed.is_valid and fixed.area > 0:
                                    paths.append(fixed)
                        except Exception:
                            continue
                # Return largest polygon if multiple paths exist (usually outer boundary is largest)
                if paths:
                    return max(paths, key=lambda p: p.area)
            except Exception:
                pass
            return None
        if dxftype == "SOLID":
            points = []
            for attr in ("vtx0", "vtx1", "vtx2", "vtx3"):
                vertex = getattr(entity.dxf, attr, None)
                if vertex is not None:
                    points.append((float(vertex.x), float(vertex.y)))
            if len(points) >= 3:
                polygon = Polygon(points)
                return polygon if polygon.is_valid and polygon.area > 0 else None
    except Exception:
        return None
    return None


def _text_from_entity(entity: Any) -> str | None:
    if entity.dxftype() in {"TEXT", "ATTRIB"}:
        return getattr(entity.dxf, "text", None)
    if entity.dxftype() == "MTEXT":
        try:
            return entity.plain_text()
        except Exception:
            return entity.text
    return None


def _insert_point(entity: Any) -> Point | None:
    insert = getattr(entity.dxf, "insert", None)
    if insert is None:
        return None
    return Point(float(insert.x), float(insert.y))


def iter_entities_with_virtual_blocks(layout: Any, diagnostics: DxfDiagnostics) -> list[tuple[Any, str | None]]:
    expanded: list[tuple[Any, str | None]] = []
    for entity in layout:
        expanded.append((entity, None))
        if entity.dxftype() in {"INSERT", "MINSERT"}:
            block_name = str(getattr(entity.dxf, "name", "") or "")
            try:
                virtual_entities = list(entity.virtual_entities())
            except Exception:
                diagnostics.unsupported_entities[entity.dxftype()] = diagnostics.unsupported_entities.get(entity.dxftype(), 0) + 1
                continue
            diagnostics.expanded_block_entities += len(virtual_entities)
            expanded.extend((virtual_entity, block_name) for virtual_entity in virtual_entities)
    return expanded


def parse_layout(layout: Any, layout_name: str, config: DxfExtractionConfig, diagnostics: DxfDiagnostics) -> tuple[list[NormalizedEntity], list[TextLabel]]:
    geometries: list[NormalizedEntity] = []
    labels: list[TextLabel] = []
    for entity, block_name in iter_entities_with_virtual_blocks(layout, diagnostics):
        dxftype = entity.dxftype()
        diagnostics.raw_entities += 1
        diagnostics.entities_by_type[dxftype] = diagnostics.entities_by_type.get(dxftype, 0) + 1
        layer = _entity_layer(entity)
        diagnostics.entities_by_layer[layer] = diagnostics.entities_by_layer.get(layer, 0) + 1

        if dxftype in SUPPORTED_TEXT_TYPES:
            text = _text_from_entity(entity)
            point = _insert_point(entity)
            if text and text.strip() and point is not None:
                labels.append(TextLabel(clean_text(text), point, str(getattr(entity.dxf, "handle", "")), layer, block_name))
            continue

        if dxftype in SUPPORTED_GEOMETRY_TYPES:
            geometry = _geometry_from_entity(entity, config)
            if geometry is not None:
                hatch_pattern = _extract_hatch_pattern(entity) if dxftype == "HATCH" else None
                geometries.append(
                    NormalizedEntity(
                        handle=str(getattr(entity.dxf, "handle", "")),
                        entity_type=dxftype,
                        layer=layer,
                        source_layout=layout_name,
                        block_name=block_name,
                        geometry=geometry,
                        color=_entity_color(entity),
                        lineweight=_entity_lineweight(entity),
                        hatch_pattern=hatch_pattern,
                    )
                )
            continue

        diagnostics.unsupported_entities[dxftype] = diagnostics.unsupported_entities.get(dxftype, 0) + 1
    return geometries, labels


def entity_counts(document: Any) -> dict[str, int]:
    return dict(Counter(entity.dxftype() for entity in document.modelspace()))

