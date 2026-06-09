import { NextResponse } from 'next/server';

import type { AgentInputPayload, AIProviderConfig } from '@/features/timetable/ai/types';
import { analyzeConstraint } from '@/features/timetable/ai/analyze-constraint-service';

type AnalyzeConstraintRequest = {
  rawText: string;
  constraintType: 'required' | 'preferred';
  weight?: number;
  agentInput: AgentInputPayload;
  providerConfig: AIProviderConfig;
  previousAttempts?: Array<{
    displayText: string;
    source: 'built_in' | 'semantic';
    confidence: 'high' | 'medium' | 'low';
  }>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyzeConstraintRequest;

    if (!body?.rawText || !body?.constraintType || !body?.agentInput || !body?.providerConfig) {
      return NextResponse.json(
        { error: 'Thiếu rawText, constraintType, agentInput hoặc providerConfig.' },
        { status: 400 }
      );
    }

    if (!body.providerConfig.apiKey || !body.providerConfig.model) {
      return NextResponse.json(
        { error: 'providerConfig cần apiKey và model.' },
        { status: 400 }
      );
    }

    const result = await analyzeConstraint(
      body.rawText,
      body.constraintType,
      body.weight,
      body.agentInput,
      body.providerConfig,
      { previousAttempts: body.previousAttempts }
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analyze constraint failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
