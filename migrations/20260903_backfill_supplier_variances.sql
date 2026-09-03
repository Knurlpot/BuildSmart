-- Remap supplier-uploaded prices to matching shared catalog items and generate
-- Internal variance rows against DPWH baselines.

WITH canonical_matches AS (
  SELECT supplier_item.item_code AS supplier_item_code,
         dpwh_item.item_code AS dpwh_item_code
  FROM items supplier_item
  JOIN items dpwh_item
    ON regexp_replace(lower(supplier_item.item_name), '[^a-z0-9]+', '', 'g')
     = regexp_replace(lower(dpwh_item.item_name), '[^a-z0-9]+', '', 'g')
   AND regexp_replace(lower(COALESCE(supplier_item.unit, '')), '[^a-z0-9]+', '', 'g')
     = regexp_replace(lower(COALESCE(dpwh_item.unit, '')), '[^a-z0-9]+', '', 'g')
  WHERE supplier_item.item_code <> dpwh_item.item_code
    AND dpwh_item.company_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM historical_price_record supplier_price
      WHERE supplier_price.item_code = supplier_item.item_code
        AND supplier_price.price_source = 'Supplier'
    )
    AND EXISTS (
      SELECT 1
      FROM historical_price_record dpwh_price
      WHERE dpwh_price.item_code = dpwh_item.item_code
        AND dpwh_price.price_source = 'DPWH'
    )
),
ranked_matches AS (
  SELECT supplier_item_code,
         dpwh_item_code,
         ROW_NUMBER() OVER (PARTITION BY supplier_item_code ORDER BY dpwh_item_code) AS rn
  FROM canonical_matches
),
updated_prices AS (
  UPDATE historical_price_record supplier_price
  SET item_code = ranked_matches.dpwh_item_code
  FROM ranked_matches
  WHERE ranked_matches.rn = 1
    AND supplier_price.item_code = ranked_matches.supplier_item_code
    AND supplier_price.price_source = 'Supplier'
    AND NOT EXISTS (
      SELECT 1
      FROM historical_price_record existing
      WHERE existing.item_code = ranked_matches.dpwh_item_code
        AND existing.supplier_id IS NOT DISTINCT FROM supplier_price.supplier_id
        AND existing.price_source = supplier_price.price_source
        AND existing.region IS NOT DISTINCT FROM supplier_price.region
        AND existing.location IS NOT DISTINCT FROM supplier_price.location
        AND existing.effective_date = supplier_price.effective_date
    )
  RETURNING supplier_price.item_code
),
supplier_daily AS (
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
  item_code,
  variance_source,
  commodity_group,
  effective_date,
  quarter,
  year,
  percent_change,
  trend_direction,
  is_significant_spike
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
  is_significant_spike = EXCLUDED.is_significant_spike;
