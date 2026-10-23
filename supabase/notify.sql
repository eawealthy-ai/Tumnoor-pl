-- ร้านตำนัว: แจ้งเตือน Telegram เมื่อบันทึก/แก้ไขข้อมูลรายวัน หรือมีบิลใหม่ที่ต้องโอน
-- ใช้คู่กับ Edge Function supabase/functions/tamnua-notify (secret: TELEGRAM_BOT_TOKEN)
create extension if not exists pg_net with schema extensions;

create table if not exists public.tamnua_events (
  id bigserial primary key, date date not null, old_data jsonb, new_data jsonb,
  created_at timestamptz not null default now(), sent_at timestamptz, result text);
alter table public.tamnua_events enable row level security;

create table if not exists public.tamnua_settings (key text primary key, value text);
alter table public.tamnua_settings enable row level security;

create or replace function public.tamnua_days_notify()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare ev_id bigint;
begin
  if tg_op = 'UPDATE' and new.data is not distinct from old.data then return new; end if;
  insert into public.tamnua_events(date, old_data, new_data)
  values (new.date, case when tg_op = 'UPDATE' then old.data end, new.data) returning id into ev_id;
  perform net.http_post(
    url := 'https://nxfpawenxyxdwmccaavu.supabase.co/functions/v1/tamnua-notify',
    body := jsonb_build_object('id', ev_id),
    headers := '{"Content-Type":"application/json"}'::jsonb);
  return new;
end; $$;
revoke all on function public.tamnua_days_notify() from public, anon, authenticated;

drop trigger if exists tamnua_days_notify on public.tamnua_days;
create trigger tamnua_days_notify after insert or update on public.tamnua_days
for each row execute function public.tamnua_days_notify();
