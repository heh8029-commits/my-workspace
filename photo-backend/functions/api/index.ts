// =====================================================================
// 미리토퍼 사진 접수 - 통합 Edge Function (단일 파일, 브라우저 배포용)
// body.route 로 분기: submit / lookup-search / lookup-verify / admin / cleanup
// 필요한 시크릿: ADMIN_TOKEN_SECRET, ADMIN_BOOTSTRAP_SECRET, CLEANUP_SECRET
//   (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 자동 주입됨)
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const BUCKET = "photo-receipts";
// 관리자(service_role) 키: 새 API키 방식에서는 SUPABASE_SERVICE_ROLE_KEY 가 비어 있을 수 있어
// 별도 시크릿 SB_SERVICE_KEY 를 우선 사용한다(없으면 자동주입값 사용).
const SERVICE_KEY = Deno.env.get("SB_SERVICE_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

/* ---------------- CORS ---------------- */
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "*").split(",").map((s) => s.trim()).filter(Boolean);
function cors(origin: string | null): Record<string, string> {
  let o = "*";
  if (!(allowedOrigins.length === 1 && allowedOrigins[0] === "*")) {
    o = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0] ?? "*";
  }
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-token, x-cleanup-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}

/* ---------------- 해시 (PBKDF2-SHA256) ---------------- */
const ITER = 100_000;
function b64e(b: Uint8Array) { let s = ""; for (const x of b) s += String.fromCharCode(x); return btoa(s); }
function b64d(s: string) { const bin = atob(s); const o = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) o[i] = bin.charCodeAt(i); return o; }
async function derive(pw: string, salt: Uint8Array, iter: number) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, k, 256));
}
async function hashPassword(pw: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64e(salt)}$${b64e(await derive(pw, salt, ITER))}`;
}
function safeEq(a: Uint8Array, b: Uint8Array) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; }
async function verifyPassword(pw: string, stored: string) {
  try { const [algo, it, salt, hash] = stored.split("$"); if (algo !== "pbkdf2") return false;
    return safeEq(await derive(pw, b64d(salt), parseInt(it, 10)), b64d(hash)); } catch { return false; }
}
function tempPassword() { const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000; return n.toString().padStart(6, "0"); }

/* ---------------- 관리자 토큰 (HMAC-SHA256) ---------------- */
const ADMIN_SECRET = Deno.env.get("ADMIN_TOKEN_SECRET") ?? "";
const TTL = 60 * 60 * 8;
function u64e(b: Uint8Array) { return b64e(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function u64d(s: string) { return b64d(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); }
async function hmac(data: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(ADMIN_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data)));
}
async function issueToken(u: string) {
  const p = u64e(new TextEncoder().encode(JSON.stringify({ u, exp: Math.floor(Date.now() / 1000) + TTL })));
  return `${p}.${u64e(await hmac(p))}`;
}
async function verifyToken(token: string | null) {
  if (!token || !ADMIN_SECRET) return null;
  const [p, sig] = token.split("."); if (!p || !sig) return null;
  if (!safeEq(await hmac(p), u64d(sig))) return null;
  try { const pl = JSON.parse(new TextDecoder().decode(u64d(p))); if (typeof pl.exp !== "number" || pl.exp < Math.floor(Date.now() / 1000)) return null; return { u: pl.u }; } catch { return null; }
}

/* ---------------- 접수번호 (KST) ---------------- */
function makeReceiptNo(now: Date) {
  const k = new Date(now.getTime() + 9 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let sfx = ""; for (const b of crypto.getRandomValues(new Uint8Array(4))) sfx += A[b % A.length];
  return `MRTO-${p(k.getUTCMonth() + 1)}${p(k.getUTCDate())}-${p(k.getUTCHours())}${p(k.getUTCMinutes())}-${sfx}`;
}

/* ---------------- 상수 ---------------- */
const MAX_FILES = 5, MAX_SIZE = 20 * 1024 * 1024, HOLD_DAYS = 3;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const ALLOWED_MALLS = ["coupang", "naver", "etc"];
const STATUSES = ["new", "photo_checked", "producing", "produced", "shipped"];
const extOf = (t: string) => (({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" } as Record<string, string>)[t] ?? "bin");

async function purge(receiptId: string) {
  const { data: files } = await sb.from("photo_files").select("storage_path").eq("receipt_id", receiptId);
  const paths = (files ?? []).map((f) => f.storage_path);
  if (paths.length) await sb.storage.from(BUCKET).remove(paths);
  await sb.from("photo_files").delete().eq("receipt_id", receiptId);
  await sb.from("photo_receipts").update({ photos_deleted: true, photo_count: 0 }).eq("id", receiptId);
}

// 신규접수 기본 보관일수(관리자 설정, 없으면 HOLD_DAYS)
async function getHoldDays(): Promise<number> {
  const { data } = await sb.from("app_settings").select("value").eq("key", "default_hold_days").maybeSingle();
  const d = Number(data?.value ?? HOLD_DAYS);
  return Number.isFinite(d) && d >= 1 && d <= 60 ? d : HOLD_DAYS;
}

// 수정 요약 문자열
const EDIT_LABEL: Record<string, string> = {
  edit_request: "편집요청 변경", mall: "쇼핑몰 변경",
  photos_delete: "사진 삭제", photos_add: "사진 추가", photos_order: "사진 순서변경",
};
function summarize(changed: string[], detail: any): string {
  return changed.map((c) => {
    if (c === "photos_delete" && detail.deleted) return `사진 삭제 ${detail.deleted}장`;
    if (c === "photos_add" && detail.added) return `사진 추가 ${detail.added}장`;
    return EDIT_LABEL[c] ?? c;
  }).join(" · ");
}

/* ==================================================================== */
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);
  let body: any; try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400, origin); }
  const route = String(body.route ?? "");

  // ============ SUBMIT ============
  if (route === "submit") {
    if (body.action === "finalize") {
      const receiptId = String(body.receiptId ?? "");
      if (!receiptId) return json({ error: "missing_receipt" }, 400, origin);
      const { data: r } = await sb.from("photo_receipts").select("id, receipt_no, delete_at, created_at").eq("id", receiptId).maybeSingle();
      if (!r) return json({ error: "not_found" }, 404, origin);
      const { data: objects } = await sb.storage.from(BUCKET).list(receiptId, { limit: 100 });
      const present = new Set((objects ?? []).map((o) => `${receiptId}/${o.name}`));
      const { data: files } = await sb.from("photo_files").select("id, storage_path").eq("receipt_id", receiptId);
      let up = 0;
      for (const f of files ?? []) { const ok = present.has(f.storage_path); if (ok) up++; await sb.from("photo_files").update({ uploaded: ok }).eq("id", f.id); }
      await sb.from("photo_files").delete().eq("receipt_id", receiptId).eq("uploaded", false);
      if (up === 0) return json({ error: "no_uploaded_files" }, 400, origin);
      await sb.from("photo_receipts").update({ finalized: true, photo_count: up, status: "new" }).eq("id", receiptId);
      return json({ ok: true, receiptId, receiptNo: r.receipt_no, photoCount: up, createdAt: r.created_at, deleteAt: r.delete_at }, 200, origin);
    }
    const mall = String(body.mall ?? ""), name = String(body.ordererName ?? "").trim(), dong = String(body.addressDong ?? "").trim();
    const phone = String(body.phoneLast4 ?? "").trim(), edit = String(body.editRequest ?? "").trim().slice(0, 1000);
    const pw = String(body.password ?? ""), pw2 = String(body.passwordConfirm ?? "");
    const files: any[] = Array.isArray(body.files) ? body.files : [];
    if (!ALLOWED_MALLS.includes(mall)) return json({ error: "invalid_mall" }, 400, origin);
    if (!name || name.length > 40) return json({ error: "invalid_name" }, 400, origin);
    if (!dong || dong.length > 60) return json({ error: "invalid_address" }, 400, origin);
    if (!/^[0-9]{4}$/.test(phone)) return json({ error: "invalid_phone" }, 400, origin);
    if (!/^([0-9]{4}|[0-9]{6})$/.test(pw)) return json({ error: "invalid_password" }, 400, origin);
    if (pw !== pw2) return json({ error: "password_mismatch" }, 400, origin);
    if (files.length < 1 || files.length > MAX_FILES) return json({ error: "invalid_file_count" }, 400, origin);
    for (const f of files) {
      if (typeof f.size !== "number" || f.size <= 0 || f.size > MAX_SIZE) return json({ error: "file_too_large" }, 400, origin);
      if (!ALLOWED_TYPES.includes(String(f.contentType))) return json({ error: "invalid_file_type" }, 400, origin);
    }
    const passwordHash = await hashPassword(pw);
    const holdDays = await getHoldDays();
    const now = new Date(), deleteAt = new Date(now.getTime() + holdDays * 86400000);
    let r: any = null;
    for (let a = 0; a < 5; a++) {
      const { data, error } = await sb.from("photo_receipts").insert({
        receipt_no: makeReceiptNo(now), mall, orderer_name: name, address_dong: dong, phone_last4: phone,
        edit_request: edit || null, password_hash: passwordHash, photo_count: files.length,
        delete_at: deleteAt.toISOString(), finalized: false,
      }).select("id, receipt_no, created_at, delete_at").single();
      if (!error) { r = data; break; }
      if (error.code !== "23505") return json({ error: "db_error", detail: error.message }, 500, origin);
    }
    if (!r) return json({ error: "receipt_no_conflict" }, 500, origin);
    const uploads: any[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const path = `${r.id}/${i}_${crypto.randomUUID().slice(0, 8)}.${extOf(String(f.contentType))}`;
      const { data: signed, error: e } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
      if (e || !signed) return json({ error: "signed_url_failed", detail: e?.message }, 500, origin);
      await sb.from("photo_files").insert({ receipt_id: r.id, storage_path: path, original_name: (f.name ?? "").slice(0, 200), size_bytes: f.size, content_type: f.contentType, sort_order: i, uploaded: false });
      uploads.push({ sortOrder: i, path, token: signed.token, uploadUrl: signed.signedUrl });
    }
    return json({ ok: true, receiptId: r.id, receiptNo: r.receipt_no, createdAt: r.created_at, deleteAt: r.delete_at, uploads }, 200, origin);
  }

  // ============ LOOKUP-SEARCH ============
  if (route === "lookup-search") {
    const name = String(body.name ?? "").trim();
    if (!name || name.length > 40) return json({ error: "invalid_name" }, 400, origin);
    const { data, error } = await sb.from("photo_receipts")
      .select("id, mall, orderer_name, address_dong, phone_last4, status, created_at, delete_at, photos_deleted")
      .eq("orderer_name", name).eq("finalized", true).order("created_at", { ascending: false }).limit(50);
    if (error) return json({ error: "db_error" }, 500, origin);
    return json({ ok: true, results: (data ?? []).map((r) => ({ id: r.id, mall: r.mall, ordererName: r.orderer_name, addressDong: r.address_dong, phoneLast4: r.phone_last4, status: r.status, createdAt: r.created_at, deleteAt: r.delete_at, photosDeleted: r.photos_deleted })) }, 200, origin);
  }

  // ============ LOOKUP-VERIFY ============
  if (route === "lookup-verify") {
    const receiptId = String(body.receiptId ?? ""), pw = String(body.password ?? "");
    if (!receiptId || !pw) return json({ error: "invalid_request" }, 400, origin);
    const { data: r } = await sb.from("photo_receipts").select("*").eq("id", receiptId).eq("finalized", true).maybeSingle();
    if (!r) return json({ error: "not_found" }, 404, origin);
    if (r.locked_until && new Date(r.locked_until) > new Date())
      return json({ error: "locked", retryAfterSec: Math.ceil((new Date(r.locked_until).getTime() - Date.now()) / 1000) }, 429, origin);
    if (!(await verifyPassword(pw, r.password_hash))) {
      const fc = (r.fail_count ?? 0) + 1; const u: any = { fail_count: fc };
      if (fc >= 5) { u.locked_until = new Date(Date.now() + 10 * 60000).toISOString(); u.fail_count = 0; }
      await sb.from("photo_receipts").update(u).eq("id", receiptId);
      return json({ error: "wrong_password", remaining: Math.max(0, 5 - fc) }, 401, origin);
    }
    await sb.from("photo_receipts").update({ fail_count: 0, locked_until: null }).eq("id", receiptId);
    const detail = { id: r.id, receiptNo: r.receipt_no, mall: r.mall, ordererName: r.orderer_name, addressDong: r.address_dong, phoneLast4: r.phone_last4, editRequest: r.edit_request, status: r.status, createdAt: r.created_at, deleteAt: r.delete_at, photosDeleted: r.photos_deleted, edited: r.edited ?? false, editedAt: r.edited_at ?? null, lastEditSummary: r.last_edit_summary ?? null };
    if (r.photos_deleted) return json({ ok: true, detail, photos: [], photosDeleted: true }, 200, origin);
    const { data: files } = await sb.from("photo_files").select("id, storage_path, original_name, sort_order").eq("receipt_id", receiptId).eq("uploaded", true).order("sort_order", { ascending: true });
    const photos: any[] = [];
    for (const f of files ?? []) { const { data: s } = await sb.storage.from(BUCKET).createSignedUrl(f.storage_path, 90); photos.push({ id: f.id, order: f.sort_order, originalName: f.original_name, url: s?.signedUrl ?? null }); }
    return json({ ok: true, detail, photos, photosDeleted: false }, 200, origin);
  }

  // ============ LOOKUP-UPDATE (고객 수정) ============
  if (route === "lookup-update") {
    const receiptId = String(body.receiptId ?? ""), pw = String(body.password ?? "");
    if (!receiptId || !pw) return json({ error: "invalid_request" }, 400, origin);
    const { data: r } = await sb.from("photo_receipts").select("*").eq("id", receiptId).eq("finalized", true).maybeSingle();
    if (!r) return json({ error: "not_found" }, 404, origin);
    if (r.photos_deleted) return json({ error: "photos_deleted" }, 400, origin);
    if (r.locked_until && new Date(r.locked_until) > new Date())
      return json({ error: "locked", retryAfterSec: Math.ceil((new Date(r.locked_until).getTime() - Date.now()) / 1000) }, 429, origin);
    if (!(await verifyPassword(pw, r.password_hash))) {
      const fc = (r.fail_count ?? 0) + 1; const u: any = { fail_count: fc };
      if (fc >= 5) { u.locked_until = new Date(Date.now() + 10 * 60000).toISOString(); u.fail_count = 0; }
      await sb.from("photo_receipts").update(u).eq("id", receiptId);
      return json({ error: "wrong_password", remaining: Math.max(0, 5 - fc) }, 401, origin);
    }
    await sb.from("photo_receipts").update({ fail_count: 0, locked_until: null }).eq("id", receiptId);

    const action = String(body.action ?? "apply");

    // 새로 올린 사진 업로드 확정
    if (action === "finalize") {
      const { data: objects } = await sb.storage.from(BUCKET).list(receiptId, { limit: 100 });
      const present = new Set((objects ?? []).map((o) => `${receiptId}/${o.name}`));
      const { data: files } = await sb.from("photo_files").select("id, storage_path, uploaded").eq("receipt_id", receiptId);
      for (const f of files ?? []) if (!f.uploaded && present.has(f.storage_path)) await sb.from("photo_files").update({ uploaded: true }).eq("id", f.id);
      await sb.from("photo_files").delete().eq("receipt_id", receiptId).eq("uploaded", false);
      const { count } = await sb.from("photo_files").select("*", { count: "exact", head: true }).eq("receipt_id", receiptId).eq("uploaded", true);
      await sb.from("photo_receipts").update({ photo_count: count ?? 0 }).eq("id", receiptId);
      return json({ ok: true, photoCount: count ?? 0 }, 200, origin);
    }

    // 변경 적용
    const newEdit = body.editRequest === undefined ? undefined : String(body.editRequest).trim().slice(0, 1000);
    const newMall = body.mall === undefined ? undefined : String(body.mall);
    const deleteIds: string[] = Array.isArray(body.deletePhotoIds) ? body.deletePhotoIds.map(String) : [];
    const orderIds: string[] = Array.isArray(body.order) ? body.order.map(String) : [];
    const addFiles: any[] = Array.isArray(body.addFiles) ? body.addFiles : [];

    if (newMall !== undefined && !ALLOWED_MALLS.includes(newMall)) return json({ error: "invalid_mall" }, 400, origin);
    for (const f of addFiles) {
      if (typeof f.size !== "number" || f.size <= 0 || f.size > MAX_SIZE) return json({ error: "file_too_large" }, 400, origin);
      if (!ALLOWED_TYPES.includes(String(f.contentType))) return json({ error: "invalid_file_type" }, 400, origin);
    }
    const { data: curPhotos } = await sb.from("photo_files").select("id, storage_path, sort_order").eq("receipt_id", receiptId).eq("uploaded", true).order("sort_order", { ascending: true });
    const kept = (curPhotos ?? []).filter((p) => !deleteIds.includes(p.id));
    if (kept.length + addFiles.length < 1) return json({ error: "need_at_least_one_photo" }, 400, origin);
    if (kept.length + addFiles.length > MAX_FILES) return json({ error: "too_many_photos" }, 400, origin);

    const changed: string[] = []; const detail: any = {};

    if (newEdit !== undefined && newEdit !== (r.edit_request ?? "")) {
      changed.push("edit_request"); detail.editRequest = { from: r.edit_request, to: newEdit };
      await sb.from("photo_receipts").update({ edit_request: newEdit || null }).eq("id", receiptId);
    }
    if (newMall !== undefined && newMall !== r.mall) {
      changed.push("mall"); detail.mall = { from: r.mall, to: newMall };
      await sb.from("photo_receipts").update({ mall: newMall }).eq("id", receiptId);
    }
    if (deleteIds.length) {
      const delPaths = (curPhotos ?? []).filter((p) => deleteIds.includes(p.id)).map((p) => p.storage_path);
      if (delPaths.length) await sb.storage.from(BUCKET).remove(delPaths);
      await sb.from("photo_files").delete().in("id", deleteIds).eq("receipt_id", receiptId);
      changed.push("photos_delete"); detail.deleted = delPaths.length;
    }
    // 순서 재정렬(남은 사진)
    const keptIds = kept.map((p) => p.id);
    const orderedKept = orderIds.length ? orderIds.filter((id) => keptIds.includes(id)) : keptIds;
    if (orderIds.length && orderedKept.length === keptIds.length && orderedKept.join(",") !== keptIds.join(",")) changed.push("photos_order");
    for (let i = 0; i < orderedKept.length; i++) await sb.from("photo_files").update({ sort_order: i }).eq("id", orderedKept[i]);

    // 사진 추가 → 서명 업로드 URL
    const uploads: any[] = [];
    for (let i = 0; i < addFiles.length; i++) {
      const f = addFiles[i];
      const so = orderedKept.length + i;
      const path = `${receiptId}/${so}_${crypto.randomUUID().slice(0, 8)}.${extOf(String(f.contentType))}`;
      const { data: signed, error: e } = await sb.storage.from(BUCKET).createSignedUploadUrl(path);
      if (e || !signed) return json({ error: "signed_url_failed" }, 500, origin);
      await sb.from("photo_files").insert({ receipt_id: receiptId, storage_path: path, original_name: (f.name ?? "").slice(0, 200), size_bytes: f.size, content_type: f.contentType, sort_order: so, uploaded: false });
      uploads.push({ sortOrder: so, path, token: signed.token, uploadUrl: signed.signedUrl });
    }
    if (addFiles.length) { changed.push("photos_add"); detail.added = addFiles.length; }

    if (changed.length === 0) return json({ ok: true, uploads: [], nochange: true }, 200, origin);

    const summary = summarize(changed, detail);
    await sb.from("photo_receipts").update({ edited: true, edited_at: new Date().toISOString(), last_edit_summary: summary, photo_count: kept.length }).eq("id", receiptId);
    await sb.from("photo_edit_logs").insert({ receipt_id: receiptId, actor: "customer", changed, summary, detail });
    return json({ ok: true, uploads, summary }, 200, origin);
  }

  // ============ ADMIN ============
  if (route === "admin") {
    const action = String(body.action ?? "");
    if (action === "bootstrap") {
      const secret = Deno.env.get("ADMIN_BOOTSTRAP_SECRET") ?? "";
      if (!secret || body.secret !== secret) return json({ error: "forbidden" }, 403, origin);
      const username = String(body.username ?? "").trim(), password = String(body.password ?? "");
      if (!username || password.length < 8) return json({ error: "weak_credentials" }, 400, origin);
      const { count } = await sb.from("admin_users").select("*", { count: "exact", head: true });
      if ((count ?? 0) > 0) return json({ error: "already_initialized" }, 409, origin);
      await sb.from("admin_users").insert({ username, password_hash: await hashPassword(password) });
      return json({ ok: true }, 200, origin);
    }
    if (action === "login") {
      const username = String(body.username ?? "").trim(), password = String(body.password ?? "");
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
      const { data: att } = await sb.from("admin_login_attempts").select("*").eq("ip", ip).maybeSingle();
      if (att?.locked_until && new Date(att.locked_until) > new Date())
        return json({ error: "locked", retryAfterSec: Math.ceil((new Date(att.locked_until).getTime() - Date.now()) / 1000) }, 429, origin);
      const { data: user } = await sb.from("admin_users").select("*").eq("username", username).maybeSingle();
      if (!(user && await verifyPassword(password, user.password_hash))) {
        const fc = (att?.fail_count ?? 0) + 1; const u: any = { ip, fail_count: fc };
        if (fc >= 5) { u.locked_until = new Date(Date.now() + 15 * 60000).toISOString(); u.fail_count = 0; }
        await sb.from("admin_login_attempts").upsert(u);
        return json({ error: "invalid_credentials" }, 401, origin);
      }
      await sb.from("admin_login_attempts").upsert({ ip, fail_count: 0, locked_until: null });
      return json({ ok: true, token: await issueToken(username) }, 200, origin);
    }
    const session = await verifyToken(req.headers.get("x-admin-token"));
    if (!session) return json({ error: "unauthorized" }, 401, origin);

    if (action === "list") {
      const f = body.filters ?? {};
      let q = sb.from("photo_receipts").select("id, receipt_no, mall, orderer_name, address_dong, phone_last4, edit_request, status, photo_count, created_at, delete_at, photos_deleted, finalized").eq("finalized", true).order("created_at", { ascending: false }).limit(500);
      if (f.name) q = q.ilike("orderer_name", `%${String(f.name).trim()}%`);
      if (f.phone) q = q.eq("phone_last4", String(f.phone).trim());
      if (f.dong) q = q.ilike("address_dong", `%${String(f.dong).trim()}%`);
      if (f.mall) q = q.eq("mall", String(f.mall));
      if (f.status) q = q.eq("status", String(f.status));
      if (f.dateFrom) q = q.gte("created_at", String(f.dateFrom));
      if (f.dateTo) q = q.lte("created_at", String(f.dateTo));
      const { data, error } = await q;
      if (error) return json({ error: "db_error", detail: error.message }, 500, origin);
      const rows: any[] = [];
      for (const r of data ?? []) {
        let thumb: string | null = null;
        if (!r.photos_deleted && r.photo_count > 0) {
          const { data: first } = await sb.from("photo_files").select("storage_path").eq("receipt_id", r.id).eq("uploaded", true).order("sort_order", { ascending: true }).limit(1).maybeSingle();
          if (first) { const { data: s } = await sb.storage.from(BUCKET).createSignedUrl(first.storage_path, 120); thumb = s?.signedUrl ?? null; }
        }
        rows.push({ id: r.id, receiptNo: r.receipt_no, mall: r.mall, ordererName: r.orderer_name, addressDong: r.address_dong, phoneLast4: r.phone_last4, editRequest: r.edit_request, status: r.status, photoCount: r.photo_count, createdAt: r.created_at, deleteAt: r.delete_at, photosDeleted: r.photos_deleted, edited: r.edited ?? false, editedAt: r.edited_at ?? null, lastEditSummary: r.last_edit_summary ?? null, thumb });
      }
      return json({ ok: true, rows }, 200, origin);
    }
    if (action === "detail") {
      const id = String(body.receiptId ?? "");
      const { data: r } = await sb.from("photo_receipts").select("*").eq("id", id).maybeSingle();
      if (!r) return json({ error: "not_found" }, 404, origin);
      const { data: files } = await sb.from("photo_files").select("id, storage_path, original_name, size_bytes, sort_order").eq("receipt_id", id).eq("uploaded", true).order("sort_order", { ascending: true });
      const photos: any[] = [];
      for (const fl of files ?? []) {
        const { data: v } = await sb.storage.from(BUCKET).createSignedUrl(fl.storage_path, 120);
        const { data: dl } = await sb.storage.from(BUCKET).createSignedUrl(fl.storage_path, 120, { download: fl.original_name || true });
        photos.push({ id: fl.id, order: fl.sort_order, originalName: fl.original_name, sizeBytes: fl.size_bytes, url: v?.signedUrl ?? null, downloadUrl: dl?.signedUrl ?? null });
      }
      const { data: logs } = await sb.from("photo_edit_logs").select("actor, changed, summary, detail, created_at").eq("receipt_id", id).order("created_at", { ascending: false }).limit(50);
      return json({ ok: true, detail: { id: r.id, receiptNo: r.receipt_no, mall: r.mall, ordererName: r.orderer_name, addressDong: r.address_dong, phoneLast4: r.phone_last4, editRequest: r.edit_request, status: r.status, photoCount: r.photo_count, createdAt: r.created_at, deleteAt: r.delete_at, photosDeleted: r.photos_deleted, edited: r.edited ?? false, editedAt: r.edited_at ?? null, lastEditSummary: r.last_edit_summary ?? null }, photos, editLogs: logs ?? [] }, 200, origin);
    }
    if (action === "setStatus") {
      const status = String(body.status ?? ""); if (!STATUSES.includes(status)) return json({ error: "invalid_status" }, 400, origin);
      await sb.from("photo_receipts").update({ status }).eq("id", String(body.receiptId ?? "")); return json({ ok: true }, 200, origin);
    }
    if (action === "resetPassword") {
      const t = tempPassword();
      await sb.from("photo_receipts").update({ password_hash: await hashPassword(t), fail_count: 0, locked_until: null }).eq("id", String(body.receiptId ?? ""));
      return json({ ok: true, tempPassword: t }, 200, origin);
    }
    if (action === "deletePhotos") { await purge(String(body.receiptId ?? "")); return json({ ok: true }, 200, origin); }
    if (action === "bulkDelete") { const ids: string[] = Array.isArray(body.receiptIds) ? body.receiptIds : []; for (const id of ids) await purge(id); return json({ ok: true, deleted: ids.length }, 200, origin); }
    if (action === "extend") {
      const id = String(body.receiptId ?? ""), days = Number(body.days ?? 3);
      const { data: r } = await sb.from("photo_receipts").select("delete_at, photos_deleted").eq("id", id).maybeSingle();
      if (!r) return json({ error: "not_found" }, 404, origin);
      if (r.photos_deleted) return json({ error: "already_deleted" }, 400, origin);
      const base = new Date(r.delete_at) > new Date() ? new Date(r.delete_at) : new Date();
      const nd = new Date(base.getTime() + days * 86400000);
      await sb.from("photo_receipts").update({ delete_at: nd.toISOString() }).eq("id", id);
      return json({ ok: true, deleteAt: nd.toISOString() }, 200, origin);
    }
    if (action === "listExpiring") {
      const until = new Date(Date.now() + Number(body.withinHours ?? 24) * 3600000).toISOString();
      const { data } = await sb.from("photo_receipts").select("id, receipt_no, orderer_name, phone_last4, delete_at, status").eq("finalized", true).eq("photos_deleted", false).lte("delete_at", until).order("delete_at", { ascending: true });
      return json({ ok: true, rows: data ?? [] }, 200, origin);
    }
    // 건별 보관일수 설정: 삭제일 = 접수일 + N일
    if (action === "setDeleteDays") {
      const days = Math.max(1, Math.min(60, Number(body.days ?? 3)));
      const { data: rr } = await sb.from("photo_receipts").select("created_at, photos_deleted").eq("id", String(body.receiptId ?? "")).maybeSingle();
      if (!rr) return json({ error: "not_found" }, 404, origin);
      if (rr.photos_deleted) return json({ error: "already_deleted" }, 400, origin);
      const nd = new Date(new Date(rr.created_at).getTime() + days * 86400000);
      await sb.from("photo_receipts").update({ delete_at: nd.toISOString() }).eq("id", String(body.receiptId ?? ""));
      await sb.from("photo_edit_logs").insert({ receipt_id: String(body.receiptId ?? ""), actor: "admin", changed: ["retention"], summary: `보관기간 ${days}일로 변경`, detail: { days } });
      return json({ ok: true, deleteAt: nd.toISOString() }, 200, origin);
    }
    // 신규접수 기본 보관일수 조회/설정
    if (action === "getSettings") {
      const { data } = await sb.from("app_settings").select("value").eq("key", "default_hold_days").maybeSingle();
      return json({ ok: true, defaultHoldDays: Number(data?.value ?? 3) }, 200, origin);
    }
    if (action === "setDefaultHoldDays") {
      const days = Math.max(1, Math.min(60, Number(body.days ?? 3)));
      await sb.from("app_settings").upsert({ key: "default_hold_days", value: days });
      return json({ ok: true, defaultHoldDays: days }, 200, origin);
    }
    return json({ error: "unknown_action" }, 400, origin);
  }

  // ============ CLEANUP (cron) ============
  if (route === "cleanup") {
    const secret = Deno.env.get("CLEANUP_SECRET") ?? "";
    if (!secret || req.headers.get("x-cleanup-secret") !== secret) return json({ error: "forbidden" }, 403, origin);
    const nowIso = new Date().toISOString();
    let purged = 0, orphans = 0;
    const { data: expired } = await sb.from("photo_receipts").select("id").eq("photos_deleted", false).lte("delete_at", nowIso).limit(500);
    for (const r of expired ?? []) { await purge(r.id); purged++; }
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { data: orph } = await sb.from("photo_receipts").select("id").eq("finalized", false).lte("created_at", oneHourAgo).limit(500);
    for (const r of orph ?? []) {
      const { data: objs } = await sb.storage.from(BUCKET).list(r.id, { limit: 100 });
      const paths = (objs ?? []).map((o) => `${r.id}/${o.name}`);
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      await sb.from("photo_receipts").delete().eq("id", r.id); orphans++;
    }
    return json({ ok: true, photosPurged: purged, orphansRemoved: orphans, at: nowIso }, 200, origin);
  }

  return json({ error: "unknown_route" }, 400, origin);
});
