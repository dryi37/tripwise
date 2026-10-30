import { afterEach, describe, expect, it, vi } from "vitest";

const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class { models = { generateContent }; },
  FunctionCallingConfigMode: { ANY: "ANY" },
  Type: { OBJECT: "OBJECT", STRING: "STRING", NUMBER: "NUMBER" },
}));

import { GemmaAgentModel, compactToolResultsForPrompt, resolveFinalText, type GemmaAgentConfig } from "../src/modules/agent/infrastructure/gemma-agent.model.js";
import type { AgentModelInput } from "../src/modules/agent/agent-model.js";

const gemmaConfig: GemmaAgentConfig = {
  requestTimeoutMs: 60_000, maxRetries: 7, maxToolResultContextChars: 13_000,
  retryBaseDelayMs: 250, retryMaxDelayMs: 5_000, maxOutputTokens: 2_048,
};
const createGemmaAgentModel = (apiKey: string | undefined, model = "test-model") => new GemmaAgentModel(apiKey, model, gemmaConfig);

describe("GemmaAgentModel prompt", () => {
  it("uses the request timeout supplied by configuration", async () => {
    generateContent.mockReset().mockResolvedValue({ text: "done" });
    const timeout = vi.spyOn(AbortSignal, "timeout");
    await createGemmaAgentModel("test-key").decide(agentInput);
    expect(timeout).toHaveBeenCalledWith(gemmaConfig.requestTimeoutMs);
    timeout.mockRestore();
  });

  it("returns a safe summary when a post-tool model response is empty", () => {
    expect(resolveFinalText(undefined, [{ tool: "add_itinerary_item", result: { applied: true } }]))
      .toBe("Đã cập nhật phương án bằng các công cụ được phép.");
    expect(resolveFinalText(undefined, [])).toBeUndefined();
  });

  it("tells the model not to repeat an empty knowledge search", () => {
    const model = createGemmaAgentModel(undefined) as unknown as {
      prompt(input: AgentModelInput): string;
    };
    const prompt = model.prompt({
      instruction: "Tạo lịch trình Tokyo 3 ngày",
      trip: {
        destination: "Tokyo",
        startDate: "2027-05-01",
        endDate: "2027-05-03",
        travelers: 2,
      } as AgentModelInput["trip"],
      draft: { revision: 1, items: [] } as unknown as AgentModelInput["draft"],
      turn: 2,
      toolResults: [{ tool: "search_knowledge", result: [] }],
    });

    expect(prompt).toContain("if it returns no results, do not repeat it");
    expect(prompt).toContain("Finish research in a short phase, then add the activities in one batch; after adding activities, do not search again");
    expect(prompt).toContain("Use unpricedReason for activities without a reliable source instead of spending more calls trying to find a price");
    expect(prompt).toContain("continue with unpriced itinerary activities using add_itinerary_item and general travel knowledge");
    expect(prompt).toContain("emit all required add_itinerary_item calls together in the same model turn");
  });

  it("lets the agent compare internal and public sources without a fixed source priority", () => {
    const model = createGemmaAgentModel(undefined) as unknown as {
      prompt(input: AgentModelInput): string;
    };
    const prompt = model.prompt({ ...agentInput, instruction: "Tạo lịch trình Seoul mùa đông" });

    expect(prompt).toContain("Compare matching internal offers and public sources on evidence quality, trip-date validity, fit, and total price");
    expect(prompt).toContain("There is no fixed preference for internal or external sources");
    expect(prompt).toContain("Use search_knowledge only when internal travel context can materially improve the itinerary");
    expect(prompt).not.toContain("before any web search");
    expect(prompt).not.toContain("prefer verified internal offers");
    expect(prompt).toContain("When the user explicitly asks to create a tour or itinerary, add at least one activity per trip day before final");
    expect(prompt).not.toMatch(/never make more than \d+ search_web calls/);
    expect(prompt).toContain("There is no separate web-search call cap; the overall agent run time, model-turn, and tool-call budgets still apply");
    expect(prompt).toContain("If internal search is empty or no suitable web source is found, continue with unpriced itinerary activities using add_itinerary_item");
    expect(prompt).toContain("link a priced activity to the exact verified supplier offer using supplierOfferId");
    expect(prompt).toContain("server will add a quote line marked for price review");
    expect(prompt).toContain("Use add_place_from_external_source when selecting a saved public price by its exact externalSourceId");
    expect(prompt).toContain("use web results as research evidence for the named places");
    expect(prompt).toContain("results may not include a parsed price or suitability metadata");
    expect(prompt).toContain("Consider each result's title, URL, publisher, snippet, and full page content.");
  });

  it("requires the agent to disclose internal demo data as simulated", () => {
    const model = createGemmaAgentModel(undefined) as unknown as {
      prompt(input: AgentModelInput): string;
    };

    expect(model.prompt(agentInput)).toContain("If an internal result is labeled DEMO, identify its prices and terms as simulated test data");
  });
});

