import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/server/db";
import { verifyPassword } from "@/lib/server/password";
import { setSessionCookie } from "@/lib/server/session";
import { toAuthUser, type UserRow } from "@/lib/server/entities";
import { resolvePersistedOnboardingStep } from "@/lib/server/onboarding";

type LoginBody = {
  email?: string;
  password?: string;
};

const MAX_LOGIN_ATTEMPTS = 3;
const LOCK_DURATION_MINUTES = 30;

export async function POST(request: NextRequest) {
  const body = (await request.json()) as LoginBody;
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const result = await pool.query<UserRow>(
    `SELECT user_id, company_id, last_name, first_name, middle_name, email, password, user_role, status, created_at, failed_login_attempts, locked_until
     FROM users
     WHERE email = $1
     LIMIT 1`,
    [email]
  );

  const user = result.rows[0];
  
  // Check if user exists
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Check if account is locked
  if (user.locked_until) {
    const lockExpiryTime = new Date(user.locked_until);
    const currentTime = new Date();

    if (currentTime < lockExpiryTime) {
      const minutesRemaining = Math.ceil((lockExpiryTime.getTime() - currentTime.getTime()) / (1000 * 60));
      return NextResponse.json(
        { 
          error: `Account is temporarily locked due to multiple failed login attempts. Please try again in ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}.`,
          isLocked: true
        }, 
        { status: 401 }
      );
    } else {
      // Lock period has expired, reset the lock
      await pool.query(
        `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE user_id = $1`,
        [user.user_id]
      );
      user.failed_login_attempts = 0;
      user.locked_until = null;
    }
  }

  // Verify password
  if (!(await verifyPassword(password, user.password))) {
    // Increment failed login attempts
    const newAttempts = user.failed_login_attempts + 1;
    let lockTime = null;

    if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
      // Lock the account for 30 minutes
      lockTime = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000).toISOString();
      await pool.query(
        `UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE user_id = $3`,
        [newAttempts, lockTime, user.user_id]
      );

      return NextResponse.json(
        { 
          error: `Account is locked due to multiple failed login attempts. Please try again in ${LOCK_DURATION_MINUTES} minutes.`,
          isLocked: true,
          attemptsRemaining: 0
        }, 
        { status: 401 }
      );
    } else {
      // Update failed attempts
      const attemptsRemaining = MAX_LOGIN_ATTEMPTS - newAttempts;
      await pool.query(
        `UPDATE users SET failed_login_attempts = $1 WHERE user_id = $2`,
        [newAttempts, user.user_id]
      );

      return NextResponse.json(
        { 
          error: `Invalid credentials. ${attemptsRemaining} attempt${attemptsRemaining !== 1 ? 's' : ''} remaining before account lockout.`,
          attemptsRemaining
        }, 
        { status: 401 }
      );
    }
  }

  // Login successful - reset failed attempts and lock status
  await pool.query(
    `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE user_id = $1`,
    [user.user_id]
  );

  const onboardingStep = await resolvePersistedOnboardingStep(user.company_id);
  const response = NextResponse.json({ user: toAuthUser(user, onboardingStep) });
  setSessionCookie(response, user.user_id, onboardingStep);
  return response;
}
