import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey } = body;

    if (!apiKey || typeof apiKey !== "string") {
      return NextResponse.json(
        { valid: false, error: "API key không hợp lệ" },
        { status: 400 }
      );
    }

    // Basic validation - key should be non-empty and have reasonable length
    const trimmed = apiKey.trim();
    if (trimmed.length < 10) {
      return NextResponse.json(
        { valid: false, error: "API key quá ngắn" },
        { status: 400 }
      );
    }

    // For now, accept any key with reasonable length
    // In production, this would verify against an actual API
    return NextResponse.json({ valid: true });
  } catch {
    return NextResponse.json(
      { valid: false, error: "Lỗi xác minh API key" },
      { status: 500 }
    );
  }
}
