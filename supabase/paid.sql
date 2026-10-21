-- ร้านตำนัว: สถานะการโอนรายบิล (แก้ได้เฉพาะเจ้าของที่ล็อกอิน)
-- รันใน Supabase → SQL Editor → New query → Run

create table if not exists public.tamnua_paid (
  bill_key   text primary key,          -- 'YYYY-MM-DD|<id บิล>'
  date       date not null,
  paid_at    date not null default current_date,
  paid_by    text,
  created_at timestamptz not null default now()
);
alter table public.tamnua_paid enable row level security;

drop policy if exists "paid read"  on public.tamnua_paid;
drop policy if exists "paid write" on public.tamnua_paid;
create policy "paid read"  on public.tamnua_paid for select to anon, authenticated using (true);
create policy "paid write" on public.tamnua_paid for all to authenticated
  using      ((auth.jwt() ->> 'email') = 'eawealthy@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'eawealthy@gmail.com');

-- ให้เจ้าของที่ล็อกอินอยู่ ยังใช้หน้าบันทึกรายวันได้ตามปกติ
drop policy if exists "tamnua read"   on public.tamnua_days;
drop policy if exists "tamnua insert" on public.tamnua_days;
drop policy if exists "tamnua update" on public.tamnua_days;
create policy "tamnua read"   on public.tamnua_days for select to anon, authenticated using (true);
create policy "tamnua insert" on public.tamnua_days for insert to anon, authenticated with check (true);
create policy "tamnua update" on public.tamnua_days for update to anon, authenticated using (true) with check (true);
