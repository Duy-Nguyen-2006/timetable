import { NextResponse } from 'next/server';

import type { AgentInputPayload, AIProviderConfig } from '@/features/timetable/ai/types';
import {
  reparseRejectedConstraint,
  type ReparseRejectedConstraintRequest,
} from '@/features/timetable/ai/constraint-reparse-service';

type ReparseConstraintRequest = {
  request: ReparseRejectedConstraintRequest;
  providerConfig: AIProviderConfig;
  agentInput: AgentInputPayload;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ReparseConstraintRequest;

    if (!body?.request || !body?.providerConfig || !body?.agentInput) {
      return NextResponse.json(
        { error: 'Thiếu request, providerConfig hoặc agentInput.' },
        { status: 400 }
      );
    }

    if (!body.providerConfig.apiKey || !body.providerConfig.model) {
      return NextResponse.json(
        { error: 'providerConfig cần apiKey và model.' },
        { status: 400 }
      );
    }

    const result = await reparseRejectedConstraint(
      body.request,
      body.providerConfig,
      body.agentInput
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reparse constraint failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
