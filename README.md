# ERP-GeminiArgon4 — Taky Apartment ERP (15 Rooms, 3 Floors)

ระบบบริหารจัดการหอพัก **Taky Apartment** (3 ชั้น 15 ห้อง: `101`–`105`, `201`–`205`, `301`–`305`) พัฒนาตามสถาปัตยกรรม Full-Stack Local LAN (Next.js + PostgreSQL + Prisma + Satang Integer Financial Engine)

## โครงสร้างสิ่งที่สร้างเสร็จแล้วใน Step 1 (Foundation & Financial Core)

* `prisma/schema.prisma`: โครงสร้างฐานข้อมูล 11 ตาราง เก็บจำนวนเงินทุกฟิลด์เป็น `Int` หน่วยสตางค์ (`1 บาท = 100 สตางค์`)
* `prisma/seed.ts`: ข้อมูลตั้งต้น 15 ห้อง (ขนาด 21 ตร.ม.) และเรทเริ่มต้น (ค่าไฟ `6.50` บ./หน่วย, ค่าน้ำ `10.00` บ./หน่วย ไม่มีขั้นต่ำ, ค่าส่วนกลาง `0` บ., ตัดรอบวันที่ `25`, กำหนดชำระวันที่ `5`)
* `src/lib/finance.ts`: โมดูลคำนวณการเงินบริสุทธิ์ (Pure Functions):
  * คำนวณค่าไฟทศนิยม `6.50` บาท/หน่วย แบบไม่เพี้ยนแม้แต่ 1 สตางค์
  * หารค่าเช่าเฉลี่ยรายวัน (Prorate ตัวหาร 30 วันคงที่) นับจากวันย้ายเข้าถึงวันที่ 25 + คูณเงินประกันอัตโนมัติ + หักเงินจอง
  * คำนวณมิเตอร์น้ำ-ไฟ พร้อมรองรับมิเตอร์ 4 หลักวนรอบ (`9999` $\rightarrow$ `0000`)
  * คำนวณค่าปรับล่าช้ารายวันอัตโนมัติหลังวันที่ 5 ของเดือนถัดไป
  * ทบยอดค้างชำระไปบิลวันที่ 25 เดือนใหม่ (`ROLLED_OVER`) โดยไม่นับยอดหนี้ซ้ำซ้อน
  * คำนวณใบสรุปหักเงินประกันตอนย้ายออก (`Move-Out Deposit Settlement`)
* `src/lib/promptpay.ts`: ตัวสร้าง EMVCo PromptPay QR Payload พร้อมการคำนวณ Checksum `CRC-16/CCITT-FALSE`
* `operations/audit-ledger.ts`: สคริปต์ Pre-Production Audit ตรวจสอบสมการบัญชี ความต่อเนื่องของเลขมิเตอร์ และ QR Checksum
* `tests/unit/finance.test.ts`: ชุดทดสอบ Unit Test & Audit ครบ 22 กรณีทดสอบ
* `prototype/index.html`: หน้าเว็บ Interactive Prototype ครบทั้ง 5 โมดูล
* `docs/TAKY_ERP_IMPLEMENTATION_PLAN.md`: เอกสาร Full-Stack Technical Specification & Build Roadmap

## วิธีนำโค้ดชุดนี้ขึ้น GitHub (`ramajittilearn-ctrl/ERP-GeminiArgon4`)

แตกไฟล์ `ERP-GeminiArgon4.zip` ลงในเครื่อง แล้วรันคำสั่งต่อไปนี้ในโฟลเดอร์โปรเจกต์:

```bash
git init
git branch -M main
git add .
git commit -m "feat(step-1): initialize Prisma schema, 15-room seed, Satang finance engine, PromptPay QR, and audit suite"
git remote add origin https://github.com/ramajittilearn-ctrl/ERP-GeminiArgon4.git
git push -u origin main
```

## วิธีรันระบบและทดสอบในเครื่อง

```bash
# 1. รันฐานข้อมูล PostgreSQL ผ่าน Docker
docker compose up -d

# 2. ติดตั้งแพ็กเกจและสร้างตาราง + Seed 15 ห้อง
npm install
npm run db:migrate
npm run db:seed

# 3. รันชุดทดสอบสูตรการเงินและ Audit
npm run test:unit
```
