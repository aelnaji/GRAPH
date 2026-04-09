import { db } from '@/lib/db';
import { eventBus } from './types';
import { getPolicy, setPolicy, adjustPolicy } from './policy-store';
import type { SystemLogEntry } from './types';

// Self-modify agent: adjusts routing weights, retry thresholds, attention gates
// NEVER modifies base model parameters - only system policies
export class SelfModifyAgent {
  name = 'self-modify';

  // Run after each cognition cycle to evaluate and adjust policies
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

    // Rule 1: High failure rate → increase retry limits and backoff
    if (successRate < 0.5) {
      const maxAttempts = await getPolicy('retry.max_attempts');
      const newValue = Math.min(5, maxAttempts + 1);
      adjustments.push({ key: 'retry.max_attempts', oldValue: maxAttempts, newValue, reason: 'low_success_rate_increase_retries' });
      
      const backoff = await getPolicy('retry.backoff_ms');
      const newBackoff = Math.min(5000, backoff * 1.5);
      adjustments.push({ key: 'retry.backoff_ms', oldValue: backoff, newValue: newBackoff, reason: 'low_success_rate_increase_backoff' });
    }

    // Rule 2: High success rate → increase batch size for efficiency
    if (successRate > 0.8 && totalActions > 10) {
      const batchSize = await getPolicy('routing.batch_size');
      const newValue = Math.min(50, batchSize + 5);
      adjustments.push({ key: 'routing.batch_size', oldValue: batchSize, newValue, reason: 'high_success_rate_increase_batch' });
    }

    // Rule 3: High novelty (many new nodes) → lower link threshold to increase connectivity
    if (cycleStats.nodesCreated > cycleStats.nodesReinforced * 2) {
      const linkThreshold = await getPolicy('threshold.link_similarity');
      const newValue = Math.max(0.3, linkThreshold - 0.05);
      adjustments.push({ key: 'threshold.link_similarity', oldValue: linkThreshold, newValue, reason: 'high_novelty_lower_link_threshold' });
    }

    // Rule 4: Many edges created → increase self-modify weight to learn faster
    if (cycleStats.edgesCreated > 5) {
      const smWeight = await getPolicy('routing.selfmodify_weight');
      const newValue = Math.min(2, smWeight + 0.1);
      adjustments.push({ key: 'routing.selfmodify_weight', oldValue: smWeight, newValue, reason: 'high_connectivity_increase_learning' });
    }

    // Rule 5: High similarity average → increase verify threshold (more selective)
    if (cycleStats.avgSimilarity > 0.7) {
      const verifyThreshold = await getPolicy('threshold.verify_confidence');
      const newValue = Math.min(0.9, verifyThreshold + 0.05);
      adjustments.push({ key: 'threshold.verify_confidence', oldValue: verifyThreshold, newValue, reason: 'high_similarity_increase_verify_threshold' });
    }

    // Apply all adjustments
    for (const adj of adjustments) {
      await setPolicy(adj.key, adj.newValue);
      await this.logPolicyChange(adj.key, adj.oldValue, adj.newValue, adj.reason);
    }

    // Rule 6: If many adjustments, increase decay to prune faster
    if (adjustments.length >= 3) {
      const decayRate = await getPolicy('decay.base_rate');
      const newValue = Math.min(0.05, decayRate + 0.005);
      adjustments.push({ key: 'decay.base_rate', oldValue: decayRate, newValue, reason: 'many_adjustments_increase_pruning' });
      await setPolicy('decay.base_rate', newValue);
    }

    return adjustments;
  }

  // Log a policy change
  private async logPolicyChange(key: string, oldValue: number, newValue: number, reason: string): Promise<void> {
    await db.systemLog.create({
      data: {
        eventType: 'policy_update',
        category: 'policy',
        level: 'info',
        payload: JSON.stringify({ key, oldValue, newValue, reason }),
        agentName: this.name,
      },
    });

    eventBus.emit({
      type: 'state_shift',
      data: {
        type: 'policy_update',
        key,
        oldValue,
        newValue,
        reason,
      },
      timestamp: Date.now(),
    });
  }

  // Get current routing weights
  async getRoutingWeights(): Promise<Record<string, number>> {
    const keys = [
      'routing.perception_weight',
      'routing.memory_weight',
      'routing.state_weight',
      'routing.selfmodify_weight',
    ];

    const weights: Record<string, number> = {};
    for (const key of keys) {
      weights[key] = await getPolicy(key);
    }
    return weights;
  }

  // Get current thresholds
  async getThresholds(): Promise<Record<string, number>> {
    const keys = [
      'threshold.verify_confidence',
      'threshold.promote_confidence',
      'threshold.novelty_floor',
      'threshold.link_similarity',
      'attention.gate_threshold',
    ];

    const thresholds: Record<string, number> = {};
    for (const key of keys) {
      thresholds[key] = await getPolicy(key);
    }
    return thresholds;
  }

  // Reset all policies to defaults (safety mechanism)
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
        payload: JSON.stringify({ message: 'All policies reset to defaults' }),
        agentName: this.name,
      },
    });
  }
}
