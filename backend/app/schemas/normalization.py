from pydantic import BaseModel, Field


class MaterialMatch(BaseModel):
    matched_item_code: int | None
    confidence: float = Field(ge=0.0, le=1.0)
    category_type: str
    item_name: str
    material: str
    brand: str
    unit: str
    is_new_item: bool
