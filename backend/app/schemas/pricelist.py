from __future__ import annotations

from pydantic import BaseModel, Field
from typing import Literal

SourceAgency = Literal["DPWH", "PSA", "Supplier", "Internal"]
CategoryType = Literal[
    "Concrete & Masonry",
    "Steel & Structural Metals",
    "Lumber & Carpentry",
    "Thermal & Moisture Protection (Roofing/Waterproofing)",
    "Plumbing & Sanitary",
    "Electrical & Lighting",
    "Paints & Finishes",
    "Aggregates (Sand & Gravel)",
    "Others",
]

UnitType = Literal[
    "piece",
    "board_foot",
    "cubic_meter",
    "kilogram",
    "bag",
    "length",
    "sheet",
    "gallon",
    "box",
    "bundle",
    "roll",
    "other",
]


class MaterialSpecifications(BaseModel):
    dimensions: str | None = None
    grade: str | None = None
    thickness: str | None = None
    volume: str | None = None
    weight: str | None = None
    schedule: str | None = None
    other: dict[str, str] = Field(default_factory=dict)


class NormalizedPriceRecord(BaseModel):
    source_agency: SourceAgency
    region: str | None = None
    raw_name: str
    raw_unit: str
    raw_price: float | None
    item_name: str
    category: CategoryType
    specifications: MaterialSpecifications
    unit: UnitType
    price: float | None
    currency: Literal["PHP"] = "PHP"
    is_flagged: bool = False
    flag_reason: str | None = None
