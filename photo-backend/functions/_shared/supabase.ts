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

// 접수완료번호 생성: XXX-XXX (고객이 외우기 쉽도록 짧게, 헷갈리는 0/O/1/I/L 제외)
export function makeReceiptNo(_now: Date): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const rnd = crypto.getRandomValues(new Uint8Array(6));
  let suffix = "";
  for (const b of rnd) suffix += alphabet[b % alphabet.length];
  return `${suffix.slice(0, 3)}-${suffix.slice(3)}`;
}
