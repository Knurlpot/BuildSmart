from dataclasses import dataclass, field
from typing import Any

# Layer confidence scoring for multi-CAD support
# Higher scores = more reliable room indicators
LAYER_CONFIDENCE_PATTERNS = {
    "room": 0.95,
    "space": 0.95,
    "area": 0.90,
    "a-flor-room": 0.90,
    "a-flor-spac": 0.90,
    "a-flor-area": 0.90,
    "a-wall": 0.70,
    "wall": 0.70,
    "a-glaz": 0.60,
    "hatch": 0.65,
    "floor": 0.60,
}

# Hatch pattern type confidence
HATCH_PATTERN_CONFIDENCE = {
    "solid": 0.95,  # SOLID pattern = 100% reliable room fill
    "ansi": 0.75,   # Standard patterns = high confidence
    "iso": 0.75,
    "ar": 0.70,     # AutoCAD patterns
}

# Extraction pass enumeration for tracking
EXTRACTION_PASS_LABELS = {
    1: "hatch_solid_fills",
    2: "hatch_patterned",
    3: "closed_linework_with_labels",
    4: "block_explicit_rooms",
    5: "dimension_fallback",
}


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
    # Enhanced multi-pass extraction
    enable_hatch_analysis: bool = True
    enable_door_validation: bool = True
    hatch_confidence_threshold: float = 0.65
    layer_confidence_threshold: float = 0.50


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
    hatch_pattern: str | None = None  # For HATCH entities: pattern name
    extraction_pass: int = 0  # Which pass detected this entity


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
    candidate_spaces: int = 0
    segments_before_filtering: int = 0
    segments_after_filtering: int = 0
    unmatched_labels: int = 0
    unclassified_spaces: int = 0
    coverage_percent: float = 0
    warnings: list[str] = field(default_factory=list)
    # Enhanced multi-pass extraction tracking
    hatch_solid_polygons: int = 0
    hatch_patterned_polygons: int = 0
    door_validated_spaces: int = 0
    extraction_pass_results: dict[str, int] = field(default_factory=dict)
    layer_confidence_scores: dict[str, float] = field(default_factory=dict)


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

