-- =====================================================================
-- 미리토퍼 사진 접수 시스템 - 테이블 스키마
-- Supabase SQL Editor 에서 순서대로 실행 (01 → 02 → 03 → 04)
-- =====================================================================

-- 확장: UUID / 암호화 유틸
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 접수 테이블
-- ---------------------------------------------------------------------
create table if not exists public.photo_receipts (
  id              uuid primary key default gen_random_uuid(),
  receipt_no      text not null unique,              -- 고객 표시용 접수완료번호 (MRTO-0721-1030-AB12)
  mall            text not null check (mall in ('coupang','naver','etc')),
  orderer_name    text not null,                     -- 주문자 이름
  address_dong    text not null,                     -- 배송지 주소(동까지)
  phone_last4     text not null check (phone_last4 ~ '^[0-9]{4}$'),  -- 전화번호 뒷 4자리(전체번호는 저장 안 함)
  edit_request    text,                              -- 사진 편집 요청사항
  password_hash   text not null,                     -- pbkdf2$iter$salt$hash (평문 저장 금지)
  photo_count     integer not null default 0,
  status          text not null default 'new'
                    check (status in ('new','photo_checked','producing','produced','shipped')),
  finalized       boolean not null default false,    -- 사진 업로드 완료 여부(미완료 접수는 자동 정리)
  photos_deleted  boolean not null default false,    -- 보관기간 만료로 사진 삭제됨
  created_at      timestamptz not null default now(),
  delete_at       timestamptz not null,              -- 사진 삭제 예정일시(접수완료 +3일)
  -- 비밀번호 레이트리밋
  fail_count      integer not null default 0,
  locked_until    timestamptz
);

comment on table public.photo_receipts is '미리토퍼 사진 접수건. 전체 전화번호/상세주소/주문번호/문구는 저장하지 않음';

create index if not exists idx_receipts_name       on public.photo_receipts (orderer_name);
create index if not exists idx_receipts_delete_at  on public.photo_receipts (delete_at);
create index if not exists idx_receipts_created_at on public.photo_receipts (created_at desc);
create index if not exists idx_receipts_status     on public.photo_receipts (status);

-- ---------------------------------------------------------------------
-- 사진 테이블 (Storage 오브젝트 메타데이터)
-- ---------------------------------------------------------------------
create table if not exists public.photo_files (
  id            uuid primary key default gen_random_uuid(),
  receipt_id    uuid not null references public.photo_receipts(id) on delete cascade,
  storage_path  text not null,                       -- 비공개 버킷 내 오브젝트 경로
  original_name text,
  size_bytes    bigint,
  content_type  text,
  sort_order    integer not null default 0,          -- 고객이 첨부한 순서
  uploaded      boolean not null default false,      -- 실제 업로드 완료 여부
  created_at    timestamptz not null default now()
);

create index if not exists idx_files_receipt on public.photo_files (receipt_id, sort_order);

-- ---------------------------------------------------------------------
-- 관리자 계정 (비밀번호 해시 저장) - 최초 1명은 아래 함수로 생성
-- ---------------------------------------------------------------------
create table if not exists public.admin_users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

-- 관리자 로그인 세션 실패 제한(브루트포스 방지)
create table if not exists public.admin_login_attempts (
  ip            text primary key,
  fail_count    integer not null default 0,
  locked_until  timestamptz
);

-- ---------------------------------------------------------------------
-- 접수완료번호 생성 헬퍼 (MRTO-MMDD-HHMM-XXXX, XXXX=랜덤 4자리 base32)
--   Edge Function 에서 생성하지만, DB 유니크 제약으로 중복 방지
-- ---------------------------------------------------------------------
