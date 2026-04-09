/**
 * Unit tests for policy-store
 */

jest.mock('@/lib/db', () => ({
  db: {
    policyConfig: {
      count: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

jest.mock('../types', () => ({
  DEFAULT_POLICIES: {
    'routing.batch_size': { value: 10, category: 'routing', valueType: 'number', minValue: 1, maxValue: 50 },
    'retry.max_attempts': { value: 3, category: 'retry', valueType: 'number', minValue: 1, maxValue: 5 },
  },
}));

import { db } from '@/lib/db';
import { getPolicy, setPolicy, adjustPolicy, ensurePolicies, getAllPolicies } from '../policy-store';
const mockDb = db as jest.Mocked<typeof db>;

describe('policy-store', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('ensurePolicies()', () => {
    it('seeds default policies when DB is empty', async () => {
      // Reset module-level initialized flag by reimporting
      jest.resetModules();
      const { ensurePolicies: freshEnsure } = await import('../policy-store');
      (mockDb.policyConfig.count as jest.Mock).mockResolvedValue(0);
      (mockDb.policyConfig.create as jest.Mock).mockResolvedValue({});
      await freshEnsure();
      expect(mockDb.policyConfig.create).toHaveBeenCalledTimes(2); // 2 default policies in mock
    });

    it('skips seeding when policies already exist', async () => {
      jest.resetModules();
      const { ensurePolicies: freshEnsure } = await import('../policy-store');
      (mockDb.policyConfig.count as jest.Mock).mockResolvedValue(5);
      await freshEnsure();
      expect(mockDb.policyConfig.create).not.toHaveBeenCalled();
    });
  });

  describe('getPolicy()', () => {
    it('returns numeric value from DB', async () => {
      (mockDb.policyConfig.findUnique as jest.Mock).mockResolvedValue({ value: 42 });
      const val = await getPolicy('routing.batch_size');
      expect(val).toBe(42);
    });

    it('returns 0 when policy not found', async () => {
      (mockDb.policyConfig.findUnique as jest.Mock).mockResolvedValue(null);
      const val = await getPolicy('nonexistent.key');
      expect(val).toBe(0);
    });
  });

  describe('setPolicy()', () => {
    it('upserts the policy value', async () => {
      (mockDb.policyConfig.upsert as jest.Mock).mockResolvedValue({});
      await setPolicy('routing.batch_size', 20);
      const call = (mockDb.policyConfig.upsert as jest.Mock).mock.calls[0][0];
      expect(call.where.key).toBe('routing.batch_size');
      expect(call.update.value).toBe(20);
    });
  });

  describe('adjustPolicy()', () => {
    it('adjusts value by delta with DB guardrails', async () => {
      (mockDb.policyConfig.findUnique as jest.Mock).mockResolvedValue({
        value: 10, minValue: 1, maxValue: 50,
      });
      (mockDb.policyConfig.upsert as jest.Mock).mockResolvedValue({});

      await adjustPolicy('routing.batch_size', 5);
      const call = (mockDb.policyConfig.upsert as jest.Mock).mock.calls[0][0];
      expect(call.update.value).toBe(15);
    });

    it('clamps at DB maxValue', async () => {
      (mockDb.policyConfig.findUnique as jest.Mock).mockResolvedValue({
        value: 48, minValue: 1, maxValue: 50,
      });
      (mockDb.policyConfig.upsert as jest.Mock).mockResolvedValue({});

      await adjustPolicy('routing.batch_size', 10); // would be 58, but clamped at 50
      const call = (mockDb.policyConfig.upsert as jest.Mock).mock.calls[0][0];
      expect(call.update.value).toBe(50);
    });

    it('clamps at DB minValue', async () => {
      (mockDb.policyConfig.findUnique as jest.Mock).mockResolvedValue({
        value: 2, minValue: 1, maxValue: 50,
      });
      (mockDb.policyConfig.upsert as jest.Mock).mockResolvedValue({});

      await adjustPolicy('routing.batch_size', -5); // would be -3, clamped at 1
      const call = (mockDb.policyConfig.upsert as jest.Mock).mock.calls[0][0];
      expect(call.update.value).toBe(1);
    });
  });

  describe('getAllPolicies()', () => {
    it('returns mapped policy entries with minValue/maxValue', async () => {
      (mockDb.policyConfig.count as jest.Mock).mockResolvedValue(1);
      (mockDb.policyConfig.findMany as jest.Mock).mockResolvedValue([
        { key: 'routing.batch_size', value: 10, valueType: 'number', category: 'routing', minValue: 1, maxValue: 50 },
      ]);
      const policies = await getAllPolicies();
      expect(policies).toHaveLength(1);
      expect(policies[0].minValue).toBe(1);
      expect(policies[0].maxValue).toBe(50);
    });
  });
});