describe("GemmaAgentModel provider retries", () => {
  afterEach(() => vi.useRealTimers());

  it("does not expose result limits on search tool declarations", async () => {
    generateContent.mockReset().mockResolvedValue({ text: "done" });
    const model = createGemmaAgentModel("test-key");
    await model.decide(agentInput);

    const request = generateContent.mock.calls[0]?.[0] as { config: { tools: Array<{ functionDeclarations: Array<{ name: string; parameters: { properties: Record<string, unknown> } }> }> } };
    const declarations = request.config.tools[0]!.functionDeclarations;
    for (const name of ["search_web", "search_knowledge", "search_supplier_offers"]) {
      const declaration = declarations.find((item) => item.name === name)!;
      expect(declaration.parameters.properties).not.toHaveProperty("limit");
    }
  });

  it("forces an itinerary activity after a requested itinerary is blocked for being empty", async () => {
    generateContent.mockReset().mockResolvedValue({
      functionCalls: [{ name: "add_itinerary_item", args: { dayIndex: 1, title: "Seoul walk", location: "Seoul", localStartTime: "10:00", localEndTime: "12:00", description: "Gợi ý tham quan", unpricedReason: "Chưa có nguồn giá đáng tin cậy." } }],
    });
    const model = createGemmaAgentModel("test-key");

    const input = {
      ...agentInput,
      budget: { tripDays: 2, modelTurnLimit: 40, toolCallLimit: 80, toolsExecuted: 8 },
      draft: { revision: 2, items: [{ dayIndex: 1 }] } as unknown as AgentModelInput["draft"],
      toolResults: [{ tool: "itinerary_completion_required", result: { reason: "ITINERARY_REQUIRED" } }],
    } satisfies AgentModelInput;
    await model.decide(input);

    expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({
      contents: expect.stringContaining("You must call add_itinerary_item now for missing trip day(s): 2"),
      config: expect.objectContaining({
        toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["add_itinerary_item"] } },
      }),
    }));
  });

  it("forces itinerary creation after the research phase has consumed eight calls", async () => {
    generateContent.mockReset().mockResolvedValue({ functionCalls: [{ name: "add_itinerary_item", args: { dayIndex: 1, title: "Seoul walk", location: "Seoul", localStartTime: "10:00", localEndTime: "12:00", description: "Gợi ý tham quan", unpricedReason: "Chưa có nguồn giá đáng tin cậy." } }] });
    const model = createGemmaAgentModel("test-key");

    await model.decide({
      ...agentInput,
      toolResults: Array.from({ length: 8 }, (_, index) => ({ tool: index % 2 ? "search_web" : "search_supplier_offers", result: [] })),
    });

    expect(generateContent).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["add_itinerary_item"] } },
      }),
    }));
  });

  it.each([400, 503])("retries a Gemini %i response and returns a later success", async (status) => {
    vi.useFakeTimers();
    generateContent.mockReset()
      .mockRejectedValueOnce(Object.assign(new Error("provider response"), { status }))
      .mockResolvedValueOnce({ text: "Đã tạo lịch trình." });
    const model = createGemmaAgentModel("test-key");

    const resultPromise = model.decide(agentInput).then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual({ value: { type: "final", text: "Đã tạo lịch trình." } });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("correlates model input and retry events with run and turn ids", async () => {
    vi.useFakeTimers();
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    generateContent.mockReset()
      .mockRejectedValueOnce(Object.assign(new Error("provider unavailable"), { status: 503 }))
      .mockResolvedValueOnce({ text: "Đã tạo lịch trình." });
    const model = createGemmaAgentModel("test-key");

    try {
      const resultPromise = model.decide(agentInput, {
        runId: "run-correlation-test",
        signal: new AbortController().signal,
      });
      await vi.runAllTimersAsync();

      await expect(resultPromise).resolves.toMatchObject({ type: "final" });
      const events = [...info.mock.calls, ...warn.mock.calls]
        .map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>);
      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({ event: "tour_agent.model.input_prepared", runId: "run-correlation-test", turn: 1 }),
        expect.objectContaining({ event: "tour_agent.model.retry_scheduled", runId: "run-correlation-test", turn: 1, attempt: 1, nextAttempt: 2 }),
      ]));
      expect(events.every((event) => !("modelCallId" in event))).toBe(true);
    } finally {
      info.mockRestore();
      warn.mockRestore();
    }
  });

  it("makes seven retries after the initial Gemini request, then returns a provider error", async () => {
    vi.useFakeTimers();
    generateContent.mockReset().mockRejectedValue(Object.assign(new Error("provider unavailable"), { status: 500 }));
    const model = createGemmaAgentModel("test-key");

    const resultPromise = model.decide(agentInput).then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toMatchObject({ error: { status: 503, code: "AI_PROVIDER_UNAVAILABLE" } });
    expect(generateContent).toHaveBeenCalledTimes(gemmaConfig.maxRetries + 1);
    
  });

  it("creates a fresh timeout signal for every Gemini retry", async () => {
    vi.useFakeTimers();
    const attemptSignals: AbortSignal[] = [];
    generateContent.mockReset().mockImplementation(({ config }: { config: { abortSignal: AbortSignal } }) => {
      attemptSignals.push(config.abortSignal);
      return attemptSignals.length > 1
        ? Promise.resolve({ text: "Đã tạo lịch trình." })
        : Promise.reject(Object.assign(new Error("provider timeout response"), { status: 503 }));
    });
    const model = createGemmaAgentModel("test-key");
    const resultPromise = model.decide(agentInput).then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );

    await vi.runAllTimersAsync();

    await expect(resultPromise).resolves.toEqual({ value: { type: "final", text: "Đã tạo lịch trình." } });
    expect(attemptSignals).toHaveLength(2);
    expect(attemptSignals[0]).not.toBe(attemptSignals[1]);
  });
});

