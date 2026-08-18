from enum import Enum

from pydantic import BaseModel, Field


class RoomOverlay(BaseModel):
    category: str
    color_hex: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    alpha: float = Field(ge=0, le=1)
    rgba: tuple[int, int, int, float]


class ExtractedSegment(BaseModel):
    segment_id: str | None = None
    segment_name: str = Field(min_length=1, max_length=150)
    area_sqm: float = Field(gt=0)
    perimeter_m: float | None = Field(default=None, ge=0)
    category: str | None = None
    color_hex: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    alpha: float | None = Field(default=None, ge=0, le=1)
    overlay: RoomOverlay | None = None
    polygon_coords: list[tuple[float, float]] | None = None
    confidence_score: float | None = Field(default=None, ge=0, le=100)
    geometry_flagged: bool = False
    geometry_warnings: list[str] = Field(default_factory=list)
    boundary_estimated: bool = False
    status: str = "INCLUDED"


class ConfidenceBucket(str, Enum):
    HIGH = "high_confidence"
    MEDIUM = "medium_confidence"
    LOW = "low_confidence"
    UNCERTAIN = "uncertain"


class BlueprintConfidenceBuckets(BaseModel):
    high_confidence: list[ExtractedSegment] = Field(default_factory=list)
    medium_confidence: list[ExtractedSegment] = Field(default_factory=list)
    low_confidence: list[ExtractedSegment] = Field(default_factory=list)
    uncertain: list[ExtractedSegment] = Field(default_factory=list)


class BlueprintLegendItem(BaseModel):
    category: str
    color_hex: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    alpha: float = Field(ge=0, le=1)
    total_area_sqm: float = Field(ge=0)


class BlueprintFloor(BaseModel):
    floor_id: int | None = Field(default=None, ge=1)
    floor_level: str = Field(min_length=1, max_length=80)
    floor_name: str | None = None
    image_url: str
    image_width: int = Field(gt=0)
    image_height: int = Field(gt=0)
    focus_bounds: tuple[float, float, float, float] | None = None
    viewport_bbox: tuple[float, float, float, float] | None = None
    segments: list[ExtractedSegment]
    confidence_buckets: BlueprintConfidenceBuckets = Field(default_factory=BlueprintConfidenceBuckets)
    review_required: bool = True
    legend: list[BlueprintLegendItem] = Field(default_factory=list)
    visual_preview_url: str | None = None
    report_page_url: str | None = None


class BlueprintExtractionResult(BaseModel):
    floors: list[BlueprintFloor] = Field(min_length=1)
    diagnostics: dict | None = None
    blueprint_file_path: str | None = None
    persistence_enabled: bool = False
    persistence_warning: str | None = None
    structured_json: dict | None = None
    report_url: str | None = None


class SavedBlueprintExtractionRequest(BaseModel):
    blueprint_file_path: str = Field(min_length=1, max_length=255)


class GeminiDetectedSpace(BaseModel):
    id: str
    name: str = Field(min_length=1, max_length=150)
    category: str
    color_hex: str = Field(pattern=r"^#[0-9A-Fa-f]{6}$")
    bounding_box_1000: tuple[float, float, float, float]
    confidence_score: float = Field(ge=0, le=1)


class GeminiFloorExtraction(BaseModel):
    floor_name: str = Field(min_length=1, max_length=80)
    total_detected_spaces: int = Field(ge=0)
    detected_spaces: list[GeminiDetectedSpace]
