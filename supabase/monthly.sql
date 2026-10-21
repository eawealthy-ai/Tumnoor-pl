-- ร้านตำนัว: ตัวเลขรายเดือนที่กรอกเพิ่มในหน้า P&L (เงินเดือน ค่าเช่า ค่าไฟ รายการอื่นๆ) เฉพาะเจ้าของ
create table if not exists public.tamnua_monthly (
  month      text primary key,            -- 'YYYY-MM'
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.tamnua_monthly enable row level security;
drop policy if exists "monthly owner" on public.tamnua_monthly;
create policy "monthly owner" on public.tamnua_monthly for all to authenticated
  using      ((auth.jwt() ->> 'email') = 'eawealthy@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'eawealthy@gmail.com');
