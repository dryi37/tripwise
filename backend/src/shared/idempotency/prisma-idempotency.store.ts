import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "../../generated/prisma/client.js";
import type { IdempotencyStore } from "./idempotency.service.js";

export class PrismaIdempotencyStore implements IdempotencyStore {
  constructor(private readonly prisma: PrismaClient) {}
  async claim(key: string, hash: string) {
    try {
      await this.prisma.idempotencyRecord.create({ data: { id: randomUUID(), key, requestHash: hash } });
      return { kind: "claimed" } as const;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const row = await this.prisma.idempotencyRecord.findUniqueOrThrow({ where: { key } });
      return { kind: "existing", record: { hash: row.requestHash, state: row.state === "SUCCEEDED" ? "SUCCEEDED" as const : "IN_PROGRESS" as const, ...(row.statusCode === null ? {} : { statusCode: row.statusCode }), ...(row.responseBody === null ? {} : { body: row.responseBody }) } } as const;
    }
  }
  async succeed(key: string, statusCode: number, body: unknown) { await this.prisma.idempotencyRecord.update({ where: { key }, data: { state: "SUCCEEDED", statusCode, responseBody: body as Prisma.InputJsonValue } }); }
  async clear(key: string) { await this.prisma.idempotencyRecord.deleteMany({ where: { key, state: "IN_PROGRESS" } }); }
}
