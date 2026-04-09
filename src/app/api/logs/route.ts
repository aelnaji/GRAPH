import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const page = Math.max(parseInt(searchParams.get('page') || '1'), 1);
    const skip = (page - 1) * limit;
    const category = searchParams.get('category');
    const level = searchParams.get('level');
    const eventType = searchParams.get('eventType');

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (level) where.level = level;
    if (eventType) where.eventType = eventType;

    const [logs, total] = await Promise.all([
      db.systemLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      db.systemLog.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      logs: logs.map(l => ({
        id: l.id,
        eventType: l.eventType,
        category: l.category,
        level: l.level,
        // payload is already a JSON object after Prisma Json migration — no JSON.parse needed
        payload: l.payload,
        nodeId: l.nodeId,
        agentName: l.agentName,
        createdAt: l.createdAt.toISOString(),
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      timestamp: Date.now(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
