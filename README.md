# Taky Apartment ERP (`ramajittilearn-ctrl/ERP-GeminiArgon4`)

ระบบบริหารหอพัก **Taky Apartment (15 ห้อง • 3 ชั้น • ขนาด 21 ตร.ม. ทุกห้อง)** พัฒนาด้วยสถาปัตยกรรม Full-Stack Next.js App Router (TypeScript) + PostgreSQL 16 + Prisma ORM สำหรับรันใช้งานในวงแลนหอพัก (**Local LAN via Docker Compose**)

## สรุปฟีเจอร์ครบทั้ง 4 เฟส และ 3 Milestones สุดท้าย (Production-Ready)

1. **แกนคำนวณการเงินหน่วยสตางค์ (`src/lib/finance.ts` & `src/lib/promptpay.ts`)**:
   - คำนวณเงินทุกฟิลด์เป็นจำนวนเต็มหน่วยสตางค์ (`1 บาท = 100 สตางค์`) ป้องกันปัญหาทศนิยมคลาดเคลื่อนจากค่าไฟ `6.50 บาท/หน่วย` (`650 สตางค์`) และค่าน้ำ `10.00 บาท/หน่วย` (`1000 สตางค์`, ไม่มีขั้นต่ำ, ไม่มีค่าส่วนกลาง)
   - รองรับการเลือกแพ็กเกจรายสัญญา (`STANDARD` 2,500 บ., `SILVER` 3,000 บ., `GOLD` 3,500 บ., หรือ `CUSTOM`)
   - รองรับการหารค่าเช่ารายวัน (`Prorate` ด้วยตัวหาร 30 วันคงที่ นับจากวันเข้าอยู่จนถึงวันตัดรอบที่ 25) และหักเงินมัดจำจองห้องอัตโนมัติ
   - รองรับมิเตอร์ 4 หลักวนรอบ (`9999 → 0000`), ค่าปรับรายวันหลังวันที่ 5 (`50 บาท/วัน`), การแบ่งจ่าย (`PARTIAL`), การทบยอดค้างชำระไปเดือนถัดไป (`ROLLED_OVER`), และการสร้าง EMVCo PromptPay QR Code (CRC-16/CCITT-FALSE)

2. **Milestone 1 — ชั้นเชื่อมต่อฐานข้อมูลจริง `prisma.$transaction` & ระบบอัปโหลดรูปสลิปปลอดภัย**:
   - `src/server/repositories/prisma-erp.repository.ts`: ประมวลผลการจองห้อง, ทำสัญญาเข้าอยู่, ออกบิลวันที่ 25 พร้อมทบยอดค้างชำระ, รับชำระเงินแบ่งจ่าย, และแจ้งย้ายออกคืนเงินประกันภายใต้ `prisma.$transaction`
   - `src/app/api/upload-slip/route.ts`: ตรวจสอบไฟล์สลิปโอนเงิน (`JPG`, `PNG`, `WEBP`, `PDF` เท่านั้น), จำกัดขนาดไม่เกิน `5 MB`, และเปลี่ยนชื่อไฟล์เป็น `UUID` ป้องกัน Path Traversal

3. **Milestone 2 — ระบบล็อกอินเจ้าของหอพัก (`Single-Admin Auth` บน Local LAN)**:
   - `src/lib/auth.ts`, `src/middleware.ts`, `src/app/api/auth/route.ts`, `src/app/login/page.tsx`: ระบบยืนยันตัวตนด้วย `ADMIN_PASSWORD` และคุกกี้ `HttpOnly; SameSite=Lax` ที่ลงนามด้วย `HMAC-SHA256`

4. **Milestone 3 — หน้าจอ Interactive Next.js App Router ครบ 5 โมดูล & 5-Gate Audit**:
   - `src/app/page.tsx` และ `src/components/BulkMeterGrid.tsx`: ผังห้อง 15 ห้องพร้อม Modal ทั้ง 4 ตัว, ตารางคีย์มิเตอร์วันที่ 25 ที่กดปุ่ม `Enter` / `ArrowDown` เลื่อนลงห้องถัดไปได้ทันทีเหมือน Excel, ศูนย์ส่งการ์ดบิล LINE + พิมพ์สลิปกระดาษ A4 (`2 ห้องต่อแผ่น`), ระบบแบ่งจ่ายแนบสลิป, และหน้าตรวจสอบ **5-Gate Pre-Production Audit**

## วิธีติดตั้งและรันใช้งานจริงในหอพัก (Local LAN Deployment)

```bash
# 1. คัดลอกไฟล์ตั้งค่าสภาพแวดล้อม
cp .env.example .env

# 2. รันฐานข้อมูล PostgreSQL 16 และเว็บแอปด้วย Docker Compose
docker compose up -d --build

# 3. สร้างตารางฐานข้อมูลและ Seed ห้องพักทั้ง 15 ห้อง (101-305)
npx prisma migrate deploy
npx prisma db seed

# 4. รันชุดทดสอบ Unit + Integration + E2E และสคริปต์ตรวจ Audit สมการบัญชี 5 ด่าน
npm test
npx tsx operations/audit-ledger.ts
```
