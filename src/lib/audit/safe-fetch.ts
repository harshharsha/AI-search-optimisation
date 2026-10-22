import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type FetchResult = {
  url: string;
  status: number;
  headers: Headers;
  body: string;
  ms: number;
  redirects: string[];
};

function isPrivateIp(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower.includes(":")) {
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80")
    );
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

/** Basic SSRF protection: refuse hosts that resolve to private or local addresses */
async function assertPublicHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateIp(host))
      throw new Error("Private or local addresses are not allowed");
    return;
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new Error(`Could not find ${host}. Check the website address.`);
  }
  if (addresses.some((a) => isPrivateIp(a.address))) {
    throw new Error("Private or local addresses are not allowed");
  }
}

async function readCapped(res: Response, maxBytes: number) {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder("utf-8").decode(
    Buffer.concat(chunks.map((c) => Buffer.from(c))).subarray(0, maxBytes),
  );
}

export async function safeFetch(
  rawUrl: string,
  opts: { maxBytes?: number; timeoutMs?: number; maxRedirects?: number } = {},
): Promise<FetchResult> {
  const { maxBytes = 1_500_000, timeoutMs = 8000, maxRedirects = 4 } = opts;
  const started = Date.now();
  const redirects: string[] = [];
  let url = new URL(rawUrl);

  for (let i = 0; i <= maxRedirects; i++) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Only http and https addresses are allowed");
    }
    await assertPublicHost(url.hostname);

    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "user-agent": "AISOA-Audit/1.0 (website readiness check)",
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
    });

    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      url = new URL(location, url);
      redirects.push(url.toString());
      continue;
    }

    const body = await readCapped(res, maxBytes);
    return {
      url: url.toString(),
      status: res.status,
      headers: res.headers,
      body,
      ms: Date.now() - started,
      redirects,
    };
  }
  throw new Error("Too many redirects");
}
