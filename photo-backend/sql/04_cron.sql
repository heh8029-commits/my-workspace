-- =====================================================================
-- 미리토퍼 사진 접수 - 3일 자동삭제 스케줄 (pg_cron + pg_net)
-- 매시 정각에 cleanup Edge Function 을 호출한다.
-- Edge Function 이 만료 사진을 Storage/DB 에서 함께 삭제한다.
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ▼▼▼ 아래 두 값을 본인 프로젝트 값으로 바꾸세요 ▼▼▼
--   PROJECT_REF   : Supabase 프로젝트 ref (예: abcdefghijklmno)
--   CLEANUP_SECRET : Edge Function 에 설정한 CLEANUP_SECRET 시크릿과 동일한 값
-- ▲▲▲ ------------------------------------------------ ▲▲▲

-- 기존 동일 이름 잡이 있으면 제거(재실행 안전)
select cron.unschedule('miritopper-photo-cleanup')
where exists (select 1 from cron.job where jobname = 'miritopper-photo-cleanup');

select cron.schedule(
  'miritopper-photo-cleanup',
  '0 * * * *',                              -- 매시 정각 (원하면 '*/30 * * * *' 등으로 변경)
  $$
  select net.http_post(
    url     := 'https://zuoztgnzrfhukdibrlxz.supabase.co/functions/v1/api',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ANON_KEY',       -- 함수 JWT 검증 통과용(anon 키)
                 'apikey', 'ANON_KEY',
                 'x-cleanup-secret', 'CLEANUP_SECRET'
               ),
    body    := '{"route":"cleanup"}'::jsonb
  );
  $$
);

-- 등록 확인:
--   select jobname, schedule, active from cron.job;
-- 수동 1회 실행(테스트):
--   select net.http_post(
--     url:='https://PROJECT_REF.supabase.co/functions/v1/cleanup',
--     headers:=jsonb_build_object('Content-Type','application/json','x-cleanup-secret','CLEANUP_SECRET'),
--     body:='{}'::jsonb);
