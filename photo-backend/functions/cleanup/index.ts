// 자동삭제 Edge Function (pg_cron 이 매시 호출)
//  1) delete_at 이 지난 접수의 사진을 Storage/DB 에서 삭제 (접수 기록은 남기고 photos_deleted=true)
//  2) 업로드 미확정(finalized=false) 상태로 1시간 넘게 방치된 접수 정리(고아 데이터)
//  x-cleanup-secret 헤더 검증
import { admin, BUCKET } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });
  const secret = Deno.env.get("CLEANUP_SECRET") ?? "";
  if (!secret || req.headers.get("x-cleanup-secret") !== secret) {
    return new Response("forbidden", { status: 403 });
  }

  const sb = admin();
  const nowIso = new Date().toISOString();
  let photosPurged = 0;
  let orphansRemoved = 0;

  // 1) 만료 접수의 사진 삭제
  const { data: expired } = await sb.from("photo_receipts")
    .select("id").eq("photos_deleted", false).lte("delete_at", nowIso).limit(500);
  for (const r of expired ?? []) {
    const { data: files } = await sb.from("photo_files").select("storage_path").eq("receipt_id", r.id);
    const paths = (files ?? []).map((f) => f.storage_path);
    if (paths.length) await sb.storage.from(BUCKET).remove(paths);
    await sb.from("photo_files").delete().eq("receipt_id", r.id);
    await sb.from("photo_receipts").update({ photos_deleted: true, photo_count: 0 }).eq("id", r.id);
    photosPurged++;
  }

  // 2) 미확정(업로드 실패/중단) 고아 접수 정리: 생성 1시간 경과 & finalized=false
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: orphans } = await sb.from("photo_receipts")
    .select("id").eq("finalized", false).lte("created_at", oneHourAgo).limit(500);
  for (const r of orphans ?? []) {
    const { data: objs } = await sb.storage.from(BUCKET).list(r.id, { limit: 100 });
    const paths = (objs ?? []).map((o) => `${r.id}/${o.name}`);
    if (paths.length) await sb.storage.from(BUCKET).remove(paths);
    await sb.from("photo_receipts").delete().eq("id", r.id); // photo_files 는 FK cascade
    orphansRemoved++;
  }

  return new Response(JSON.stringify({ ok: true, photosPurged, orphansRemoved, at: nowIso }), {
    headers: { "Content-Type": "application/json" },
  });
});
