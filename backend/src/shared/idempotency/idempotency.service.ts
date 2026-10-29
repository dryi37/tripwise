import { createHash } from "node:crypto";
import { ApiError } from "../http/api-error.js";

interface StoredResult { hash: string; state: "IN_PROGRESS" | "SUCCEEDED"; statusCode?: number; body?: unknown }

export interface IdempotencyStore {
  claim(key: string, hash: string): Promise<{ kind: "claimed" } | { kind: "existing"; record: StoredResult }>;
  succeed(key: string, statusCode: number, body: unknown): Promise<void>;
  clear(key: string): Promise<void>;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, StoredResult>();
  async claim(key: string, hash: string) { const record = this.records.get(key); if (record) return { kind: "existing", record } as const; this.records.set(key, { hash, state: "IN_PROGRESS" }); return { kind: "claimed" } as const; }
  async succeed(key: string, statusCode: number, body: unknown) { const record = this.records.get(key); if (record) this.records.set(key, { ...record, state: "SUCCEEDED", statusCode, body }); }
  async clear(key: string) { this.records.delete(key); }
}

export class IdempotencyService {
  constructor(private readonly store: IdempotencyStore = new InMemoryIdempotencyStore()) {}

  async run(key: string | undefined, payload: unknown, operation: () => Promise<{ statusCode: number; body: unknown }>) {
    if (!key) throw new ApiError(422, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required");
    if (key.length > 200) throw new ApiError(422, "IDEMPOTENCY_KEY_INVALID", "Idempotency-Key is too long");
    const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const claim = await this.store.claim(key, hash);
    if (claim.kind === "existing") {
      if (claim.record.hash !== hash) throw new ApiError(422, "IDEMPOTENCY_KEY_REUSED", "Idempotency key was reused with a different payload");
      if (claim.record.state === "IN_PROGRESS") throw new ApiError(409, "IDEMPOTENCY_IN_PROGRESS", "An identical request is still in progress");
      return { statusCode: claim.record.statusCode!, body: claim.record.body };
    }
    try {
      const result = await operation();
      await this.store.succeed(key, result.statusCode, result.body);
      return result;
    } catch (error) {
      await this.store.clear(key);
      throw error;
    }
  }
}
