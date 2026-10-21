-- ร้านตำนัว: ตารางเก็บข้อมูลรายวัน (1 แถว = 1 วัน)
-- รันใน Supabase → SQL Editor → New query → Run

create table if not exists public.tamnua_days (
  date        date primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);

alter table public.tamnua_days enable row level security;

-- ใครมีลิงก์ก็อ่าน เพิ่ม และแก้ไขได้ (ไม่มี PIN) แต่ลบข้อมูลจากหน้าเว็บไม่ได้
drop policy if exists "tamnua read"   on public.tamnua_days;
drop policy if exists "tamnua insert" on public.tamnua_days;
drop policy if exists "tamnua update" on public.tamnua_days;
create policy "tamnua read"   on public.tamnua_days for select to anon using (true);
create policy "tamnua insert" on public.tamnua_days for insert to anon with check (true);
create policy "tamnua update" on public.tamnua_days for update to anon using (true) with check (true);

-- ให้หน้าเว็บเห็นการแก้ไขจากเครื่องอื่นทันที
alter publication supabase_realtime add table public.tamnua_days;
