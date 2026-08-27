-- =====================================================================
-- 관리자 간편등록(마그넷)에서 임의 장수(6/9 외 숫자)를 허용하기 위해
-- set_size 제약을 6/9 고정에서 1~99 범위로 완화. SQL Editor 에서 1회 실행.
-- =====================================================================
do $$
declare c text;
begin
  select conname into c from pg_constraint
    where conrelid = 'public.photo_receipts'::regclass
      and pg_get_constraintdef(oid) like '%set_size%';
  if c is not null then
    execute format('alter table public.photo_receipts drop constraint %I', c);
  end if;
end $$;

alter table public.photo_receipts
  add constraint photo_receipts_set_size_check
  check (set_size is null or (set_size between 1 and 99));
