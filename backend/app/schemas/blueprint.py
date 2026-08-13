from pydantic import BaseModel, Field


class ExtractedSegment(BaseModel):
    segment_name: str = Field(min_length=1, max_length=150)
    area_sqm: float = Field(gt=0)
    polygon_coords: list[tuple[float, float]] | None = None
    confidence_score: float | None = Field(default=None, ge=0, le=100)


class BlueprintFloor(BaseModel):
    floor_level: str = Field(min_length=1, max_length=80)
    image_url: str
    image_width: int = Field(gt=0)
    image_height: int = Field(gt=0)
    focus_bounds: tuple[float, float, float, float] | None = None
    segments: list[ExtractedSegment]


class BlueprintExtractionResult(BaseModel):
    floors: list[BlueprintFloor] = Field(min_length=1)
    diagnostics: dict | None = None


class GeminiSegment(BaseModel):
    segment_name: str
    area_sqm: float
    polygon_coords: list[tuple[float, float]]
    confidence_score: float = Field(ge=0, le=100)


class GeminiFloorExtraction(BaseModel):
    floor_level: str
    segments: list[GeminiSegment]
