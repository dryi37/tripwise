import { describe, expect, it } from "vitest";
import { agentKnowledgeDocuments } from "../src/scripts/agent-knowledge-seed-data.js";

describe("agent knowledge seed", () => {
  it("provides searchable Seoul itinerary guidance, seasonal checks, and quote matching rules", () => {
    const content = agentKnowledgeDocuments.map((document) => document.content).join("\n");

    expect(agentKnowledgeDocuments).toHaveLength(3);
    expect(content).toContain("Gyeongbokgung");
    expect(content).toContain("Bukchon");
    expect(content).toContain("thời tiết");
    expect(content).toContain("đơn giá là “-”");
    expect(content).not.toContain("DEMO - CHỈ DÙNG KIỂM THỬ");
    expect(agentKnowledgeDocuments.every((document) => document.sourceLabel)).toBe(true);
  });
});
