import argparse
import os
import re
from datetime import datetime
from difflib import SequenceMatcher

from sqlalchemy import create_engine, text


def match_key(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "", (value or "").lower())


def numeric_tokens(value: str | None) -> set[str]:
    return set(re.findall(r"\d+(?:/\d+)?(?:\.\d+)?", (value or "").lower()))


def score_match(source: dict, target: dict) -> float:
    source_numbers = numeric_tokens(source["item_name"])
    target_numbers = numeric_tokens(target["item_name"])
    if source_numbers and target_numbers and source_numbers != target_numbers:
        return 0.0
    name_score = SequenceMatcher(None, match_key(source["item_name"]), match_key(target["item_name"])).ratio()
    unit_score = 1.0 if match_key(source["unit"]) and match_key(source["unit"]) == match_key(target["unit"]) else 0.0
    return (name_score * 0.9) + (unit_score * 0.1)


def trend_direction(percent_change: float) -> str:
    if percent_change > 1:
        return "Up"
    if percent_change < -1:
        return "Down"
    return "Stable"


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill supplier-vs-DPWH material price variances.")
    parser.add_argument("--apply", action="store_true", help="Apply remaps and variance upserts. Defaults to dry-run.")
    parser.add_argument("--threshold", type=float, default=0.86, help="Minimum fuzzy match score.")
    args = parser.parse_args()

    database_url = os.environ["DATABASE_URL"]
    engine = create_engine(database_url)

    with engine.begin() as connection:
        supplier_items = connection.execute(text("""
            SELECT DISTINCT i.item_code, i.item_name, i.unit
            FROM historical_price_record h
            JOIN items i ON i.item_code = h.item_code
            WHERE h.price_source = 'Supplier'
        """)).mappings().all()
        dpwh_items = connection.execute(text("""
            SELECT DISTINCT i.item_code, i.item_name, i.unit
            FROM historical_price_record h
            JOIN items i ON i.item_code = h.item_code
            WHERE h.price_source = 'DPWH'
        """)).mappings().all()

        matches: list[tuple[dict, dict, float]] = []
        for supplier_item in supplier_items:
            scored = [(dpwh_item, score_match(supplier_item, dpwh_item)) for dpwh_item in dpwh_items]
            scored.sort(key=lambda row: row[1], reverse=True)
            if scored and scored[0][1] >= args.threshold:
                matches.append((supplier_item, scored[0][0], scored[0][1]))

        print(f"Supplier items: {len(supplier_items)}")
        print(f"DPWH items: {len(dpwh_items)}")
        print(f"Candidate matches >= {args.threshold}: {len(matches)}")
        for supplier_item, dpwh_item, score in matches[:30]:
            print(
                f"{score:.3f}: supplier #{supplier_item['item_code']} {supplier_item['item_name']} "
                f"-> DPWH #{dpwh_item['item_code']} {dpwh_item['item_name']}"
            )

        if not args.apply:
            print("Dry run only. Re-run with --apply to update historical_price_record and material_price_variance.")
            return

        backup_table = f"historical_price_record_supplier_backfill_{datetime.now():%Y%m%d_%H%M%S}"
        connection.execute(text(f"""
            CREATE TABLE {backup_table} AS
            SELECT *
            FROM historical_price_record
            WHERE price_source = 'Supplier'
        """))

        remapped_rows = 0
        for supplier_item, dpwh_item, _score in matches:
            result = connection.execute(text("""
                UPDATE historical_price_record supplier_price
                SET item_code = :dpwh_item_code
                WHERE supplier_price.item_code = :supplier_item_code
                  AND supplier_price.price_source = 'Supplier'
                  AND NOT EXISTS (
                    SELECT 1
                    FROM historical_price_record existing
                    WHERE existing.item_code = :dpwh_item_code
                      AND existing.supplier_id IS NOT DISTINCT FROM supplier_price.supplier_id
                      AND existing.price_source = supplier_price.price_source
                      AND existing.region IS NOT DISTINCT FROM supplier_price.region
                      AND existing.location IS NOT DISTINCT FROM supplier_price.location
                      AND existing.effective_date = supplier_price.effective_date
                  )
            """), {
                "supplier_item_code": supplier_item["item_code"],
                "dpwh_item_code": dpwh_item["item_code"],
            })
            remapped_rows += result.rowcount or 0

        variance_rows = connection.execute(text("""
            WITH supplier_daily AS (
              SELECT item_code,
                     effective_date,
                     MAX(quarter) AS quarter,
                     MAX(year) AS year,
                     AVG(price)::numeric AS supplier_price
              FROM historical_price_record
              WHERE price_source = 'Supplier'
              GROUP BY item_code, effective_date
            ),
            dpwh_daily AS (
              SELECT item_code,
                     effective_date,
                     AVG(price)::numeric AS dpwh_price
              FROM historical_price_record
              WHERE price_source = 'DPWH'
              GROUP BY item_code, effective_date
            ),
            computed_variances AS (
              SELECT supplier_daily.item_code,
                     supplier_daily.effective_date,
                     supplier_daily.quarter,
                     supplier_daily.year,
                     ROUND(((supplier_daily.supplier_price - dpwh_daily.dpwh_price) / dpwh_daily.dpwh_price) * 100, 2) AS percent_change
              FROM supplier_daily
              JOIN dpwh_daily
                ON dpwh_daily.item_code = supplier_daily.item_code
               AND dpwh_daily.effective_date = supplier_daily.effective_date
              WHERE dpwh_daily.dpwh_price > 0
            )
            INSERT INTO material_price_variance (
              item_code, variance_source, commodity_group, effective_date, quarter, year,
              percent_change, trend_direction, is_significant_spike
            )
            SELECT item_code,
                   'Internal',
                   NULL,
                   effective_date,
                   quarter,
                   year,
                   percent_change,
                   CASE
                     WHEN percent_change > 1 THEN 'Up'
                     WHEN percent_change < -1 THEN 'Down'
                     ELSE 'Stable'
                   END,
                   ABS(percent_change) >= 10
            FROM computed_variances
            ON CONFLICT (item_code, effective_date)
            DO UPDATE SET
              variance_source = EXCLUDED.variance_source,
              quarter = EXCLUDED.quarter,
              year = EXCLUDED.year,
              percent_change = EXCLUDED.percent_change,
              trend_direction = EXCLUDED.trend_direction,
              is_significant_spike = EXCLUDED.is_significant_spike
        """))

        print(f"Backup table: {backup_table}")
        print(f"Supplier price rows remapped: {remapped_rows}")
        print(f"Variance rows inserted/updated: {variance_rows.rowcount}")


if __name__ == "__main__":
    main()
