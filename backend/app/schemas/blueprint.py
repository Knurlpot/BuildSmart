from pydantic import BaseModel, Field, field_validator


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
    segments: list[ExtractedSegment]

    @field_validator("segments", mode="before")
    @classmethod
    def remove_non_measurable_segments(cls, segments: object) -> object:
        if not isinstance(segments, list):
            return segments
        return [
            segment
            for segment in segments
            if float(segment.get("area_sqm", 0) if isinstance(segment, dict) else getattr(segment, "area_sqm", 0)) > 0
        ]


class BlueprintExtractionResult(BaseModel):
    floors: list[BlueprintFloor] = Field(min_length=1)


class GeminiSegment(BaseModel):
    segment_name: str
    area_sqm: float
    polygon_coords: list[tuple[float, float]]
    confidence_score: float = Field(ge=0, le=100)


class GeminiFloorExtraction(BaseModel):
    floor_level: str
    segments: list[GeminiSegment]
