/**
 * Unit tests for SelfModifyAgent
 * Verifies DB-driven guardrail clamping for all 6 rules.
 */
import { SelfModifyAgent } from '../self-modify';

jest.mock('@/lib/db', () => ({
  db: {
    policyConfig: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    systemLog: {
      create: jest.fn(),
    },
  },
}));

jest.mock('../policy-store', () => ({
  getPolicy: jest.fn(),
  setPolicy: jest.fn(),
}));

jest.mock('../types', () => ({
  ...jest.requireActual('../types'),
  eventBus: { emit: jest.fn() },
}));

import { db } from '@/lib/db';
import { getPolicy, setPolicy } from '../policy-store';
const mockDb = db as jest.Mocked<typeof db>;
const mockGetPolicy = getPolicy as jest.Mock;
const mockSetPolicy = setPolicy as jest.Mock;

describe('SelfModifyAgent', () => {
  let agent: SelfModifyAgent;

  beforeEach(() => {
    agent = new SelfModifyAgent();
    jest.clearAllMocks();
    // Default: no DB guardrails set (null min/max → use fallbacks)
    (mockDb.policyConfig.findUnique as jest.Mock).mockResolvedValue(null);
    (mockDb.systemLog.create as jest.Mock).mockResolvedValue({});
    mockSetPolicy.mockResolvedValue(undefined);
  });

  it('returns empty adjustments when no actions occurred', async () => {
    const result = await agent.evaluateAndAdapt({
      successCount: 0, failureCount: 0, avgSimilarity: 0.5,
      nodesCreated: 0, nodesReinforced: 0, edgesCreated: 0,
    });
    expect(result).toHaveLength(0);
    expect(mockSetPolicy).not.toHaveBeenCalled();
  });

  describe('Rule 1 — low success rate increases retries', () => {
    it('triggers when successRate < 0.5', async () => {
      mockGetPolicy
        .mockResolvedValueOnce(3)    // retry.max_attempts current
        .mockResolvedValueOnce(1000) // retry.backoff_ms current
        .mockResolvedValueOnce(0.01);// decay.base_rate (rule 6)

      const result = await agent.evaluateAndAdapt({
        successCount: 2, failureCount: 8, avgSimilarity: 0.3,
        nodesCreated: 0, nodesReinforced: 0, edgesCreated: 0,
      });

      const attemptsAdj = result.find(r => r.key === 'retry.max_attempts');
      expect(attemptsAdj).toBeDefined();
      expect(attemptsAdj!.newValue).toBe(4); // 3 + 1

      const backoffAdj = result.find(r => r.key === 'retry.backoff_ms');
      expect(backoffAdj).toBeDefined();
      expect(backoffAdj!.newValue).toBeCloseTo(1500); // 1000 * 1.5
    });

    it('clamps retry.max_attempts at DB max (fallback 5)', async () => {
      mockGetPolicy
        .mockResolvedValueOnce(5)    // already at max
        .mockResolvedValueOnce(1000)
        .mockResolvedValueOnce(0.01);

      const result = await agent.evaluateAndAdapt({
        successCount: 1, failureCount: 9, avgSimilarity: 0.3,
        nodesCreated: 0, nodesReinforced: 0, edgesCreated: 0,
      });

      const attemptsAdj = result.find(r => r.key === 'retry.max_attempts');
      expect(attemptsAdj!.newValue).toBe(5); // clamped at max
    });

    it('respects custom DB max guardrail', async () => {
      // DB says max is 3 for this policy
      (mockDb.policyConfig.findUnique as jest.Mock).mockImplementation(({ where }) => {
        if (where.key === 'retry.max_attempts') {
          return Promise.resolve({ minValue: 1, maxValue: 3 });
        }
        return Promise.resolve(null);
      });

      mockGetPolicy
        .mockResolvedValueOnce(3)    // already at DB max
        .mockResolvedValueOnce(500)
        .mockResolvedValueOnce(0.01);

      const result = await agent.evaluateAndAdapt({
        successCount: 1, failureCount: 9, avgSimilarity: 0.3,
        nodesCreated: 0, nodesReinforced: 0, edgesCreated: 0,
      });

      const attemptsAdj = result.find(r => r.key === 'retry.max_attempts');
      expect(attemptsAdj!.newValue).toBe(3); // clamped at DB max=3
    });
  });

  describe('Rule 2 — high success rate increases batch size', () => {
    it('triggers when successRate > 0.8 and totalActions > 10', async () => {
      mockGetPolicy.mockResolvedValueOnce(10); // routing.batch_size

      const result = await agent.evaluateAndAdapt({
        successCount: 18, failureCount: 2, avgSimilarity: 0.5,
        nodesCreated: 5, nodesReinforced: 5, edgesCreated: 0,
      });

      const batchAdj = result.find(r => r.key === 'routing.batch_size');
      expect(batchAdj).toBeDefined();
      expect(batchAdj!.newValue).toBe(15); // 10 + 5
    });

    it('does NOT trigger with fewer than 10 total actions', async () => {
      const result = await agent.evaluateAndAdapt({
        successCount: 9, failureCount: 1, avgSimilarity: 0.5,
        nodesCreated: 0, nodesReinforced: 0, edgesCreated: 0,
      });
      const batchAdj = result.find(r => r.key === 'routing.batch_size');
      expect(batchAdj).toBeUndefined();
    });
  });

  describe('Rule 5 — high similarity increases verify threshold', () => {
    it('triggers when avgSimilarity > 0.7', async () => {
      mockGetPolicy.mockResolvedValueOnce(0.7); // threshold.verify_confidence

      const result = await agent.evaluateAndAdapt({
        successCount: 5, failureCount: 5, avgSimilarity: 0.8,
        nodesCreated: 0, nodesReinforced: 0, edgesCreated: 0,
      });

      const verifyAdj = result.find(r => r.key === 'threshold.verify_confidence');
      expect(verifyAdj).toBeDefined();
      expect(verifyAdj!.newValue).toBeCloseTo(0.75);
    });

    it('clamps at DB max of 0.95', async () => {
      mockGetPolicy.mockResolvedValueOnce(0.93);
      (mockDb.policyConfig.findUnique as jest.Mock).mockImplementation(({ where }) => {
        if (where.key === 'threshold.verify_confidence') {
          return Promise.resolve({ minValue: 0.3, maxValue: 0.95 });
        }
        return Promise.resolve(null);
      });

      const result = await agent.evaluateAndAdapt({
        successCount: 5, failureCount: 5, avgSimilarity: 0.9,
        nodesCreated: 0, nodesReinforced: 0, edgesCreated: 0,
      });

      const verifyAdj = result.find(r => r.key === 'threshold.verify_confidence');
      expect(verifyAdj!.newValue).toBe(0.95); // clamped
    });
  });
});
