// service_role 키를 사용하는 Supabase 관리 클라이언트 (RLS 우회)
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export const BUCKET = "photo-receipts";

let _client: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  if (_client) return _client;
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  _client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

// 접수완료번호 생성: MRTO-MMDD-HHMM-XXXX (KST 기준, XXXX = 대문자/숫자 4자리)
export function makeReceiptNo(now: Date): string {
  const kst = new Date(now.getTime() + 9 * 3600 * 1000); // Deno 는 UTC 이므로 +9h
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mi = String(kst.getUTCMinutes()).padStart(2, "0");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 혼동되는 0,O,1,I 제외
  const rnd = crypto.getRandomValues(new Uint8Array(4));
  let suffix = "";
  for (const b of rnd) suffix += alphabet[b % alphabet.length];
  return `MRTO-${mm}${dd}-${hh}${mi}-${suffix}`;
}
