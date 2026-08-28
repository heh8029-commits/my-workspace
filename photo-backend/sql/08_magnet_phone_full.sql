-- =====================================================================
-- 포토마그넷 접수에서 "전화번호 뒷자리 4자리" 대신 연락처 전체를 받기 위해
-- phone_last4 제약을 4자리 고정에서 (군인토퍼: 4자리 / 포토마그넷: 9~11자리)로 완화.
-- SQL Editor 에서 1회 실행.
-- =====================================================================
do $$
declare c text;
begin
  select conname into c from pg_constraint
    where conrelid = 'public.photo_receipts'::regclass
      and pg_get_constraintdef(oid) like '%phone_last4%';
  if c is not null then
    execute format('alter table public.photo_receipts drop constraint %I', c);
  end if;
end $$;

alter table public.photo_receipts
  add constraint photo_receipts_phone_last4_check
  check (phone_last4 ~ '^([0-9]{4}|[0-9]{9,11})$');
