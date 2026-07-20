export * from './common';
export * from './company';
export * from './users';
export * from './suppliers';
export * from './category';
export * from './items';
export * from './quotation';
export * from './quotations-items';
export * from './quotation-service-cost';
export * from './historical-price-record';
export * from './material-price-variance';
export * from './supplier-discount-rule';
export * from './supplier-benchmark';
export * from './project-segment';
export * from './segment-tag';
// supplier_region (schema v3, table 5) intentionally has no type file here: no
// frontend page/hook references it yet. Add one (and export it above) the day
// something actually consumes it — don't pre-build against an unused table.