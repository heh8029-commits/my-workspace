-- =====================================================================
-- 미리토퍼 사진 접수 - 고객 수정 기능 + 보관일수 설정 (추가 마이그레이션)
-- SQL Editor 에서 1회 실행
-- =====================================================================

-- 1) 접수 테이블에 수정 추적 컬럼 추가
alter table public.photo_receipts
  add column if not exists edited boolean not null default false,
  add column if not exists edited_at timestamptz,
  add column if not exists last_edit_summary text;

-- 2) 수정 이력 로그 테이블
create table if not exists public.photo_edit_logs (
  id          uuid primary key default gen_random_uuid(),
  receipt_id  uuid not null references public.photo_receipts(id) on delete cascade,
  actor       text not null default 'customer',      -- customer | admin
  changed     text[] not null,                        -- 예: {edit_request, photos_add}
  summary     text,                                   -- 사람이 읽는 요약
  detail      jsonb,                                  -- 변경 전/후 등 상세
  created_at  timestamptz not null default now()
);
create index if not exists idx_editlog_receipt on public.photo_edit_logs(receipt_id, created_at desc);

alter table public.photo_edit_logs enable row level security;
alter table public.photo_edit_logs force row level security;

-- 3) 앱 설정 테이블 (신규접수 기본 보관일수 등)
create table if not exists public.app_settings (
  key   text primary key,
  value jsonb not null
);
insert into public.app_settings (key, value)
values ('default_hold_days', '3'::jsonb)
on conflict (key) do nothing;

alter table public.app_settings enable row level security;
alter table public.app_settings force row level security;

-- 4) service_role 권한 부여 (새 API키 프로젝트는 기본권한 자동적용이 안 될 수 있음)
grant all on public.photo_edit_logs to service_role;
grant all on public.app_settings   to service_role;
