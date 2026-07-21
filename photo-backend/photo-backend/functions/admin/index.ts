// 관리자 Edge Function (단일 진입점, action 으로 분기)
//  공개: bootstrap(최초1회, 시크릿 필요), login
//  보호: list, detail, setStatus, resetPassword, deletePhotos, bulkDelete, extend, listExpiring
//        -> x-admin-token 헤더의 유효한 세션 토큰 필요
import { handleOptions, json } from "../_shared/cors.ts";
import { generateTempPassword, hashPassword, verifyPassword } from "../_shared/hash.ts";
import { issueAdminToken, verifyAdminToken } from "../_shared/auth.ts";
import { admin, BUCKET } from "../_shared/supabase.ts";

const STATUSES = ["new", "photo_checked", "producing", "produced", "shipped"];
const MAX_FAIL = 5;
const LOCK_MINUTES = 15;
const THUMB_TTL = 120;

// 접수건의 사진을 Storage/DB 에서 함께 삭제
async function purgePhotos(sb: ReturnType<typeof admin>, receiptId: string) {
  const { data: files } = await sb.from("photo_files")
    .select("storage_path").eq("receipt_id", receiptId);
  const paths = (files ?? []).map((f) => f.storage_path);
  if (paths.length) await sb.storage.from(BUCKET).remove(paths);
  await sb.from("photo_files").delete().eq("receipt_id", receiptId);
  await sb.from("photo_receipts").update({ photos_deleted: true, photo_count: 0 }).eq("id", receiptId);
}

