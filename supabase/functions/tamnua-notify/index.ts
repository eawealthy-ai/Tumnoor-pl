// ร้านตำนัว: ส่งแจ้งเตือน Telegram เมื่อมีการบันทึก/แก้ไขข้อมูลรายวัน หรือมีบิลใหม่ที่ต้องโอน
// เรียกจาก trigger ในฐานข้อมูล (pg_net) โดยส่งมาแค่ id ของเหตุการณ์ในตาราง tamnua_events
// ฟังก์ชันอ่านข้อมูลจริงจากตารางเองด้วย service role จึงไม่ต้องเชื่อข้อมูลจากผู้เรียก
// + สรุปประจำวัน: เรียกจาก pg_cron ด้วย {daily:true, token, mode:"night"|"catchup"}
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
const CH: [string, string][] = [["cash", "เงินสด"], ["lineman", "LINE MAN"], ["grab", "Grab"], ["robinhood", "Robinhood"], ["credit", "Credit"], ["kplus", "KPlus"]];
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

// ---------- สรุปประจำวัน (เรียกจาก pg_cron: {daily:true, token, date?}) ----------
const COGS_CATS = new Set(["raw_fresh", "raw_dry", "rice", "oil", "gas", "beer", "water", "coke", "ice", "dessert"]);
const pct = (a: number, b: number) => (b ? (a / b * 100).toFixed(1) + "%" : "–");
const isoAdd = (iso: string, k: number) => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + k); return d.toISOString().slice(0, 10); };
const dowOf = (iso: string) => new Date(iso + "T00:00:00Z").getUTCDay();
const foodOf = (d: any) => {
  const m = marketOf(d).reduce((a, x) => a + n(x.fresh) + n(x.dry), 0);
  const p = pettyOf(d).reduce((a, b) => a + (b.items ?? []).reduce((s: number, i: any) => s + (COGS_CATS.has(i.cat) ? n(i.amount) : 0), 0), 0);
  return m + p;
};
const TH_DOW = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

