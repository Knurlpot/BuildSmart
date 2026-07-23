from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Category, Items


def get_item_candidates(db: Session) -> list[dict]:
    rows = db.execute(
        select(
            Items.item_code,
            Items.item_name,
            Category.category_type,
            Items.material,
            Items.brand,
            Items.unit,
        ).join(Category, Items.category_id == Category.category_id)
    ).all()

    return [
        {
            "item_code": row.item_code,
            "item_name": row.item_name,
            "category_type": row.category_type,
            "material": row.material,
            "brand": row.brand,
            "unit": row.unit,
        }
        for row in rows
    ]