describe("GemmaAgentModel prompt context", () => {
  it("preserves internal supplier offers when results are returned as an array", () => {
    const compacted = compactToolResultsForPrompt([{
      tool: "search_supplier_offers",
      result: [{
        id: "demo-hotel-service",
        name: "[DEMO] Khách sạn Seoul",
        category: "Lưu trú",
        tags: ["LODGING", "FOOD"],
        unit: "phòng/đêm",
        offers: [{ id: "demo-hotel-offer", unitPriceMinor: 1_800_000, currency: "VND", status: "VERIFIED" }],
      }],
    }], gemmaConfig.maxToolResultContextChars);

    expect(JSON.stringify(compacted)).toContain("demo-hotel-offer");
    expect(JSON.stringify(compacted)).toContain("1800000");
    expect(JSON.stringify(compacted)).toContain("LODGING");
  });

  it("passes five web results without full page content", () => {
    const results = Array.from({ length: 5 }, (_, index) => ({
      id: `source-${index}`, title: `Place ${index}`, url: `https://example.com/${index}`,
      excerpt: `Snippet ${index}`,
    }));

    const compacted = compactToolResultsForPrompt([{ tool: "search_web", result: results }], gemmaConfig.maxToolResultContextChars);
    const serialized = JSON.stringify(compacted);

    expect(compacted[0]?.result).toHaveLength(5);
    expect(serialized).toContain("Snippet 4");
    expect(serialized).not.toContain("rawContent");
    expect(serialized).not.toContain('"omittedCount"');
  });

  it("preserves all knowledge and supplier search results and their full content", () => {
    const knowledge = Array.from({ length: 5 }, (_, index) => ({
      documentId: `doc-${index}`, chunkId: `chunk-${index}`, title: `Guide ${index}`,
      content: `Full knowledge evidence ${index} `.repeat(100), score: 0.9,
    }));
    const suppliers = Array.from({ length: 5 }, (_, index) => ({
      id: `service-${index}`, name: `Service ${index}`, category: "Activity", tags: ["TAG-A", "TAG-B", "TAG-C", "TAG-D", "TAG-E", "TAG-F"],
      unit: "visit", offers: [{ id: `offer-${index}`, details: `Full offer terms ${index} `.repeat(100), status: "VERIFIED" }],
    }));

    const knowledgeContext = compactToolResultsForPrompt([{ tool: "search_knowledge", result: knowledge }], gemmaConfig.maxToolResultContextChars);
    const supplierContext = compactToolResultsForPrompt([{ tool: "search_supplier_offers", result: suppliers }], gemmaConfig.maxToolResultContextChars);
    const serialized = JSON.stringify([knowledgeContext, supplierContext]);

    expect(knowledgeContext[0]?.result).toHaveLength(5);
    expect(serialized).toContain("Full knowledge evidence 4");
    expect(supplierContext[0]?.result).toHaveLength(5);
    expect((supplierContext[0]?.result as Array<{ offers: unknown[] }>)[4]?.offers).toHaveLength(1);
    expect(serialized).toContain("Full offer terms 4 ".repeat(100));
    expect(serialized).not.toContain('"omittedCount"');
  });

  it("bounds accumulated tool results while retaining recent external source ids", () => {
    const oldResults = Array.from({ length: 200 }, (_, index) => ({
      tool: index === 199 ? "search_web" : "search_knowledge",
      result: index === 199
        ? [{ id: "recent-source-id", placeName: "Seoul Museum", canonicalUrl: "https://example.com", excerpt: "evidence ".repeat(100), originalAmountMinor: 12000, originalCurrency: "KRW", evidence: { openingHours: [{ day: "MONDAY", opens: "09:00", closes: "18:00" }] } }]
        : [{ documentId: `doc-${index}`, chunkId: `chunk-${index}`, title: "Old knowledge", content: "historical content ".repeat(500), score: 0.8 }],
    }));

    const compacted = compactToolResultsForPrompt(oldResults, gemmaConfig.maxToolResultContextChars);
    const serialized = JSON.stringify(compacted);

    expect(serialized.length).toBeLessThanOrEqual(gemmaConfig.maxToolResultContextChars);
    expect(serialized).toContain("recent-source-id");
    expect(serialized).toContain('"opens":"09:00"');
    expect(serialized).not.toContain("historical content".repeat(20));
    expect(compacted.length).toBeLessThan(oldResults.length);
  });
});

const agentInput: AgentModelInput = {
  instruction: "Tạo lịch trình Seoul một ngày",
  trip: {
    destination: "Seoul",
    startDate: "2027-05-01",
    endDate: "2027-05-01",
    travelers: 2,
  } as AgentModelInput["trip"],
  draft: { revision: 1, items: [] } as unknown as AgentModelInput["draft"],
  turn: 1,
  toolResults: [],
};

