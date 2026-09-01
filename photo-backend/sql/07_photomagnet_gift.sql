-- =====================================================================
-- 포토마그넷 지인용(선물) 접수 - 링크로 받는사람이 직접 이름/연락처/주소를 입력하고
-- 사진을 올리게 하는 기능. Supabase SQL Editor 에서 1회 실행.
-- =====================================================================

-- 1) 지인용 여부 + 관리자가 정한 타이틀(예: '도경이네')
alter table public.photo_receipts
  add column if not exists is_gift boolean not null default false,
  add column if not exists gift_title text;

-- 2) 지인용은 배송을 위해 "전화 뒷자리 4자리"가 아니라 전체 전화번호를 저장해야 한다.
--    기존 제약(정확히 4자리)을 완화해서 4~20자리 숫자를 모두 허용한다.
--    (일반 접수는 계속 4자리만 들어오므로 동작에 영향 없음)
alter table public.photo_receipts drop constraint if exists photo_receipts_phone_last4_check;
alter table public.photo_receipts add constraint photo_receipts_phone_last4_check
  check (phone_last4 ~ '^[0-9]{4,20}$');

create index if not exists idx_receipts_is_gift on public.photo_receipts (is_gift);
