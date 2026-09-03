import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { resolvePersistedOnboardingStep } from "@/lib/server/onboarding";
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

  const user = await pool.query<{ company_id: number }>("SELECT company_id FROM users WHERE user_id = $1 LIMIT 1", [
    session.userId,
  ]);
  const companyId = user.rows[0]?.company_id;
  if (!companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const persistedStep = await resolvePersistedOnboardingStep(companyId);
  const onboardingStep = Math.min(step, persistedStep);
  const response = NextResponse.json({ onboardingStep });
  setSessionCookie(response, session.userId, onboardingStep);
  return response;
}
