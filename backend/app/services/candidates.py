from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Category, Items


def get_item_candidates(db: Session, company_id: int | None = None) -> list[dict]:
    statement = select(
        Items.item_code,
        Items.item_name,
        Category.category_type,
        Items.description.label("material"),
        Items.brand,
        Items.unit,
    ).join(Category, Items.category_id == Category.category_id)

    if company_id is None:
        statement = statement.where(Items.company_id.is_(None))
    else:
        statement = statement.where((Items.company_id.is_(None)) | (Items.company_id == company_id))

    rows = db.execute(statement).all()

    return [
        {
            "item_code": row.item_code,
            "item_name": row.item_name,
            "category_type": row.category_type,
            "material": row.material or row.item_name,
            "brand": row.brand,
            "unit": row.unit,
        }
        for row in rows
    ]
