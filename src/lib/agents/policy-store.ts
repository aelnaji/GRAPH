import { db } from '@/lib/db';
import { DEFAULT_POLICIES } from './types';
import type { PolicyEntry } from './types';

let policiesInitialized = false;

export async function ensurePolicies(): Promise<void> {
  if (policiesInitialized) return;

  const count = await db.policyConfig.count();
  if (count === 0) {
    for (const [key, config] of Object.entries(DEFAULT_POLICIES)) {
      await db.policyConfig.create({
        data: {
          key,
          value: config.value,         // Native JSON — no JSON.stringify
          valueType: config.valueType,
          category: config.category,
          minValue: config.minValue ?? null,
          maxValue: config.maxValue ?? null,
        },
      });
    }
  }
  policiesInitialized = true;
}

export async function getPolicy(key: string): Promise<number> {
  const policy = await db.policyConfig.findUnique({ where: { key } });
  if (!policy) return 0;
  // value is now native JSON — cast directly
  return policy.value as unknown as number;
}

export async function setPolicy(key: string, value: unknown): Promise<void> {
  await db.policyConfig.upsert({
    where: { key },
    update: { value: value as any, updatedAt: new Date() },
    create: {
      key,
      value: value as any,
      valueType: typeof value,
    },
  });
}

export async function getAllPolicies(): Promise<PolicyEntry[]> {
  await ensurePolicies();
  const policies = await db.policyConfig.findMany({ orderBy: { key: 'asc' } });
  return policies.map(p => ({
    key: p.key,
    value: p.value,                    // Already a parsed JS value
    valueType: p.valueType as 'number',
    category: p.category as 'routing',
    minValue: p.minValue,
    maxValue: p.maxValue,
  }));
}

/**
 * Adjust a policy by a delta, clamping to DB-stored min/max if available,
 * otherwise falling back to the provided fallback bounds.
 */
export async function adjustPolicy(
  key: string,
  delta: number,
  fallbackMin: number = 0,
  fallbackMax: number = 2
): Promise<void> {
  const policy = await db.policyConfig.findUnique({ where: { key } });
  const current = policy ? (policy.value as unknown as number) : 0;
  const min = policy?.minValue ?? fallbackMin;
  const max = policy?.maxValue ?? fallbackMax;
  const adjusted = Math.min(max, Math.max(min, current + delta));
  await setPolicy(key, adjusted);
}
