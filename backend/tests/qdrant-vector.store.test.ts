import { afterEach, describe, expect, it, vi } from "vitest";

import { QdrantVectorStore } from "../src/modules/knowledge/infrastructure/qdrant-vector.store.js";

describe("QdrantVectorStore.getPayloads", () => {
  afterEach(() => vi.unstubAllGlobals());

  const storeFor = (collection: string) => new QdrantVectorStore("http://qdrant.test", collection, { requestTimeoutMs: 10_000, collectionCheckTimeoutMs: 5_000, payloadBatchSize: 256 });

  it("retrieves only requested point payloads without downloading vectors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: [{ id: "offer-1", payload: { offerId: "offer-1", contentHash: "abc" } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const store = storeFor("catalog");

    await expect(store.getPayloads(["offer-1"])).resolves.toEqual([{ id: "offer-1", payload: { offerId: "offer-1", contentHash: "abc" } }]);
    expect(fetchMock).toHaveBeenCalledWith("http://qdrant.test/collections/catalog/points", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ ids: ["offer-1"], with_payload: true, with_vector: false }),
    }));
  });

  it("treats an uncreated collection as an empty index during first startup", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 404 })));
    const store = storeFor("new-catalog");

    await expect(store.getPayloads(["offer-1"])).resolves.toEqual([]);
  });

  it("uses the configured payload batch size", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ result: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const store = new QdrantVectorStore("http://qdrant.test", "catalog", { requestTimeoutMs: 10_000, collectionCheckTimeoutMs: 5_000, payloadBatchSize: 2 });

    await store.getPayloads(["a", "b", "c"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => JSON.parse(String(call[1]?.body)).ids)).toEqual([["a", "b"], ["c"]]);
  });
});
