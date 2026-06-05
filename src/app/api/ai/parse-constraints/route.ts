import { NextResponse } from 'next/server';

import { parseConstraintDrafts } from '@/features/timetable/ai/constraint-parse-service';
import type { AgentInputPayload, AIProviderConfig } from '@/features/timetable/ai/types';

type ParseConstraintsRequest = {
  input: AgentInputPayload;
  providerConfig: AIProviderConfig;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ParseConstraintsRequest;
    if (!body?.input || !body?.providerConfig) {
      return NextResponse.json({ error: 'Thiếu input hoặc providerConfig.' }, { status: 400 });
    }
    if (!body.providerConfig.apiKey || !body.providerConfig.model) {
      return NextResponse.json({ error: 'providerConfig cần apiKey và model.' }, { status: 400 });
    }
    const drafts = await parseConstraintDrafts(body.input, body.providerConfig);
    const warnings = drafts.flatMap((d) => d.issues.map((i) => i.message));
    return NextResponse.json({ drafts, warnings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Parse constraints failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
