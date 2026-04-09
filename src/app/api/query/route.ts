import { NextRequest, NextResponse } from 'next/server';
import { getOrchestrator } from '@/lib/agents';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, maxResults = 20, minConfidence = 0.1 } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    const orchestrator = getOrchestrator();
    const result = await orchestrator.processInput({
      content: query,
      source: 'manual',
    });

    // Also do a graph query for related knowledge
    const memoryAgent = (await import('@/lib/agents/memory')).MemoryAgent;
    const memory = new memoryAgent();
    const graphResult = await memory.query(query, maxResults, minConfidence);

    return NextResponse.json({
      success: true,
      ingestResult: result,
      relatedKnowledge: graphResult,
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

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');
  const maxResults = parseInt(searchParams.get('limit') || '20');
  const minConfidence = parseFloat(searchParams.get('min_confidence') || '0.1');

  if (!query) {
    return NextResponse.json(
      { error: 'Query parameter "q" is required' },
      { status: 400 }
    );
  }

  try {
    const { MemoryAgent } = await import('@/lib/agents/memory');
    const memory = new MemoryAgent();
    const result = await memory.query(query, maxResults, minConfidence);

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
