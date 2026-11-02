import { describe, expect, it, vi } from 'vitest';
const { generateContent, countTokens } = vi.hoisted(() => ({ generateContent: vi.fn(), countTokens: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { models = { generateContent, countTokens }; },
  FunctionCallingConfigMode: { ANY: 'ANY' },
  Type: { OBJECT: 'OBJECT', STRING: 'STRING', NUMBER: 'NUMBER' },
}));
import { GemmaAgentModel } from '../src/modules/agent/infrastructure/gemma-agent.model.js';
import type { AgentModelInput } from '../src/modules/agent/agent-model.js';
import { TourAgentService } from '../src/modules/agent/tour-agent.service.js';
import type { TripService } from '../src/modules/trips/trip.service.js';
import type { PlanningService } from '../src/modules/planning/planning.service.js';
import type { KnowledgeService } from '../src/modules/knowledge/knowledge.service.js';

const config = { requestTimeoutMs: 60000, maxRetries: 0, maxToolResultContextChars: 2000, retryBaseDelayMs: 1, retryMaxDelayMs: 1, maxOutputTokens: 1000 };
const input = {
  instruction: 'Tạo lịch trình', trip: { destination: 'Seoul', startDate: '2026-12-12', endDate: '2026-12-13', travelers: 2 },
  draft: { revision: 1, items: [] }, turn: 1,
  toolResults: Array.from({ length: 8 }, (_, i) => ({ tool: 'search_places', query: `place-${i}`, result: [{ placeId: `node/${i}`, displayName: 'a'.repeat(400) }] })),
} as unknown as AgentModelInput;
const options = { runId: 'run-1', signal: new AbortController().signal };

describe('agent context summary', () => {
  it('summarizes old results once and retains recent results across calls', async () => {
    generateContent.mockReset().mockResolvedValueOnce({ text: 'Visited node/0' }).mockResolvedValue({ text: 'done' });
    countTokens.mockReset().mockResolvedValueOnce({ totalTokens: 13000 }).mockResolvedValue({ totalTokens: 2000 });
    const model = new GemmaAgentModel('key', 'model', config);
    const summary = await model.summarizeContext(input, null, options);
    expect(summary).toEqual({ text: 'Visited node/0', through: 4 });
    const prepared = { ...input, toolResults: input.toolResults!.slice(summary!.through), contextSummary: summary!.text };
    await model.decide(prepared, options);
    expect(await model.summarizeContext(input, summary, options)).toEqual(summary);
    await model.decide(prepared, options);
    expect(generateContent).toHaveBeenCalledTimes(3);
    const prompt = generateContent.mock.calls[1]![0].contents as string;
    expect(prompt).toContain('Visited node/0');
    expect(prompt).toContain('place-7');
    expect(prompt).not.toContain('place-0');
    expect((generateContent.mock.calls[2]![0].contents as string)).toContain('Visited node/0');
  });

  it('continues with bounded tool results when summary generation fails', async () => {
    generateContent.mockReset().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce({ text: 'done' });
    countTokens.mockReset().mockResolvedValueOnce({ totalTokens: 13000 }).mockResolvedValue({ totalTokens: 2000 });
    const model = new GemmaAgentModel('key', 'model', config);
    const summary = await model.summarizeContext(input, null, options);
    expect(summary).toBeNull();
    const result = await model.decide(input, options);
    expect(result).toEqual({ type: 'final', text: 'done' });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('counts the complete prompt with tool declarations and checks it again after summarizing', async () => {
    generateContent.mockReset().mockResolvedValue({ text: 'Tóm tắt' });
    countTokens.mockReset().mockResolvedValueOnce({ totalTokens: 12500 }).mockResolvedValueOnce({ totalTokens: 1000 }).mockResolvedValueOnce({ totalTokens: 3000 });
    const model = new GemmaAgentModel('key', 'model', { ...config, maxToolResultContextChars: 30000 });
    await model.summarizeContext(input, null, options);
    expect(countTokens).toHaveBeenCalledTimes(3);
    expect(countTokens.mock.calls[0]![0].contents).toContain('Consultant request:');
    expect(countTokens.mock.calls[0]![0].contents).toContain('Tool declarations:');
    expect(countTokens.mock.calls[2]![0].contents).toContain('Tóm tắt');
  });

  it('rejects requests still above the input limit after summary', async () => {
    generateContent.mockReset().mockResolvedValue({ text: 'Tóm tắt' });
    countTokens.mockReset().mockResolvedValueOnce({ totalTokens: 17000 }).mockResolvedValueOnce({ totalTokens: 1000 }).mockResolvedValueOnce({ totalTokens: 16500 });
    await expect(new GemmaAgentModel('key', 'model', config).summarizeContext(input, null, options)).rejects.toMatchObject({ code: 'AGENT_INPUT_TOO_LARGE' });
  });

  it('does not call the model when token counting fails', async () => {
    generateContent.mockReset();
    countTokens.mockReset().mockRejectedValue(new Error('count unavailable'));
    await expect(new GemmaAgentModel('key', 'model', config).summarizeContext(input, null, options)).rejects.toMatchObject({ code: 'AI_TOKEN_COUNT_UNAVAILABLE' });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('runs the summary node between tools and the next model call', async () => {
    const decide = vi.fn()
      .mockResolvedValueOnce({ type: 'tool_calls', calls: [{ name: 'search_knowledge', arguments: { query: 'Seoul' } }] })
      .mockResolvedValueOnce({ type: 'final', text: 'Đã tìm hiểu.' });
    const summarizeContext = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ text: 'Đã tìm Seoul', through: 1 });
    const trip = { destination: 'Seoul', startDate: '2026-12-12', endDate: '2026-12-12', travelers: 2 };
    const trips = { get: vi.fn().mockResolvedValue(trip) } as unknown as TripService;
    const draft = { revision: 1, items: [] };
    const planning = { getDraft: vi.fn().mockResolvedValue(draft) } as unknown as PlanningService;
    const knowledge = { search: vi.fn().mockResolvedValue([]) } as unknown as KnowledgeService;
    const agent = new TourAgentService(trips, planning, { decide, summarizeContext }, 5, 5, undefined, knowledge, undefined, undefined, 60000);
    await agent.run('trip-1', { instruction: 'Tìm thông tin Seoul' }, 'graph-run');
    expect(summarizeContext).toHaveBeenCalledTimes(2);
    expect(decide.mock.calls[1]![0]).toMatchObject({ contextSummary: 'Đã tìm Seoul', toolResults: [] });
    expect(summarizeContext.mock.calls[1]![0].toolResults).toHaveLength(1);
  });
});
