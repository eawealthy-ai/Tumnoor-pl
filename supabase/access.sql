-- ร้านตำนัว: รายชื่อคนที่ดู Dashboard ได้ (เพิ่ม/ลบได้เฉพาะเจ้าของ แต่ละคนอ่านได้เฉพาะแถวของตัวเอง)
create table if not exists public.tamnua_access (
  email    text primary key,
  role     text not null default 'dashboard',
  added_at timestamptz not null default now()
);
alter table public.tamnua_access enable row level security;
drop policy if exists "access self read" on public.tamnua_access;
drop policy if exists "access owner all" on public.tamnua_access;
create policy "access self read" on public.tamnua_access for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));
create policy "access owner all" on public.tamnua_access for all to authenticated
  using      ((auth.jwt() ->> 'email') = 'eawealthy@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'eawealthy@gmail.com');
