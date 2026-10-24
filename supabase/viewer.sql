-- ร้านตำนัว: ผู้ดู (viewer) ดูได้ทุกหน้าที่ล็อก แต่แก้ไขไม่ได้
-- รายชื่อผู้ดูอยู่ใน tamnua_access · เจ้าของ (eawealthy@gmail.com) เพิ่ม/ลบได้คนเดียว
create table if not exists public.tamnua_access (
  email    text primary key,
  role     text not null default 'viewer',
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

create or replace function public.tamnua_is_viewer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.tamnua_access where lower(email) = lower(auth.jwt() ->> 'email'))
$$;
revoke all on function public.tamnua_is_viewer() from public, anon;
grant execute on function public.tamnua_is_viewer() to authenticated;

drop policy if exists "monthly viewer read" on public.tamnua_monthly;
create policy "monthly viewer read" on public.tamnua_monthly for select to authenticated using (public.tamnua_is_viewer());
drop policy if exists "receipts viewer read" on public.tamnua_receipts;
create policy "receipts viewer read" on public.tamnua_receipts for select to authenticated using (public.tamnua_is_viewer());

insert into public.tamnua_access(email, role) values ('manager@tumnoor.local', 'viewer') on conflict (email) do update set role = 'viewer';
