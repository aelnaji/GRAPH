import { db } from '@/lib/db';
import { eventBus } from './types';
import { getPolicy, setPolicy } from './policy-store';
import type { SystemLogEntry } from './types';

/**
 * Self-modify agent: adjusts routing weights, retry thresholds, attention gates.
 * NEVER modifies base model parameters — only system policies.
 * All numeric bounds are read from PolicyConfig.minValue / maxValue in the DB.
 * Hardcoded fallback bounds are used only if the DB has no guardrails set.
 */
export class SelfModifyAgent {
  name = 'self-modify';

  async evaluateAndAdapt(cycleStats: {
    successCount: number;
    failureCount: number;
    avgSimilarity: number;
    nodesCreated: number;
    nodesReinforced: number;
    edgesCreated: number;
  }): Promise<Array<{ key: string; oldValue: number; newValue: number; reason: string }>> {
    const adjustments: Array<{ key: string; oldValue: number; newValue: number; reason: string }> = [];

    const totalActions = cycleStats.successCount + cycleStats.failureCount;
    if (totalActions === 0) return adjustments;

    const successRate = cycleStats.successCount / totalActions;

    // Helper: read DB guardrails for a key, fall back to provided defaults
    const getBounds = async (key: string, fallbackMin: number, fallbackMax: number) => {
      const policy = await db.policyConfig.findUnique({ where: { key } });
      return {
        min: policy?.minValue ?? fallbackMin,
        max: policy?.maxValue ?? fallbackMax,
      };
    };

    // Rule 1: High failure rate → increase retry limits and backoff
    if (successRate < 0.5) {
      const maxAttemptsKey = 'retry.max_attempts';
      const { min: minA, max: maxA } = await getBounds(maxAttemptsKey, 1, 5);
      const maxAttempts = await getPolicy(maxAttemptsKey);
      const newAttempts = Math.min(maxA, Math.max(minA, maxAttempts + 1));
      adjustments.push({ key: maxAttemptsKey, oldValue: maxAttempts, newValue: newAttempts, reason: 'low_success_rate_increase_retries' });

      const backoffKey = 'retry.backoff_ms';
      const { min: minB, max: maxB } = await getBounds(backoffKey, 100, 5000);
      const backoff = await getPolicy(backoffKey);
      const newBackoff = Math.min(maxB, Math.max(minB, backoff * 1.5));
      adjustments.push({ key: backoffKey, oldValue: backoff, newValue: newBackoff, reason: 'low_success_rate_increase_backoff' });
    }

    // Rule 2: High success rate → increase batch size for efficiency
    if (successRate > 0.8 && totalActions > 10) {
      const batchKey = 'routing.batch_size';
      const { min: minBatch, max: maxBatch } = await getBounds(batchKey, 1, 50);
      const batchSize = await getPolicy(batchKey);
      const newBatch = Math.min(maxBatch, Math.max(minBatch, batchSize + 5));
      adjustments.push({ key: batchKey, oldValue: batchSize, newValue: newBatch, reason: 'high_success_rate_increase_batch' });
    }

    // Rule 3: High novelty → lower link threshold to increase connectivity
    if (cycleStats.nodesCreated > cycleStats.nodesReinforced * 2) {
      const linkKey = 'threshold.link_similarity';
      const { min: minL, max: maxL } = await getBounds(linkKey, 0.1, 0.9);
      const linkThreshold = await getPolicy(linkKey);
      const newLink = Math.min(maxL, Math.max(minL, linkThreshold - 0.05));
      adjustments.push({ key: linkKey, oldValue: linkThreshold, newValue: newLink, reason: 'high_novelty_lower_link_threshold' });
    }

    // Rule 4: Many edges created → increase self-modify weight to learn faster
    if (cycleStats.edgesCreated > 5) {
      const smKey = 'routing.selfmodify_weight';
      const { min: minSM, max: maxSM } = await getBounds(smKey, 0.1, 2.0);
      const smWeight = await getPolicy(smKey);
      const newSM = Math.min(maxSM, Math.max(minSM, smWeight + 0.1));
      adjustments.push({ key: smKey, oldValue: smWeight, newValue: newSM, reason: 'high_connectivity_increase_learning' });
    }

    // Rule 5: High similarity average → increase verify threshold (more selective)
    if (cycleStats.avgSimilarity > 0.7) {
      const verifyKey = 'threshold.verify_confidence';
      const { min: minV, max: maxV } = await getBounds(verifyKey, 0.3, 0.95);
      const verifyThreshold = await getPolicy(verifyKey);
      const newVerify = Math.min(maxV, Math.max(minV, verifyThreshold + 0.05));
      adjustments.push({ key: verifyKey, oldValue: verifyThreshold, newValue: newVerify, reason: 'high_similarity_increase_verify_threshold' });
    }

    // Apply all adjustments
    for (const adj of adjustments) {
      await setPolicy(adj.key, adj.newValue);
      await this.logPolicyChange(adj.key, adj.oldValue, adj.newValue, adj.reason);
    }

    // Rule 6: Many adjustments → increase decay to prune faster
    if (adjustments.length >= 3) {
      const decayKey = 'decay.base_rate';
      const { min: minD, max: maxD } = await getBounds(decayKey, 0.001, 0.05);
      const decayRate = await getPolicy(decayKey);
      const newDecay = Math.min(maxD, Math.max(minD, decayRate + 0.005));
      adjustments.push({ key: decayKey, oldValue: decayRate, newValue: newDecay, reason: 'many_adjustments_increase_pruning' });
      await setPolicy(decayKey, newDecay);
    }

    return adjustments;
  }

  private async logPolicyChange(key: string, oldValue: number, newValue: number, reason: string): Promise<void> {
    await db.systemLog.create({
      data: {
        eventType: 'policy_update',
        category: 'policy',
        level: 'info',
        payload: { key, oldValue, newValue, reason } as any,
        agentName: this.name,
      },
    });

    eventBus.emit({
      type: 'state_shift',
      data: { type: 'policy_update', key, oldValue, newValue, reason },
      timestamp: Date.now(),
    });
  }

  async getRoutingWeights(): Promise<Record<string, number>> {
    const keys = [
      'routing.perception_weight',
      'routing.memory_weight',
      'routing.state_weight',
      'routing.selfmodify_weight',
    ];
    const weights: Record<string, number> = {};
    for (const key of keys) weights[key] = await getPolicy(key);
    return weights;
  }

  async getThresholds(): Promise<Record<string, number>> {
    const keys = [
      'threshold.verify_confidence',
      'threshold.promote_confidence',
      'threshold.novelty_floor',
      'threshold.link_similarity',
      'attention.gate_threshold',
    ];
    const thresholds: Record<string, number> = {};
    for (const key of keys) thresholds[key] = await getPolicy(key);
    return thresholds;
  }

  async resetPolicies(): Promise<void> {
    const { DEFAULT_POLICIES } = await import('./types');
    for (const [key, config] of Object.entries(DEFAULT_POLICIES)) {
      await setPolicy(key, config.value);
    }
    await db.systemLog.create({
      data: {
        eventType: 'policy_reset',
        category: 'policy',
        level: 'warn',
        payload: { message: 'All policies reset to defaults' } as any,
        agentName: this.name,
      },
    });
  }
}
