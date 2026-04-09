import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100');
    const category = searchParams.get('category');
    const level = searchParams.get('level');

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (level) where.level = level;

    const logs = await db.systemLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });

    return NextResponse.json({
      success: true,
      logs: logs.map(l => ({
        id: l.id,
        eventType: l.eventType,
        category: l.category,
        level: l.level,
        payload: JSON.parse(l.payload),
        nodeId: l.nodeId,
        agentName: l.agentName,
        createdAt: l.createdAt.toISOString(),
      })),
      total: await db.systemLog.count({ where }),
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
