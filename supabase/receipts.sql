-- ร้านตำนัว: เงินเข้าแต่ละรอบ สำหรับหน้ากระทบยอด (อ่าน/แก้ได้เฉพาะเจ้าของที่ล็อกอิน)
create table if not exists public.tamnua_receipts (
  id           uuid primary key default gen_random_uuid(),
  received_on  date not null,
  channel      text not null,              -- cash | lineman | grab | credit | kplus
  amount       numeric(12,2) not null,
  fee          numeric(12,2) not null default 0,
  period_from  date not null,
  period_to    date not null,
  note         text,
  created_by   text,
  created_at   timestamptz not null default now()
);
create index if not exists tamnua_receipts_period_to on public.tamnua_receipts (period_to);
alter table public.tamnua_receipts enable row level security;
drop policy if exists "receipts owner" on public.tamnua_receipts;
create policy "receipts owner" on public.tamnua_receipts for all to authenticated
  using      ((auth.jwt() ->> 'email') = 'eawealthy@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'eawealthy@gmail.com');
