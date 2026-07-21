// 사진 접수 Edge Function
//  action: "create"   -> 접수 생성 + 사진별 "서명된 업로드 URL" 발급
//  action: "finalize" -> 업로드 완료 확정(실제 Storage 존재 확인 후 확정)
import { handleOptions, json } from "../_shared/cors.ts";
import { hashPassword } from "../_shared/hash.ts";
import { admin, BUCKET, makeReceiptNo } from "../_shared/supabase.ts";

const MAX_FILES = 5;
const MAX_SIZE = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const ALLOWED_MALLS = ["coupang", "naver", "etc"];
const HOLD_DAYS = 3;

function extFromType(type: string): string {
  return ({
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  } as Record<string, string>)[type] ?? "bin";
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  const origin = req.headers.get("origin");
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400, origin); }
  const sb = admin();

  // -------------------- finalize --------------------
  if (body.action === "finalize") {
    const receiptId = String(body.receiptId ?? "");
    if (!receiptId) return json({ error: "missing_receipt" }, 400, origin);

    const { data: receipt } = await sb.from("photo_receipts")
      .select("id, receipt_no, delete_at, created_at").eq("id", receiptId).maybeSingle();
    if (!receipt) return json({ error: "not_found" }, 404, origin);

    // Storage 에 실제로 올라온 파일만 uploaded=true 로 확정
    const { data: objects } = await sb.storage.from(BUCKET).list(receiptId, { limit: 100 });
    const present = new Set((objects ?? []).map((o) => `${receiptId}/${o.name}`));

    const { data: files } = await sb.from("photo_files")
      .select("id, storage_path").eq("receipt_id", receiptId);
    let uploadedCount = 0;
    for (const f of files ?? []) {
      const ok = present.has(f.storage_path);
      if (ok) uploadedCount++;
      await sb.from("photo_files").update({ uploaded: ok }).eq("id", f.id);
    }
    // 실제 업로드되지 않은 메타행 제거
    await sb.from("photo_files").delete().eq("receipt_id", receiptId).eq("uploaded", false);

    if (uploadedCount === 0) return json({ error: "no_uploaded_files" }, 400, origin);

    await sb.from("photo_receipts")
      .update({ finalized: true, photo_count: uploadedCount, status: "new" })
      .eq("id", receiptId);

    return json({
      ok: true,
      receiptId,
      receiptNo: receipt.receipt_no,
      photoCount: uploadedCount,
      createdAt: receipt.created_at,
      deleteAt: receipt.delete_at,
    }, 200, origin);
  }

  // -------------------- create --------------------
  const mall = String(body.mall ?? "");
  const ordererName = String(body.ordererName ?? "").trim();
  const addressDong = String(body.addressDong ?? "").trim();
  const phoneLast4 = String(body.phoneLast4 ?? "").trim();
  const editRequest = String(body.editRequest ?? "").trim().slice(0, 1000);
  const password = String(body.password ?? "");
  const passwordConfirm = String(body.passwordConfirm ?? "");
  const files: Array<{ name?: string; size?: number; contentType?: string }> = Array.isArray(body.files) ? body.files : [];

  // 검증
  if (!ALLOWED_MALLS.includes(mall)) return json({ error: "invalid_mall" }, 400, origin);
  if (!ordererName || ordererName.length > 40) return json({ error: "invalid_name" }, 400, origin);
  if (!addressDong || addressDong.length > 60) return json({ error: "invalid_address" }, 400, origin);
  if (!/^[0-9]{4}$/.test(phoneLast4)) return json({ error: "invalid_phone" }, 400, origin);
  if (!/^([0-9]{4}|[0-9]{6})$/.test(password)) return json({ error: "invalid_password" }, 400, origin);
  if (password !== passwordConfirm) return json({ error: "password_mismatch" }, 400, origin);
  if (files.length < 1 || files.length > MAX_FILES) return json({ error: "invalid_file_count" }, 400, origin);
  for (const f of files) {
    if (typeof f.size !== "number" || f.size <= 0 || f.size > MAX_SIZE) return json({ error: "file_too_large" }, 400, origin);
    if (!ALLOWED_TYPES.includes(String(f.contentType))) return json({ error: "invalid_file_type" }, 400, origin);
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();
  const deleteAt = new Date(now.getTime() + HOLD_DAYS * 24 * 3600 * 1000);

  // 접수 생성(접수번호 중복 대비 재시도)
  let receipt: any = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const receiptNo = makeReceiptNo(now);
    const { data, error } = await sb.from("photo_receipts").insert({
      receipt_no: receiptNo,
      mall,
      orderer_name: ordererName,
      address_dong: addressDong,
      phone_last4: phoneLast4,
      edit_request: editRequest || null,
      password_hash: passwordHash,
      photo_count: files.length,
      delete_at: deleteAt.toISOString(),
      finalized: false,
    }).select("id, receipt_no, created_at, delete_at").single();
    if (!error) { receipt = data; break; }
    if (error.code !== "23505") return json({ error: "db_error", detail: error.message }, 500, origin);
  }
  if (!receipt) return json({ error: "receipt_no_conflict" }, 500, origin);

  // 사진별 서명된 업로드 URL 발급 + 메타행 생성
  const uploads: any[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const path = `${receipt.id}/${i}_${crypto.randomUUID().slice(0, 8)}.${extFromType(String(f.contentType))}`;
    const { data: signed, error: sErr } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
    if (sErr || !signed) return json({ error: "signed_url_failed", detail: sErr?.message }, 500, origin);

    await sb.from("photo_files").insert({
      receipt_id: receipt.id,
      storage_path: path,
      original_name: (f.name ?? "").slice(0, 200),
      size_bytes: f.size,
      content_type: f.contentType,
      sort_order: i,
      uploaded: false,
    });

    uploads.push({
      sortOrder: i,
      path,
      token: signed.token,
      contentType: f.contentType,
      // supabase-js 가 만들어 준 전체 서명 URL. 프런트가 XHR PUT 으로 업로드(진행률 표시).
      uploadUrl: signed.signedUrl,
    });
  }

  return json({
    ok: true,
    receiptId: receipt.id,
    receiptNo: receipt.receipt_no,
    createdAt: receipt.created_at,
    deleteAt: receipt.delete_at,
    uploads,
  }, 200, origin);
});
