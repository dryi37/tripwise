UPDATE "quote_items"
SET "source_type" = 'UNPRICED', "category" = 'ACTIVITY', "unit" = 'visit', "supplier_name_snapshot" = NULL
WHERE "price_status" = 'NEEDS_REVIEW';
