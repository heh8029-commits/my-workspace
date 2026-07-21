// 관리자 세션 토큰: HMAC-SHA256 서명 (외부 의존성 없음)
// 포맷: base64url(payloadJson) + "." + base64url(hmac)
// payload = { u: username, exp: epochSeconds }

const SECRET = Deno.env.get("ADMIN_TOKEN_SECRET") ?? "";
const TTL_SECONDS = 60 * 60 * 8; // 8시간

function b64urlEncode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(str: string): Uint8Array {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function issueAdminToken(username: string): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = { u: username, exp: nowSec + TTL_SECONDS };
  const payloadStr = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmac(payloadStr);
  return `${payloadStr}.${b64urlEncode(sig)}`;
}

export async function verifyAdminToken(token: string | null): Promise<{ u: string } | null> {
  if (!token || !SECRET) return null;
  const [payloadStr, sigStr] = token.split(".");
  if (!payloadStr || !sigStr) return null;
  const expected = await hmac(payloadStr);
  const given = b64urlDecode(sigStr);
  if (!timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadStr)));
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { u: payload.u };
  } catch {
    return null;
  }
}
