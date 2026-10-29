import { describe, expect, it } from "vitest";

import { searchKnowledgeToolSchema, searchSupplierOffersToolSchema, searchWebToolSchema } from "../src/modules/agent/tour-agent.schemas.js";

describe("agent tool schemas", () => {
  it("keeps result limits internal instead of exposing them as model tool inputs", () => {
    expect(searchKnowledgeToolSchema.parse({ query: "Seoul" })).toEqual({ query: "Seoul" });
    expect(() => searchKnowledgeToolSchema.parse({ query: "Seoul", limit: 5 })).toThrow();
    expect(searchSupplierOffersToolSchema.parse({ query: "Seoul" })).toEqual({ query: "Seoul" });
    expect(() => searchSupplierOffersToolSchema.parse({ query: "Seoul", limit: 5 })).toThrow();
    expect(searchWebToolSchema.parse({ query: "Seoul" })).toEqual({ query: "Seoul" });
    expect(() => searchWebToolSchema.parse({ query: "Seoul", limit: 5 })).toThrow();
  });
});
