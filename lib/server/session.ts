import "server-only";

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "buildsmart_session";
const SECRET = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || "buildsmart-dev-secret";

function base64UrlEncode(value: string): string {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function createSessionToken(userId: number, onboardingStep = 0): string {
  const payload = JSON.stringify({ userId, onboardingStep, issuedAt: Date.now() });
  return `${base64UrlEncode(payload)}.${sign(payload)}`;
}

export function readSession(request: NextRequest): { userId: number; onboardingStep: number } | null {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  let payload = "";
  try {
    payload = base64UrlDecode(encodedPayload);
  } catch {
    return null;
  }

  if (sign(payload) !== signature) return null;

  try {
    const parsed = JSON.parse(payload) as { userId?: unknown; onboardingStep?: unknown };
    if (typeof parsed.userId !== "number") return null;
    return {
      userId: parsed.userId,
      onboardingStep: typeof parsed.onboardingStep === "number" ? parsed.onboardingStep : 0,
    };
  } catch {
    return null;
  }
}

export function setSessionCookie(response: NextResponse, userId: number, onboardingStep = 0) {
  response.cookies.set({
    name: COOKIE_NAME,
    value: createSessionToken(userId, onboardingStep),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
}