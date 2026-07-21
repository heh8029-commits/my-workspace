-- =====================================================================
-- 미리토퍼 사진 접수 - Storage 비공개 버킷 설정
-- =====================================================================

-- 비공개 버킷 생성 (public = false 가 핵심)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photo-receipts',
  'photo-receipts',
  false,                                   -- 비공개: 고정 공개 URL 불가, Signed URL 로만 접근
  20971520,                                -- 20MB (파일당)
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 20971520,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif'];

-- 주의: storage.objects 에 대한 public/anon 정책은 만들지 않는다.
-- 업로드는 Edge Function 이 발급한 "서명된 업로드 URL"로만,
-- 다운로드/조회는 Edge Function 이 발급한 "짧은 만료 Signed URL"로만 이루어진다.
-- service_role(Edge Function) 은 RLS 를 우회하므로 별도 정책이 필요 없다.
