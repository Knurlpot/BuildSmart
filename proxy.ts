import { NextRequest, NextResponse } from "next/server";

const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

const RATE_LIMITED_PATHS = [
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/register$/,
  /^\/api\/auth\/change-password$/,
  /^\/api\/pricelist\/backend\/pricelist\/upload/,
  /^\/api\/quotations\/\d+\/blueprint-extract$/,
];

const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;
const buckets = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
}

function isRateLimited(request: NextRequest) {
  if (!RATE_LIMITED_PATHS.some((pattern) => pattern.test(request.nextUrl.pathname))) return false;
  const now = Date.now();
  const key = `${clientKey(request)}:${request.nextUrl.pathname}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT;
}

function hasValidMutationOrigin(request: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  if (!request.nextUrl.pathname.startsWith("/api/")) return true;
  const origin = request.headers.get("origin");
  if (origin) return origin === request.nextUrl.origin;
  const referer = request.headers.get("referer");
  if (!referer) return true;
  try {
    return new URL(referer).origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  if (!hasValidMutationOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  if (isRateLimited(request)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
