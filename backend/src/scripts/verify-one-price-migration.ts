import "dotenv/config";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to verify the migration");

const schema = `one_price_migration_${randomUUID().replaceAll("-", "")}`;
const quoteServiceId = "00000000-0000-4000-8000-000000000003";
const offerKeeperId = "00000000-0000-4000-8000-000000000102";
const offerSplitId = "00000000-0000-4000-8000-000000000103";
const client = new Client({ connectionString });

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

await client.connect();
let schemaCreated = false;
try {
  await client.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  await client.query(`SET search_path TO "${schema}"`);
  await client.query(`
    CREATE TABLE services (
      id UUID PRIMARY KEY, name VARCHAR(160) NOT NULL, category VARCHAR(60) NOT NULL, tags TEXT[] NOT NULL DEFAULT '{}',
      unit VARCHAR(60) NOT NULL, is_active BOOLEAN NOT NULL, created_at TIMESTAMPTZ(3) NOT NULL, updated_at TIMESTAMPTZ(3) NOT NULL
    );
    CREATE TABLE supplier_offers (
      id UUID PRIMARY KEY, service_id UUID NOT NULL, unit_price_minor BIGINT NOT NULL, currency CHAR(3) NOT NULL,
      valid_from DATE, valid_until DATE, details TEXT, status TEXT NOT NULL, created_at TIMESTAMPTZ(3) NOT NULL, updated_at TIMESTAMPTZ(3) NOT NULL
    );
    CREATE INDEX supplier_offers_service_id_status_idx ON supplier_offers(service_id, status);
    CREATE TABLE quote_items (id UUID PRIMARY KEY, service_id UUID, supplier_offer_id UUID);
    CREATE TABLE plan_versions (id UUID PRIMARY KEY, snapshot JSONB NOT NULL);
    CREATE TABLE itinerary_items (id UUID PRIMARY KEY, supplier_offer_id UUID);
    INSERT INTO services VALUES
      ('00000000-0000-4000-8000-000000000001', 'No price', 'Other', ARRAY['OTHER'], 'visit', true, now(), now()),
      ('00000000-0000-4000-8000-000000000002', 'One price', 'Other', ARRAY['OTHER'], 'visit', true, now(), now()),
      ('00000000-0000-4000-8000-000000000003', 'Two prices', 'Other', ARRAY['OTHER'], 'visit', true, now(), now());
    INSERT INTO supplier_offers VALUES
      ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000002', 100, 'VND', NULL, NULL, NULL, 'UNVERIFIED', now(), now()),
      ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000003', 200, 'VND', NULL, NULL, NULL, 'VERIFIED', now() - interval '1 day', now() - interval '1 day'),
      ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-000000000003', 300, 'VND', NULL, NULL, NULL, 'UNVERIFIED', now(), now());
    INSERT INTO quote_items VALUES
      ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000102'),
      ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000103');
    INSERT INTO plan_versions VALUES ('00000000-0000-4000-8000-000000000301', '{"quote":{"items":[{"serviceId":"00000000-0000-4000-8000-000000000003","supplierOfferId":"00000000-0000-4000-8000-000000000102"},{"serviceId":"00000000-0000-4000-8000-000000000003","supplierOfferId":"00000000-0000-4000-8000-000000000103"}]}}');
    INSERT INTO itinerary_items VALUES ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000103');
  `);

  const migration = await readFile(new URL("../../prisma/migrations/20261029120000_one_offer_per_service/migration.sql", import.meta.url), "utf8");
  await client.query(migration);

  const counts = await client.query<{ services: string; offers: string; quotes: string }>(`
    SELECT
      (SELECT count(*) FROM services)::text AS services,
      (SELECT count(*) FROM supplier_offers)::text AS offers,
      (SELECT count(*) FROM quote_items)::text AS quotes
  `);
  assert(counts.rows[0]?.services === "4", "Migration did not split the duplicate service");
  assert(counts.rows[0]?.offers === "3", "Migration changed the number of price rows");
  assert(counts.rows[0]?.quotes === "2", "Migration changed the number of quote rows");

  const prices = await client.query<{ id: string; service_id: string; name: string }>(`
    SELECT offer.id::text AS id, offer.service_id::text AS service_id, service.name
    FROM supplier_offers AS offer JOIN services AS service ON service.id = offer.service_id
    ORDER BY offer.id
  `);
  assert(prices.rows.find((row) => row.id === offerKeeperId)?.service_id === quoteServiceId, "Verified keeper did not retain the original service ID");
  const split = prices.rows.find((row) => row.id === offerSplitId);
  assert(split?.service_id !== quoteServiceId && split?.name === "Two prices", "The extra price was not moved to a cloned service");

  const references = await client.query<{ quote_service_id: string; offer_service_id: string }>(`
    SELECT item.service_id::text AS quote_service_id, offer.service_id::text AS offer_service_id
    FROM quote_items AS item JOIN supplier_offers AS offer ON offer.id = item.supplier_offer_id
  `);
  assert(references.rows.every((row) => row.quote_service_id === row.offer_service_id), "A quote row no longer points to the service that owns its price");

  const version = await client.query<{ snapshot: { quote: { items: Array<{ serviceId: string; supplierOfferId: string }> } } }>("SELECT snapshot FROM plan_versions");
  const savedSplit = version.rows[0]?.snapshot.quote.items.find((item) => item.supplierOfferId === offerSplitId);
  assert(savedSplit?.serviceId === split?.service_id, "Saved plan version source link was not migrated");

  const itinerary = await client.query<{ supplier_offer_id: string }>("SELECT supplier_offer_id::text FROM itinerary_items");
  assert(itinerary.rows[0]?.supplier_offer_id === offerSplitId, "Migration changed the itinerary price-source ID");
  const maxOffers = await client.query<{ count: string }>("SELECT max(offer_count)::text AS count FROM (SELECT count(*) AS offer_count FROM supplier_offers GROUP BY service_id) AS grouped");
  assert(Number(maxOffers.rows[0]?.count ?? 0) <= 1, "A service still has multiple prices");

  console.log("Migration verification passed: no-price service, singleton service, duplicate split, quote links, plan snapshots, and itinerary source IDs.");
} finally {
  if (schemaCreated) await client.query(`DROP SCHEMA "${schema}" CASCADE`);
  await client.end();
}
