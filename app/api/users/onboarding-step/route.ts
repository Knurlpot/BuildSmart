import { NextRequest, NextResponse } from "next/server";
import { readSession, setSessionCookie } from "@/lib/server/session";

type Body = {
  step?: number;
};

export async function PATCH(request: NextRequest) {
  const session = readSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Body;
  const step = Number(body.step);
  if (!Number.isFinite(step) || step < 0) {
    return NextResponse.json({ error: "Invalid onboarding step" }, { status: 400 });
  }

  const response = NextResponse.json({ onboardingStep: step });
  setSessionCookie(response, session.userId, step);
  return response;
}