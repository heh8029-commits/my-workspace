// 접수 조회 2·3단계: 비밀번호 검증 후 접수 상세 + 사진 Signed URL 반환
// - 연속 5회 실패 시 10분 잠금
// - 오류 메시지에 비밀번호 관련 힌트 노출 금지
import { handleOptions, json } from "../_shared/cors.ts";
import { verifyPassword } from "../_shared/hash.ts";
import { admin, BUCKET } from "../_shared/supabase.ts";

const MAX_FAIL = 5;
const LOCK_MINUTES = 10;
const SIGNED_TTL = 90; // 초 (짧은 만료)

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  const origin = req.headers.get("origin");
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400, origin); }
  const receiptId = String(body.receiptId ?? "");
  const password = String(body.password ?? "");
  if (!receiptId || !password) return json({ error: "invalid_request" }, 400, origin);

  const sb = admin();
  const { data: r } = await sb.from("photo_receipts")
    .select("*").eq("id", receiptId).eq("finalized", true).maybeSingle();
  if (!r) return json({ error: "not_found" }, 404, origin);

  // 잠금 확인
  if (r.locked_until && new Date(r.locked_until) > new Date()) {
    const secLeft = Math.ceil((new Date(r.locked_until).getTime() - Date.now()) / 1000);
    return json({ error: "locked", retryAfterSec: secLeft }, 429, origin);
  }

  const ok = await verifyPassword(password, r.password_hash);
  if (!ok) {
    const failCount = (r.fail_count ?? 0) + 1;
    const update: any = { fail_count: failCount };
    if (failCount >= MAX_FAIL) {
      update.locked_until = new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString();
      update.fail_count = 0;
    }
    await sb.from("photo_receipts").update(update).eq("id", receiptId);
    // 실제 비밀번호 관련 정보 노출 안 함
    return json({ error: "wrong_password", remaining: Math.max(0, MAX_FAIL - failCount) }, 401, origin);
  }

  // 성공: 실패카운트 초기화
  await sb.from("photo_receipts").update({ fail_count: 0, locked_until: null }).eq("id", receiptId);

  const detail = {
    id: r.id,
    receiptNo: r.receipt_no,
    mall: r.mall,
    ordererName: r.orderer_name,
    addressDong: r.address_dong,
    phoneLast4: r.phone_last4,
    editRequest: r.edit_request,
    status: r.status,
    createdAt: r.created_at,
    deleteAt: r.delete_at,
    photosDeleted: r.photos_deleted,
  };

  // 사진이 이미 삭제된 경우
  if (r.photos_deleted) {
    return json({ ok: true, detail, photos: [], photosDeleted: true }, 200, origin);
  }

  const { data: files } = await sb.from("photo_files")
    .select("id, storage_path, original_name, sort_order")
    .eq("receipt_id", receiptId).eq("uploaded", true)
    .order("sort_order", { ascending: true });

  const photos: any[] = [];
  for (const f of files ?? []) {
    const { data: signed } = await sb.storage.from(BUCKET).createSignedUrl(f.storage_path, SIGNED_TTL);
    photos.push({
      id: f.id,
      order: f.sort_order,
      originalName: f.original_name,
      url: signed?.signedUrl ?? null, // 짧은 만료 Signed URL
    });
  }

  return json({ ok: true, detail, photos, photosDeleted: false }, 200, origin);
});
