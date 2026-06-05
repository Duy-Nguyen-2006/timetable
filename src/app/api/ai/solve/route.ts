import { NextResponse } from 'next/server';

import { runLocalAgent } from '@/features/timetable/ai/local-agent';
import type { ConfirmedSolveRequest } from '@/features/timetable/ai/solver-constraint-gate';
import {
  constraintItemsToRaw,
  validateConfirmedSolveRequest,
} from '@/features/timetable/ai/solver-constraint-gate';
import type { LocalAgentConfig } from '@/features/timetable/ai/types';
import type { ParsedConstraintDraft } from '@/features/timetable/ai/constraint-review-types';

type SolveRequestBody = ConfirmedSolveRequest & {
  providerConfig: LocalAgentConfig;
  /** Optional drafts from parse step (for preflight). */
  constraintDrafts?: ParsedConstraintDraft[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SolveRequestBody;
    if (!body?.input || !body?.providerConfig || !Array.isArray(body.confirmedConstraints)) {
      return NextResponse.json({ error: 'Thiếu input, providerConfig hoặc confirmedConstraints.' }, { status: 400 });
    }

    const rawConstraints = constraintItemsToRaw(
      body.confirmedConstraints.map((c) => {
        const spec = c.specs[0];
        const type = spec?.severity === 'soft' ? ('preferred' as const) : ('required' as const);
        return {
          id: c.rawConstraintId,
          type,
          text: spec?.original ?? c.summary,
          weight: c.specs.find((s) => s.weight != null)?.weight,
        };
      })
    );

    const gate = validateConfirmedSolveRequest(
      rawConstraints,
      body.constraintDrafts ?? [],
      { input: body.input, confirmedConstraints: body.confirmedConstraints }
    );

    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.error, messages: gate.messages, warnings: gate.warnings },
        { status: gate.status }
      );
    }

    const { onEvent: _ignored, ...agentConfig } = body.providerConfig;
    const agentResult = await runLocalAgent(gate.agentInput, agentConfig, {
      preTranslatedConstraintSpecs: gate.preTranslatedSpecs,
    });

    if (!agentResult.success) {
      return NextResponse.json(
        { error: agentResult.error ?? 'Solver failed', warnings: gate.warnings },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      finalResult: agentResult.finalResult,
      warnings: gate.warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Solve failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
