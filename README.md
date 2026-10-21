# ร้านตำนัว – บันทึกรายวัน

หน้าเว็บกรอกยอดขาย เงินสดย่อย และบิลตลาดรายวัน เก็บข้อมูลใน Supabase และดาวน์โหลดสรุปเป็น Excel / PDF ได้
พนักงานเปิดลิงก์แล้วใช้ได้เลย ไม่ต้องสมัครหรือล็อกอิน

## ไฟล์
- `index.html` – หน้าเว็บ
- `config.js` – ค่าเชื่อมต่อ Supabase (Project URL + anon key)
- `supabase/schema.sql` – สร้างตาราง `tamnua_days`

## ตั้งค่าครั้งแรก
1. Supabase: สร้างโปรเจกต์ → SQL Editor → วางเนื้อหา `supabase/schema.sql` → Run
2. Supabase: Project Settings → API → คัดลอก Project URL และ anon public key ใส่ใน `config.js`
3. GitHub: Settings → Pages → Source: Deploy from a branch → `main` / root → Save
4. เปิดลิงก์ `https://<ชื่อผู้ใช้>.github.io/<ชื่อ repo>/`

## ข้อมูลที่เก็บ
ตาราง `tamnua_days` มี 1 แถวต่อวัน คอลัมน์ `data` (JSON) เก็บยอดขายแยกช่องทาง จำนวนบิล
รายการเงินสดย่อย บิลตลาด 5 ประเภท และยอดรวม (`totals`) ที่ใช้ต่อทำ P&L
