from pydantic import BaseModel, Field, validator
from typing import Literal, List


class RawItemRow(BaseModel):
    item_code: str | None = None
    raw_material_name: str
    raw_unit: str | None = None
    raw_price: str | float | None = None
    region: str | None = None
    quarter: str | None = None
    year: int | None = None

    @validator("raw_material_name")
    def normalize_name(cls, value: str) -> str:
        return value.strip()


class NormalizedItem(BaseModel):
    item_code: str | None = None
    raw_material_name: str
    standardized_name: str
    category: str
    specifications: dict[str, str | None]
    unit: str
    unit_cost: float
    currency: Literal["PHP"] = "PHP"
    region: str | None = None
    quarter: str | None = None
    year: int | None = None
    is_flagged: bool = False
    flag_reason: str | None = None


class ParsedFileOutput(BaseModel):
    source_agency: Literal["DPWH", "PSA"]
    region: str
    period: str
    total_items_processed: int
    items: List[NormalizedItem]
