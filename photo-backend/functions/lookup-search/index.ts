// 접수 조회 1단계: 주문자 이름으로 검색
// 개인정보 최소 노출: 이름/전화뒷4/동/쇼핑몰/접수일/삭제예정일 만 반환.
// 사진, 편집요청, 비밀번호, 전체정보는 반환하지 않는다.
import { handleOptions, json } from "../_shared/cors.ts";
import { admin } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  const origin = req.headers.get("origin");
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400, origin); }

  const name = String(body.name ?? "").trim();
  if (!name || name.length > 40) return json({ error: "invalid_name" }, 400, origin);

  const sb = admin();
  // 이름 완전일치(동명이인 노출 최소화). 확정된 접수만.
  const { data, error } = await sb.from("photo_receipts")
    .select("id, mall, orderer_name, address_dong, phone_last4, status, created_at, delete_at, photos_deleted")
    .eq("orderer_name", name)
    .eq("finalized", true)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return json({ error: "db_error" }, 500, origin);

  const results = (data ?? []).map((r) => ({
    id: r.id,
    mall: r.mall,
    ordererName: r.orderer_name,
    addressDong: r.address_dong,
    phoneLast4: r.phone_last4,
    status: r.status,
    createdAt: r.created_at,
    deleteAt: r.delete_at,
    photosDeleted: r.photos_deleted,
  }));

  return json({ ok: true, results }, 200, origin);
});
