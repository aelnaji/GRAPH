import { NextResponse } from 'next/server';
import { getOrchestrator } from '@/lib/agents';

export async function GET() {
  try {
    const orchestrator = getOrchestrator();
    const graphData = await orchestrator.getGraphData();

    return NextResponse.json({
      success: true,
      ...graphData,
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
