-- =====================================================================
-- 미리토퍼 사진 접수 - 포토마그넷 상품 추가 (추가 마이그레이션)
-- 기존 컬럼/데이터는 건드리지 않고 추가만 함. SQL Editor 에서 1회 실행.
-- =====================================================================

-- 1) 상품 종류 구분 + 포토마그넷 전용 필드
alter table public.photo_receipts
  add column if not exists product_type text not null default 'topper'
    check (product_type in ('topper','magnet')),
  add column if not exists order_no text,                 -- 주문번호(포토마그넷)
  add column if not exists set_size integer
    check (set_size in (6,9)),                              -- 세트 구성(6/9개입, 63.5x63.5mm 포토마그넷)
  add column if not exists phrase_enabled boolean not null default false,
  add column if not exists phrase_text text;                -- 문구(포토마그넷)
  -- 사진 배치는 고객이 업로드 시 정사각형 크롭 도구로 직접 맞추므로
  -- 별도 preset 컬럼 없이, 업로드되는 이미지 자체가 이미 잘린 결과물임.

-- 포토마그넷은 배송지 주소(동)를 받지 않으므로 not null 제약 완화
-- (기존 군인토퍼 행/로직은 계속 값이 채워지므로 영향 없음)
alter table public.photo_receipts
  alter column address_dong drop not null;

create index if not exists idx_receipts_product_type on public.photo_receipts (product_type);

-- 참고: 포토마그넷은 세트 칸(6 또는 9칸) 각각에 사진을 1장씩 업로드하는 방식이라
-- 사진별 수량 컬럼은 따로 두지 않음(같은 사진을 여러 칸에 넣으면 그만큼 제작됨).
-- 슬롯 순서는 기존 photo_files.sort_order 를 그대로 사용.