async function dailySummary(date: string): Promise<string> {
  const m0 = date.slice(0, 8) + "01";
  const y = +date.slice(0, 4), mo = +date.slice(5, 7), dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const mEnd = date.slice(0, 8) + String(dim).padStart(2, "0");
  const from = isoAdd(m0, -7);
  const rows: any[] = await rest(`tamnua_days?date=gte.${from}&date=lte.${mEnd}&select=date,data&order=date`);
  const D = new Map<string, any>(rows.filter((r) => r.data && !r.data.deleted).map((r) => [r.date, r.data]));
  const day = D.get(date);
  const sales = day ? salesOf(day) : 0, food = day ? foodOf(day) : 0, bills = day ? n(day.bills) : 0;
  const lw = D.get(isoAdd(date, -7)), lwS = lw ? salesOf(lw) : 0;
  // เดือนนี้ถึงวันนี้
  let mS = 0, mF = 0; const byDow: Record<number, number[]> = {};
  for (const [d, v] of D) { if (d < m0 || d > date) continue; const s = salesOf(v); mS += s; mF += foodOf(v); if (s > 0) (byDow[dowOf(d)] ??= []).push(s); }
  const all = Object.values(byDow).flat(), avgAll = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0;
  let est = 0, left = 0;
  for (let d = isoAdd(date, 1); d <= mEnd; d = isoAdd(d, 1)) { const a = byDow[dowOf(d)]; est += a && a.length ? a.reduce((x, z) => x + z, 0) / a.length : avgAll; left++; }
  const fc = mS + est, budget = fc * 0.4, rem = budget - mF;
  // บิลค้างโอนเดือนนี้
  const paid: any[] = await rest(`tamnua_paid?date=gte.${m0}&date=lte.${mEnd}&select=bill_key`);
  const P = new Set(paid.map((p) => p.bill_key));
  let uN = 0, uA = 0;
  for (const [d, v] of D) { if (d < m0 || d > date) continue;
    for (const b of pettyOf(v)) { const a = pettyAmt(b); if (a && !P.has(`${d}|${b.id}`)) { uN++; uA += a; } }
    for (const m of marketOf(v)) { const a = mktAmt(m); if (a && !P.has(`${d}|${m.id}`)) { uN++; uA += a; } } }
  const L: string[] = [];
  L.push(`<b>📊 สรุปประจำวัน · ร้านตำนัว</b>`);
  L.push(`วัน${TH_DOW[dowOf(date)]}ที่ ${dmy(date)}`);
  L.push("");
  if (!day || !sales) L.push("⚠️ ยังไม่ได้บันทึกยอดขายของวันนี้");
  else {
    L.push(`ยอดขาย <b>${money(sales)}</b>${bills ? ` · ${bills} บิล · เฉลี่ย ${money(Math.round(sales / bills))}/บิล` : ""}`);
    if (lwS) L.push(`เทียบ${TH_DOW[dowOf(date)]}ที่แล้ว ${money(lwS)} (${sales >= lwS ? "+" : ""}${((sales - lwS) / lwS * 100).toFixed(1)}%)`);
    L.push(`ต้นทุนอาหารวันนี้ ${money(food)} (${pct(food, sales)})`);
  }
  L.push("");
  L.push(`<b>เดือนนี้ (1–${+date.slice(8)})</b>`);
  L.push(`ยอดขายสะสม ${money(mS)}`);
  L.push(`ต้นทุนอาหารสะสม ${money(mF)} (<b>${pct(mF, mS)}</b>) · เป้า 40%`);
  if (left) {
    L.push(`ประมาณการยอดขายทั้งเดือน (DoW) ${money(Math.round(fc))}`);
    L.push(rem > 0 ? `งบต้นทุนอาหารเหลือ <b>${money(Math.round(rem))}</b> · เฉลี่ยวันละ ${money(Math.round(rem / left))} (${left} วัน)` : `⚠️ ต้นทุนอาหารเกินงบ 40% ของทั้งเดือนแล้ว ${money(Math.round(-rem))}`);
  }
  if (uN) L.push(`\nบิลค้างโอน ${uN} บิล · รวม ${money(uA)}`);
  L.push(`\n<a href="${SITE}">เปิดแอป</a>`);
  return L.join("\n");
}

async function sendTG(text: string) {
  const chat = await chatId(); if (!chat || !TG) return "no chat/token";
  const r = await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: true }) });
  return String(r.status);
}

async function handleDaily(body: any) {
  const tok = (await rest("tamnua_settings?key=eq.daily_token&select=value"))?.[0]?.value;
  if (!tok || body.token !== tok) return new Response("forbidden", { status: 403 });
  const bkk = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  // mode "night": วันนี้ · mode "catchup": เมื่อวาน (ส่งซ้ำเฉพาะถ้ามีการแก้ข้อมูลหลังส่งสรุป)
  const date = body.date || (body.mode === "catchup" ? isoAdd(bkk, -1) : bkk);
  const row = (await rest(`tamnua_days?date=eq.${date}&select=data`))?.[0];
  const stamp = row?.data?.updatedAt || "none";
  const key = `daily_sent_${date}`;
  const prev = (await rest(`tamnua_settings?key=eq.${key}&select=value`))?.[0]?.value;
  if (body.mode === "catchup" && (!prev || prev === stamp)) return new Response("no change", { status: 200 });
  if (body.mode !== "catchup" && prev && !body.force) return new Response("already sent", { status: 200 });
  const msg = (body.mode === "catchup" ? "🔄 <b>อัปเดต</b> (มีการบันทึกเพิ่มหลังส่งสรุป)\n" : "") + await dailySummary(date);
  const res = await sendTG(msg);
  await rest("tamnua_settings", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ key, value: stamp }) });
  return new Response(res, { status: 200 });
}

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    if (body && body.daily) return await handleDaily(body);
    const { id } = body || {};
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
