-- Replace the former itinerary-suitability tags with service categories.
UPDATE "services"
SET "tags" = ARRAY[
  CASE lower("category")
    WHEN 'ăn uống' THEN 'FOOD'
    WHEN 'food' THEN 'FOOD'
    WHEN 'lưu trú' THEN 'LODGING'
    WHEN 'lodging' THEN 'LODGING'
    WHEN 'di chuyển' THEN 'TRANSPORT'
    WHEN 'transport' THEN 'TRANSPORT'
    WHEN 'tham quan' THEN 'SIGHTSEEING'
    WHEN 'sightseeing' THEN 'SIGHTSEEING'
    ELSE 'OTHER'
  END
]::TEXT[]
WHERE cardinality("tags") = 0
   OR NOT ("tags" <@ ARRAY['FOOD', 'LODGING', 'TRANSPORT', 'SIGHTSEEING', 'OTHER']::TEXT[]);
