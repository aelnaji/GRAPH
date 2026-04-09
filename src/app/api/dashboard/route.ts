import { NextResponse } from 'next/server';
import { getOrchestrator } from '@/lib/agents';

export async function GET() {
  try {
    const orchestrator = getOrchestrator();
    const state = await orchestrator.getCognitionState();

    // Also get system health from state-emotion
    const { StateEmotionAgent } = await import('@/lib/agents/state-emotion');
    const stateAgent = new StateEmotionAgent();
    const systemHealth = await stateAgent.evaluateSystemState();

    // Get attention profile
    const attention = await stateAgent.getAttentionProfile(5);

    // Get routing weights
    const { SelfModifyAgent } = await import('@/lib/agents/self-modify');
    const smAgent = new SelfModifyAgent();
    const routingWeights = await smAgent.getRoutingWeights();
    const thresholds = await smAgent.getThresholds();

    return NextResponse.json({
      success: true,
      state,
      systemHealth,
      attention,
      routingWeights,
      thresholds,
      timestamp: Date.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// Trigger maintenance cycle
export async function POST() {
  try {
    const orchestrator = getOrchestrator();
    const result = await orchestrator.maintenanceCycle();

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: Date.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
