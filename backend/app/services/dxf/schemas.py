from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class DxfExtractionConfig:
    curve_segments: int = 24
    snap_tolerance_m: float = 0.04
    door_width_min_m: float = 0.55
    door_width_max_m: float = 1.35
    min_space_area_sqm: float = 0.35
    min_symbol_area_sqm: float = 0.02
    label_match_distance_m: float = 1.75
    coverage_target: float = 0.9


@dataclass(frozen=True)
class NormalizedEntity:
    handle: str
    entity_type: str
    layer: str
    source_layout: str
    block_name: str | None
    geometry: Any
    color: int | None = None
    lineweight: int | None = None


@dataclass(frozen=True)
class TextLabel:
    text: str
    point: Any
    handle: str
    layer: str
    block_name: str | None = None


@dataclass
class DxfDiagnostics:
    raw_entities: int = 0
    entities_by_type: dict[str, int] = field(default_factory=dict)
    entities_by_layer: dict[str, int] = field(default_factory=dict)
    expanded_block_entities: int = 0
    unsupported_entities: dict[str, int] = field(default_factory=dict)
    candidate_wall_entities: int = 0
    wall_polygons: int = 0
    door_candidates: int = 0
    accepted_doors: int = 0
    closed_small_gaps: int = 0
    closed_door_gaps: int = 0
    candidate_spaces: int = 0
    segments_before_filtering: int = 0
    segments_after_filtering: int = 0
    unmatched_labels: int = 0
    unclassified_spaces: int = 0
    coverage_percent: float = 0
    warnings: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class CandidateSpace:
    polygon: Any
    label: TextLabel | None
    name: str
    classification: str
    confidence: float
    inferred_boundary: bool
    source_handles: tuple[str, ...] = ()
    warnings: tuple[str, ...] = ()
    reported_area_sqm: float | None = None

