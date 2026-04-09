import { NextRequest, NextResponse } from 'next/server';
import { getAllPolicies, setPolicy } from '@/lib/agents/policy-store';
import { ensurePolicies } from '@/lib/agents/policy-store';

export async function GET() {
  try {
    await ensurePolicies();
    const policies = await getAllPolicies();

    return NextResponse.json({
      success: true,
      policies,
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

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { error: 'Key and value are required' },
        { status: 400 }
      );
    }

    await setPolicy(key, value);

    return NextResponse.json({
      success: true,
      key,
      value,
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
