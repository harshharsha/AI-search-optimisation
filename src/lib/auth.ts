// Single-user password login. The session is a signed, expiring cookie (HMAC-SHA256),
// built with Web Crypto so it works in the proxy and in server actions.

export const COOKIE_NAME = "aisoa_session";
export const SESSION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Login is required when a password is set, and always in production */
export function authRequired() {
  return (
    Boolean(process.env.APP_PASSWORD) || process.env.NODE_ENV === "production"
  );
}

const enc = new TextEncoder();

async function hmac(data: string) {
  const secret = process.env.AUTH_SECRET || process.env.APP_PASSWORD || "";
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time string comparison */
export function safeEqual(a: string, b: string) {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

export async function createSession() {
  const expires = Date.now() + SESSION_MS;
  return `${expires}.${await hmac(String(expires))}`;
}

export async function verifySession(token?: string) {
  if (!token || !process.env.APP_PASSWORD) return false;
  const [expires, sig] = token.split(".");
  if (!expires || !sig || Number(expires) < Date.now()) return false;
  return safeEqual(sig, await hmac(expires));
}
