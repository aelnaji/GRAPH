import { db } from '@/lib/db';
import { DEFAULT_POLICIES } from './types';
import type { PolicyEntry } from './types';

// Initialize default policies on first load
let policiesInitialized = false;

export async function ensurePolicies(): Promise<void> {
  if (policiesInitialized) return;
  
  const count = await db.policyConfig.count();
  if (count === 0) {
    for (const [key, config] of Object.entries(DEFAULT_POLICIES)) {
      await db.policyConfig.create({
        data: {
          key,
          value: JSON.stringify(config.value),
          valueType: config.valueType as 'number',
          category: config.category as 'routing',
        },
      });
    }
  }
  policiesInitialized = true;
}

export async function getPolicy(key: string): Promise<number> {
  const policy = await db.policyConfig.findUnique({ where: { key } });
  if (!policy) return 0;
  return JSON.parse(policy.value) as number;
}

export async function setPolicy(key: string, value: unknown): Promise<void> {
  await db.policyConfig.upsert({
    where: { key },
    update: { value: JSON.stringify(value), updatedAt: new Date() },
    create: { key, value: JSON.stringify(value), valueType: typeof value as 'number' },
  });
}

export async function getAllPolicies(): Promise<PolicyEntry[]> {
  await ensurePolicies();
  const policies = await db.policyConfig.findMany({ orderBy: { key: 'asc' } });
  return policies.map(p => ({
    key: p.key,
    value: JSON.parse(p.value),
    valueType: p.valueType as 'number',
    category: p.category as 'routing',
  }));
}

export async function adjustPolicy(
  key: string,
  delta: number,
  min: number = 0,
  max: number = 2
): Promise<void> {
  const current = await getPolicy(key);
  const adjusted = Math.min(max, Math.max(min, current + delta));
  await setPolicy(key, adjusted);
}
