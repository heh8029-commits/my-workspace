-- =====================================================================
-- 미리토퍼 사진 접수 - RLS (Row Level Security) 정책
-- 원칙: 모든 테이블 RLS 활성화 + anon/authenticated 정책 0개
--       => 프런트(anon key)로는 테이블에 직접 접근 불가.
--       => 모든 읽기/쓰기는 service_role 을 쓰는 Edge Function 을 통해서만.
-- =====================================================================

alter table public.photo_receipts       enable row level security;
alter table public.photo_files          enable row level security;
alter table public.admin_users          enable row level security;
alter table public.admin_login_attempts enable row level security;

-- force RLS: 테이블 소유자도 RLS 를 우회하지 못하게(단, service_role 은 우회 가능)
alter table public.photo_receipts       force row level security;
alter table public.photo_files          force row level security;
alter table public.admin_users          force row level security;
alter table public.admin_login_attempts force row level security;

-- 혹시 이전에 만든 공개 정책이 있으면 제거
drop policy if exists "public read receipts"  on public.photo_receipts;
drop policy if exists "public write receipts" on public.photo_receipts;
drop policy if exists "public read files"      on public.photo_files;

-- === 정책을 "일부러" 만들지 않는다 ===
-- anon / authenticated 역할에 대한 정책이 하나도 없으므로
-- 프런트엔드가 anon key 로 select/insert/update/delete 를 시도하면 전부 거부된다.
-- Edge Function 은 SERVICE_ROLE_KEY 로 접속하여 RLS 를 우회한다.

-- (확인) 정책 목록이 비어 있어야 정상:
-- select * from pg_policies where schemaname = 'public'
--   and tablename in ('photo_receipts','photo_files','admin_users','admin_login_attempts');
