// ร้านตำนัว: ส่งแจ้งเตือน Telegram เมื่อมีการบันทึก/แก้ไขข้อมูลรายวัน หรือมีบิลใหม่ที่ต้องโอน
// เรียกจาก trigger ในฐานข้อมูล (pg_net) โดยส่งมาแค่ id ของเหตุการณ์ในตาราง tamnua_events
// ฟังก์ชันอ่านข้อมูลจริงจากตารางเองด้วย service role จึงไม่ต้องเชื่อข้อมูลจากผู้เรียก
// secret ที่ต้องตั้ง: TELEGRAM_BOT_TOKEN (chat id หาให้อัตโนมัติจากข้อความล่าสุดที่ส่งหาบอท)

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TG = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const SITE = "https://eawealthy-ai.github.io/Tumnoor-pl/";

const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };
async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init, headers: { ...H, ...(init.headers ?? {}) } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

type Bill = { id?: string; payee?: string; items?: { item?: string; amount?: number }[]; [k: string]: unknown };
const CATS = ["fresh", "dry", "supplies", "staffMeal", "transport"];
const CH: [string, string][] = [["cash", "เงินสด"], ["lineman", "LINE MAN"], ["grab", "Grab"], ["credit", "Credit"], ["kplus", "KPlus"]];
const n = (v: unknown) => { const x = parseFloat(String(v ?? "").replace(/,/g, "")); return isFinite(x) ? x : 0; };
const money = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: Math.round(v * 100) % 100 ? 2 : 0, maximumFractionDigits: 2 });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
const dmy = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

function pettyOf(d: any): Bill[] {
  const p = (d && d.petty) || [];
  const bills = p.length && !p[0].items ? [{ payee: "", items: p }] : p;
  return bills.map((b: Bill, i: number) => ({ ...b, id: b.id || "p" + i }));
}
function marketOf(d: any): Bill[] { return ((d && d.market) || []).map((m: Bill, i: number) => ({ ...m, id: m.id || "m" + i })); }
const pettyAmt = (b: Bill) => (b.items ?? []).reduce((a, x) => a + n(x.amount), 0);
const mktAmt = (m: Bill) => CATS.reduce((a, c) => a + n(m[c]), 0);
const salesOf = (d: any) => CH.reduce((a, [k]) => a + n(d?.sales?.[k]), 0);

function buildMessage(date: string, oldD: any, newD: any): string | null {
  if (!newD || newD.deleted) return null;                       // ย้ายวัน/ลบ: ไม่แจ้ง
  const isNew = !oldD || oldD.deleted;
  const s1 = salesOf(newD), s0 = isNew ? 0 : salesOf(oldD);
  const bills1 = [...pettyOf(newD).map((b) => ({ ...b, t: "เงินสดย่อย", a: pettyAmt(b) })), ...marketOf(newD).map((m) => ({ ...m, t: "บิลตลาด", a: mktAmt(m) }))].filter((b) => b.a);
  const bills0 = isNew ? [] : [...pettyOf(oldD).map((b) => ({ ...b, a: pettyAmt(b) })), ...marketOf(oldD).map((m) => ({ ...m, a: mktAmt(m) }))].filter((b) => b.a);
  const old = new Map(bills0.map((b) => [b.id, b]));
  const added = bills1.filter((b) => !old.has(b.id));
  const changed = bills1.filter((b) => old.has(b.id) && Math.abs(old.get(b.id)!.a - b.a) > 0.001);
  const removed = bills0.filter((b) => !bills1.some((x) => x.id === b.id));
  const salesChanged = Math.abs(s1 - s0) > 0.001;
  if (!isNew && !salesChanged && !added.length && !changed.length && !removed.length) return null;

  const L: string[] = [];
  L.push(`<b>${isNew ? "บันทึกใหม่" : "แก้ไขข้อมูล"} · ร้านตำนัว</b>`);
  L.push(`วันที่ ${dmy(date)}`);
  if (isNew || salesChanged) {
    L.push("");
    L.push(`ยอดขาย <b>${money(s1)}</b>${!isNew ? ` (เดิม ${money(s0)})` : ""}${n(newD.bills) ? ` · ${n(newD.bills)} บิล` : ""}`);
    const parts = CH.filter(([k]) => n(newD?.sales?.[k])).map(([k, l]) => `${l} ${money(n(newD.sales[k]))}`);
    if (parts.length) L.push(parts.join(" · "));
  }
  if (added.length) {
    L.push("");
    L.push(`<b>บิลใหม่ที่ต้องโอน ${added.length} บิล · รวม ${money(added.reduce((a, b) => a + b.a, 0))}</b>`);
    added.forEach((b) => L.push(`• ${b.t} · ${esc(b.payee || "ไม่ระบุผู้รับ")} ${money(b.a)}`));
  }
  if (changed.length) {
    L.push("");
    L.push("แก้ยอดบิล");
    changed.forEach((b) => L.push(`• ${b.t} · ${esc(b.payee || "ไม่ระบุผู้รับ")} ${money(old.get(b.id)!.a)} → ${money(b.a)}`));
  }
  if (removed.length) L.push(`\nลบบิล ${removed.length} บิล`);
  L.push(`\n<a href="${SITE}">เปิดหน้าบันทึก</a>`);
  return L.join("\n");
}

async function chatId(): Promise<string | null> {
  const fromEnv = Deno.env.get("TELEGRAM_CHAT_ID");
  if (fromEnv) return fromEnv;
  const row = await rest("tamnua_settings?key=eq.telegram_chat_id&select=value");
  if (row?.[0]?.value) return row[0].value;
  const r = await fetch(`https://api.telegram.org/bot${TG}/getUpdates`).then((x) => x.json()).catch(() => null);
  const ups = (r?.result ?? []).filter((u: any) => u.message?.chat?.id || u.my_chat_member?.chat?.id);
  const last = ups[ups.length - 1];
  const id = last?.message?.chat?.id ?? last?.my_chat_member?.chat?.id;
  if (!id) return null;
  await rest("tamnua_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key: "telegram_chat_id", value: String(id) }) });
  return String(id);
}

Deno.serve(async (req) => {
  try {
    const { id } = await req.json().catch(() => ({}));
    if (!id) return new Response("missing id", { status: 400 });
    const ev = (await rest(`tamnua_events?id=eq.${Number(id)}&sent_at=is.null&select=*`))?.[0];
    if (!ev) return new Response("no pending event", { status: 200 });
    await rest(`tamnua_events?id=eq.${ev.id}`, { method: "PATCH", body: JSON.stringify({ sent_at: new Date().toISOString() }) });
    const msg = buildMessage(ev.date, ev.old_data, ev.new_data);
    const note = (t: string) => rest(`tamnua_events?id=eq.${ev.id}`, { method: "PATCH", body: JSON.stringify({ result: t }) }).then(() => new Response(t, { status: 200 }));
    if (!msg) return note("nothing to notify");
    if (!TG) return note("TELEGRAM_BOT_TOKEN not set");
    const chat = await chatId();
    if (!chat) return note("no chat yet: send any message to the bot first");
    const r = await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text: msg, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    await rest(`tamnua_events?id=eq.${ev.id}`, { method: "PATCH", body: JSON.stringify({ result: `${r.status}` }) });
    return new Response(r.ok ? "sent" : `telegram ${r.status}`, { status: 200 });
  } catch (e) {
    return new Response(`error: ${(e as Error).message}`, { status: 500 });
  }
});