Deno.serve(async (req) => {
  const pre = handleOptions(req);
  if (pre) return pre;
  const origin = req.headers.get("origin");
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, origin);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400, origin); }
  const action = String(body.action ?? "");
  const sb = admin();

  // ---------- bootstrap: 최초 관리자 생성 (ADMIN_BOOTSTRAP_SECRET 필요) ----------
  if (action === "bootstrap") {
    const secret = Deno.env.get("ADMIN_BOOTSTRAP_SECRET") ?? "";
    if (!secret || body.secret !== secret) return json({ error: "forbidden" }, 403, origin);
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    if (!username || password.length < 8) return json({ error: "weak_credentials" }, 400, origin);
    const { count } = await sb.from("admin_users").select("*", { count: "exact", head: true });
    if ((count ?? 0) > 0) return json({ error: "already_initialized" }, 409, origin);
    await sb.from("admin_users").insert({ username, password_hash: await hashPassword(password) });
    return json({ ok: true }, 200, origin);
  }

  // ---------- login ----------
  if (action === "login") {
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";

    const { data: att } = await sb.from("admin_login_attempts").select("*").eq("ip", ip).maybeSingle();
    if (att?.locked_until && new Date(att.locked_until) > new Date()) {
      return json({ error: "locked", retryAfterSec: Math.ceil((new Date(att.locked_until).getTime() - Date.now()) / 1000) }, 429, origin);
    }

    const { data: user } = await sb.from("admin_users").select("*").eq("username", username).maybeSingle();
    const ok = user ? await verifyPassword(password, user.password_hash) : false;
    if (!ok) {
      const fc = (att?.fail_count ?? 0) + 1;
      const upd: any = { ip, fail_count: fc };
      if (fc >= MAX_FAIL) { upd.locked_until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString(); upd.fail_count = 0; }
      await sb.from("admin_login_attempts").upsert(upd);
      return json({ error: "invalid_credentials" }, 401, origin);
    }
    await sb.from("admin_login_attempts").upsert({ ip, fail_count: 0, locked_until: null });
    const token = await issueAdminToken(username);
    return json({ ok: true, token }, 200, origin);
  }

  // ---------- 이하 보호된 액션 ----------
  const session = await verifyAdminToken(req.headers.get("x-admin-token"));
  if (!session) return json({ error: "unauthorized" }, 401, origin);

  if (action === "list") {
    const f = body.filters ?? {};
    let q = sb.from("photo_receipts")
      .select("id, receipt_no, mall, orderer_name, address_dong, phone_last4, edit_request, status, photo_count, created_at, delete_at, photos_deleted, finalized")
      .eq("finalized", true)
      .order("created_at", { ascending: false })
      .limit(500);
    if (f.name) q = q.ilike("orderer_name", `%${String(f.name).trim()}%`);
    if (f.phone) q = q.eq("phone_last4", String(f.phone).trim());
    if (f.dong) q = q.ilike("address_dong", `%${String(f.dong).trim()}%`);
    if (f.mall) q = q.eq("mall", String(f.mall));
    if (f.status) q = q.eq("status", String(f.status));
    if (f.dateFrom) q = q.gte("created_at", String(f.dateFrom));
    if (f.dateTo) q = q.lte("created_at", String(f.dateTo));
    const { data, error } = await q;
    if (error) return json({ error: "db_error", detail: error.message }, 500, origin);

    // 각 접수의 대표 썸네일 1장 Signed URL
    const rows: any[] = [];
    for (const r of data ?? []) {
      let thumb: string | null = null;
      if (!r.photos_deleted && r.photo_count > 0) {
        const { data: first } = await sb.from("photo_files")
          .select("storage_path").eq("receipt_id", r.id).eq("uploaded", true)
          .order("sort_order", { ascending: true }).limit(1).maybeSingle();
        if (first) {
          const { data: s } = await sb.storage.from(BUCKET).createSignedUrl(first.storage_path, THUMB_TTL);
          thumb = s?.signedUrl ?? null;
        }
      }
      rows.push({
        id: r.id, receiptNo: r.receipt_no, mall: r.mall, ordererName: r.orderer_name,
        addressDong: r.address_dong, phoneLast4: r.phone_last4, editRequest: r.edit_request,
        status: r.status, photoCount: r.photo_count, createdAt: r.created_at,
        deleteAt: r.delete_at, photosDeleted: r.photos_deleted, thumb,
      });
    }
    return json({ ok: true, rows }, 200, origin);
  }

  if (action === "detail") {
    const receiptId = String(body.receiptId ?? "");
    const { data: r } = await sb.from("photo_receipts").select("*").eq("id", receiptId).maybeSingle();
    if (!r) return json({ error: "not_found" }, 404, origin);
    const { data: files } = await sb.from("photo_files")
      .select("id, storage_path, original_name, size_bytes, sort_order")
      .eq("receipt_id", receiptId).eq("uploaded", true).order("sort_order", { ascending: true });
    const photos: any[] = [];
    for (const fl of files ?? []) {
      const { data: view } = await sb.storage.from(BUCKET).createSignedUrl(fl.storage_path, THUMB_TTL);
      const { data: dl } = await sb.storage.from(BUCKET).createSignedUrl(fl.storage_path, THUMB_TTL, { download: fl.original_name || true });
      photos.push({ id: fl.id, order: fl.sort_order, originalName: fl.original_name, sizeBytes: fl.size_bytes, url: view?.signedUrl ?? null, downloadUrl: dl?.signedUrl ?? null });
    }
    return json({ ok: true, detail: {
      id: r.id, receiptNo: r.receipt_no, mall: r.mall, ordererName: r.orderer_name,
      addressDong: r.address_dong, phoneLast4: r.phone_last4, editRequest: r.edit_request,
      status: r.status, photoCount: r.photo_count, createdAt: r.created_at, deleteAt: r.delete_at,
      photosDeleted: r.photos_deleted,
    }, photos }, 200, origin);
  }

  if (action === "setStatus") {
    const receiptId = String(body.receiptId ?? "");
    const status = String(body.status ?? "");
    if (!STATUSES.includes(status)) return json({ error: "invalid_status" }, 400, origin);
    await sb.from("photo_receipts").update({ status }).eq("id", receiptId);
    return json({ ok: true }, 200, origin);
  }

  if (action === "resetPassword") {
    const receiptId = String(body.receiptId ?? "");
    const temp = generateTempPassword();
    await sb.from("photo_receipts")
      .update({ password_hash: await hashPassword(temp), fail_count: 0, locked_until: null })
      .eq("id", receiptId);
    return json({ ok: true, tempPassword: temp }, 200, origin);
  }

  if (action === "deletePhotos") {
    await purgePhotos(sb, String(body.receiptId ?? ""));
    return json({ ok: true }, 200, origin);
  }

  if (action === "bulkDelete") {
    const ids: string[] = Array.isArray(body.receiptIds) ? body.receiptIds : [];
    for (const id of ids) await purgePhotos(sb, id);
    return json({ ok: true, deleted: ids.length }, 200, origin);
  }

  if (action === "extend") {
    const receiptId = String(body.receiptId ?? "");
    const days = Number(body.days ?? 3);
    const { data: r } = await sb.from("photo_receipts").select("delete_at, photos_deleted").eq("id", receiptId).maybeSingle();
    if (!r) return json({ error: "not_found" }, 404, origin);
    if (r.photos_deleted) return json({ error: "already_deleted" }, 400, origin);
    const base = new Date(r.delete_at) > new Date() ? new Date(r.delete_at) : new Date();
    const newDate = new Date(base.getTime() + days * 24 * 3600 * 1000);
    await sb.from("photo_receipts").update({ delete_at: newDate.toISOString() }).eq("id", receiptId);
    return json({ ok: true, deleteAt: newDate.toISOString() }, 200, origin);
  }

  if (action === "listExpiring") {
    const hours = Number(body.withinHours ?? 24);
    const until = new Date(Date.now() + hours * 3600 * 1000).toISOString();
    const { data } = await sb.from("photo_receipts")
      .select("id, receipt_no, orderer_name, phone_last4, delete_at, status")
      .eq("finalized", true).eq("photos_deleted", false)
      .lte("delete_at", until).order("delete_at", { ascending: true });
    return json({ ok: true, rows: data ?? [] }, 200, origin);
  }

  return json({ error: "unknown_action" }, 400, origin);
});
