import fs from 'node:fs/promises';
import path from 'node:path';

import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const skeletonPath = path.join(process.cwd(), 'python', 'templates', 'solver_skeleton.py');
    const content = await fs.readFile(skeletonPath, 'utf8');
    return new NextResponse(content, {
      status: 200,
      headers: { 'Content-Type': 'text/x-python; charset=utf-8' },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Cannot read solver skeleton',
      },
      { status: 500 }
    );
  }
}
