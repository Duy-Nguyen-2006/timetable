import { NextResponse } from 'next/server';

import {
  buildCustomNormalizationInput,
  normalizeCustomConstraint,
  type CustomConstraintSeverity,
} from '@/features/timetable/ai/custom-normalization-service';
import type { AgentInputPayload, AIProviderConfig } from '@/features/timetable/ai/types';

type NormalizeCustomConstraintRequest = {
  request: {
    severity: CustomConstraintSeverity;
    originalText: string;
  };
  providerConfig: AIProviderConfig;
  agentInput: AgentInputPayload;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as NormalizeCustomConstraintRequest;

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

    if (!['hard', 'soft'].includes(body.request.severity)) {
      return NextResponse.json(
        { error: 'severity phải là hard hoặc soft.' },
        { status: 400 }
      );
    }

    const result = await normalizeCustomConstraint(
      buildCustomNormalizationInput(
        body.request.severity,
        body.request.originalText,
        body.agentInput
      ),
      body.providerConfig
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Normalize custom constraint failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
