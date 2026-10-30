# Full-Stack Technical Specification, Testing & Audit Plan: ERP-GeminiArgon4 (Taky Apartment 15 Rooms)

เอกสารฉบับนี้เป็น **Full-Stack Engineering Specification**, **ลำดับการพัฒนา (Build Sequence)** และ **แผนการทดสอบ/ตรวจสอบก่อนขึ้นระบบจริง (Testing & Pre-Production Audit Playbook)** สำหรับคลังโค้ดใหม่ **`ramajittilearn-ctrl/ERP-GeminiArgon4`** (โดยไม่แตะต้องคลังโค้ดเดิม [ramajittilearn-ctrl/ERP-TakyApartment](https://www.google.com/search?q=https://github.com/ramajittilearn-ctrl/ERP-TakyApartment) และ [ramajittilearn-ctrl/Taky-apartment](https://github.com/ramajittilearn-ctrl/Taky-apartment))

## 1. สถาปัตยกรรม Full-Stack และโครงสร้างโปรเจกต์ (`ERP-GeminiArgon4`)

ระบบใช้สถาปัตยกรรม **Modular Monolith บน Next.js App Router** เพื่อลดความซับซ้อนในการดูแลรักษา รันผ่าน Docker Compose บนเครื่องเซิร์ฟเวอร์ในหอพัก (Local LAN) และใช้ **Single-Admin Session**

### 1.1 Tech Stack แยกตามเลเยอร์

| เลเยอร์ (Layer) | เทคโนโลยี (Stack) | หน้าที่รับผิดชอบหลัก |
| :--- | :--- | :--- |
| **Database Layer** | PostgreSQL 16 (Docker Volume) | เก็บข้อมูลสัญญา มิเตอร์ ใบแจ้งหนี้ และประวัติการรับเงินแบบ ACID Transaction |
| **ORM & Data Access** | Prisma ORM (`prisma/schema.prisma`) | จัดการ Schema Migration, Type-safe Query และ Database Transaction (`prisma.$transaction`) |
| **Domain & Math Core** | TypeScript Pure Functions (`src/lib/finance.ts`) | คำนวณเงินหน่วยสตางค์ (Satang Integer), หารค่าเช่ารายวัน (Prorate), มิเตอร์วนรอบ, ค่าปรับรายวัน |
| **Backend / API Layer** | Next.js Route Handlers & Server Actions + Zod | ตรวจสอบความถูกต้องของข้อมูล (Validation), ประมวลผลคำสั่งธุรกิจ และจัดการไฟล์รูปสลิป |
| **Frontend UI Layer** | React 19, Tailwind CSS, Radix UI, Lucide Icons | หน้าจอผังห้อง 15 ห้อง, ตารางคีย์มิเตอร์แบบ Excel-like, การ์ดบิล LINE และหน้า Print A4 |
| **Document & QR Engine** | `promptpay-qr`, `qrcode`, CSS `@media print`, `html-to-image` | สร้าง EMVCo QR PromptPay ตามยอดเงินสุทธิ, ส่งออกรูปบิลลง LINE และจัดหน้าพิมพ์สลิปกระดาษ |
| **Infra & Ops Layer** | Docker Compose, Bash Cron (`pg_dump`), Vitest, Playwright | รันระบบในวง LAN หอพัก, สำรองข้อมูลอัตโนมัติรายวัน และตรวจสอบความถูกต้องของสูตรการเงิน |

### 1.2 โครงสร้างโฟลเดอร์มาตรฐาน (`ramajittilearn-ctrl/ERP-GeminiArgon4`)

```text
ERP-GeminiArgon4/
├── docker-compose.yml              # รัน PostgreSQL + Next.js App + Backup Service
├── Dockerfile                      # Production build สำหรับรันใน Local LAN
├── prisma/
│   ├── schema.prisma               # โครงสร้างตารางทั้งหมด (เก็บค่าเงินเป็น Int หน่วยสตางค์)
│   └── seed.ts                     # สร้างข้อมูลตั้งต้น: 3 ชั้น 15 ห้อง (101-305) และเรทเริ่มต้น
├── operations/
│   ├── backup.sh                   # สคริปต์ pg_dump + บีบอัดโฟลเดอร์รูปสลิปอัตโนมัติ
│   ├── restore.sh                  # สคริปต์กู้คืนข้อมูลจากไฟล์ Backup
│   └── audit-ledger.ts             # สคริปต์ Audit ตรวจสอบความตรงกันของยอดบิลและยอดรับเงินทั้งหมด
├── prototype/
│   └── index.html                  # Interactive UI Prototype สำหรับทดสอบ Flow ทั้ง 5 โมดูล
├── src/
│   ├── lib/
│   │   ├── db.ts                   # Prisma Client Singleton
│   │   ├── finance.ts              # [หัวใจหลัก] สูตรคำนวณเงินสตางค์, Prorate, มิเตอร์, ค่าปรับ
│   │   ├── promptpay.ts            # ฟังก์ชันสร้าง Payload QR PromptPay จากเบอร์ + ยอดเงินสุทธิ
│   │   └── validations.ts          # Zod Schemas สำหรับตรวจข้อมูลขาเข้าทุกฟอร์ม
│   ├── server/
│   │   ├── services/
│   │   │   ├── room.service.ts     # ลอจิกสถานะห้อง 15 ห้อง และการจอง (Reservation)
│   │   │   ├── lease.service.ts    # ลอจิกทำสัญญาเข้าอยู่ (Move-In) และย้ายออก (Move-Out)
│   │   │   ├── billing.service.ts  # ลอจิกจดมิเตอร์วันที่ 25, ออกบิลหมู่, ทบยอดค้างชำระ
│   │   │   ├── payment.service.ts  # ลอจิกรับชำระเงิน (เต็มจำนวน/แบ่งจ่าย) + แนบสลิป
│   │   │   └── report.service.ts   # ลอจิกรายจ่ายหอพักและสรุป P&L รายเดือน
│   ├── app/
│   │   ├── layout.tsx              # โครงหน้าเว็บหลัก + แถบเมนูภาษาไทยสำหรับเจ้าของหอ
│   │   ├── page.tsx                # หน้าแรก: ผังห้องพัก 15 ห้อง (15-Room Live Board) + KPI
│   │   ├── billing/
│   │   │   ├── page.tsx            # หน้าตารางคีย์มิเตอร์ 15 ห้องประจำวันที่ 25 (Bulk Meter Grid)
│   │   │   └── print/page.tsx      # หน้าแสดงการ์ดบิลส่ง LINE และหน้าพิมพ์สลิปกระดาษ A4
│   │   ├── leases/
│   │   │   ├── new/page.tsx        # ฟอร์มรับจอง / ทำสัญญาเข้าอยู่ (พร้อมเครื่องคิดเลข Prorate)
│   │   │   └── [id]/move-out/page.tsx # ฟอร์มแจ้งย้ายออกและใบสรุปหักเงินประกัน
│   │   ├── payments/page.tsx       # หน้ารับชำระเงิน แบ่งจ่าย แนบสลิป และดูรายการค้างชำระ
│   │   ├── expenses/page.tsx       # หน้าบันทึกรายจ่ายหอพักและรายงานกำไรสุทธิรายเดือน
│   │   ├── settings/page.tsx       # หน้าตั้งค่าเรทน้ำ-ไฟ, ค่าปรับรายวัน, เบอร์ PromptPay, Backup
│   │   └── api/                    # REST Endpoints สำหรับอัปโหลดสลิปและดาวน์โหลด Backup
└── tests/
    ├── unit/finance.test.ts        # ทดสอบสูตรคำนวณเงินทุกกรณีขอบเขต (Edge Cases)
    ├── integration/billing-tx.test.ts # ทดสอบ Database Transaction และการทบยอดค้างชำระ
    └── e2e/billing-flow.spec.ts    # ทดสอบ E2E ตั้งแต่รับจองจนถึงออกบิลและย้ายออก
```

## 2. สเปกฐานข้อมูลฉบับสมบูรณ์ (Database Schema Specification)

หลักการออกแบบฐานข้อมูลที่สำคัญที่สุดคือ **เก็บจำนวนเงินทุกฟิลด์เป็น `Int` ในหน่วยสตางค์ (`Satang`)** เช่น `3,500.00 บาท = 350000` และ `6.50 บาท = 650` เพื่อตัดปัญหา Floating-Point Error อย่างเด็ดขาด

| โมเดล (Model) | ฟิลด์และชนิดข้อมูล (Fields & Types) | กฎความสัมพันธ์และ Constraint สำคัญ |
| :--- | :--- | :--- |
| **`PropertySetting`** | `id` (String), `apartmentName` ("Taky Apartment"), `electricityRateSatang` (Int, default `650`), `waterRateSatang` (Int, default `1000`), `commonFeeSatang` (Int, default `0`), `billingDay` (Int, default `25`), `dueDayNextMonth` (Int, default `5`), `dailyLateFeeSatang` (Int, default `5000`), `defaultDepositMonths` (Int, default `1`), `promptPayId` (String), `tierStandardSatang` (`250000`), `tierSilverSatang` (`300000`), `tierGoldSatang` (`350000`) | มีเพียง 1 แถว (`singleton`) สำหรับเก็บค่าคอนฟิกกลางของหอพัก |
| **`Room`** | `id`, `roomNumber` (String, unique: `"101"`–`"305"`), `floorNumber` (Int: `1`–`3`), `sizeSqm` (Int, default `21`), `status` (`AVAILABLE`, `RESERVED`, `OCCUPIED`, `MAINTENANCE`), `lastWaterMeter` (Int), `lastElectricMeter` (Int), `notes` | จัดเรียงตาม `floorNumber` และ `roomNumber` เสมอ (15 แถวคงที่) |
| **`Tenant`** | `id`, `fullName`, `nickname`, `phone`, `lineId`, `nationalId`, `idCardImageUrl`, `emergencyContact`, `createdAt` | ผูกกับ `Lease` ได้หลายสัญญา (กรณีผู้เช่าเก่ากลับมาเช่าซ้ำ) |
| **`Reservation`** | `id`, `roomId`, `tenantName`, `phone`, `lineId`, `selectedTier` (`STANDARD`, `SILVER`, `GOLD`, `CUSTOM`), `agreedRentSatang`, `bookingDepositSatang`, `expectedMoveInDate`, `status` (`ACTIVE_BOOKING`, `CONVERTED_TO_LEASE`, `FORFEITED`), `convertedLeaseId` | 1 ห้องมีใบจองสถานะ `ACTIVE_BOOKING` ได้เพียง 1 ใบในเวลาเดียวกัน |
| **`Lease`** | `id`, `roomId`, `tenantId`, `packageTier` (`STANDARD`, `SILVER`, `GOLD`, `CUSTOM`), `monthlyRentSatang` (Int), `depositMonths` (Int), `securityDepositSatang` (Int), `bookingCreditSatang` (Int, default `0`), `startDate`, `endDate`, `initialWaterMeter` (Int), `initialElectricMeter` (Int), `status` (`ACTIVE`, `MOVED_OUT`) | จำกัดให้ 1 `Room` มี `Lease` สถานะ `ACTIVE` ได้เพียง 1 สัญญาเท่านั้น |
| **`MeterReading`** | `id`, `roomId`, `leaseId`, `billingPeriod` (String `"YYYY-MM"`), `readingDate`, `prevWater`, `currWater`, `waterRollover` (Boolean), `waterUnits` (Int), `prevElectric`, `currElectric`, `electricRollover` (Boolean), `electricUnits` (Int) | Unique index คู่ `(roomId, billingPeriod)` ป้องกันการคีย์มิเตอร์ซ้ำในเดือนเดียวกัน |
| **`Invoice`** | `id`, `invoiceNumber` (unique), `leaseId`, `roomId`, `billingPeriod` (`"YYYY-MM"`), `invoiceType` (`MOVE_IN`, `MONTHLY`, `MOVE_OUT`), `issueDate`, `dueDate`, `baseRentSatang`, `waterSatang`, `electricSatang`, `arrearsForwardSatang`, `lateFeeSatang`, `discountSatang`, `totalAmountSatang`, `paidAmountSatang`, `balanceDueSatang`, `status` (`DRAFT`, `ISSUED`, `PARTIAL`, `PAID`, `OVERDUE`, `ROLLED_OVER`), `rolledIntoInvoiceId` | เมื่อออกบิลวันที่ 25 เดือนใหม่ บิลเก่าที่ค้างชำระจะถูกเปลี่ยนสถานะเป็น `ROLLED_OVER` และชี้ `rolledIntoInvoiceId` ไปยังบิลใหม่ |
| **`InvoiceLineItem`** | `id`, `invoiceId`, `itemType` (`RENT`, `PRORATED_RENT`, `DEPOSIT`, `BOOKING_CREDIT`, `WATER`, `ELECTRICITY`, `ARREARS_FORWARD`, `LATE_FEE`, `CLEANING`, `DAMAGE`, `DISCOUNT`), `label`, `quantity`, `unitRateSatang`, `amountSatang` | เก็บรายละเอียดแต่ละบรรทัดเพื่อนำไปเรนเดอร์ลงการ์ด LINE และสลิปกระดาษ |
| **`Payment`** | `id`, `invoiceId`, `paidAt`, `amountSatang` (Int), `method` (`PROMPTPAY`, `BANK_TRANSFER`, `CASH`), `slipImageUrl` (String?), `referenceNote` | รองรับ 1 `Invoice` มีหลาย `Payment` (Partial Payment) |
| **`DepositSettlement`** | `id`, `leaseId` (unique), `moveOutDate`, `depositHeldSatang`, `unpaidArrearsSatang`, `finalWaterSatang`, `finalElectricSatang`, `cleaningFeeSatang`, `damageFeeSatang`, `otherDeductionSatang`, `netRefundSatang`, `note` | เก็บหลักฐานการเคลียร์เงินประกันตอนย้ายออก (ค่าเป็นบวก = คืนเงินผู้เช่า, ค่าเป็นลบ = ผู้เช่าต้องจ่ายเพิ่ม) |
| **`Expense`** | `id`, `expenseDate`, `category` (`MAINTENANCE`, `CLEANING`, `COMMON_UTILITY`, `SUPPLIES`, `OTHER`), `roomId` (String?), `title`, `amountSatang`, `receiptImageUrl`, `note` | บันทึกรายจ่ายหอพักเพื่อคำนวณกำไรสุทธิรายเดือน |

## 3. สเปกสูตรคำนวณและลอจิกฝั่ง Backend (`src/lib/finance.ts`)

### 3.1 สูตรคำนวณวันย้ายเข้าและการหารค่าเช่ารายวัน (Move-In & Proration to the 25th)
* **การเลือกแพ็กเกจและเงินประกัน**:
  $$\text{Security Deposit (Satang)} = \text{Monthly Rent (Satang)} \times \text{Deposit Multiplier Months}$$
* **การหารค่าเช่ารายวัน (Prorate ชนวันที่ 25 ด้วยตัวหาร 30 วันคงที่)**:
  $$\text{Daily Rent (Satang)} = \text{Math.round}\left(\frac{\text{Monthly Rent (Satang)}}{30}\right)$$
  $$\text{Prorated First Rent (Satang)} = \text{Daily Rent (Satang)} \times \text{Prorated Days}$$
* **ยอดสุทธิที่ต้องชำระในวันทำสัญญาเข้าอยู่**:
  $$\text{Move-In Total} = \text{Prorated First Rent} + \text{Security Deposit} - \text{Booking Deposit Credit}$$

### 3.2 สูตรคำนวณค่าน้ำ-ค่าไฟ และมิเตอร์วนรอบ (Utility & Rollover Math)
* ถ้า `currReading >= prevReading` และไม่ได้ติ๊กวนรอบ:
  $$\text{Units} = \text{currReading} - \text{prevReading}$$
* ถ้า `currReading < prevReading` และผู้ใช้ติ๊กยืนยันมิเตอร์ 4 หลักวนรอบ (`isRollover === true`):
  $$\text{Units} = (10000 - \text{prevReading}) + \text{currReading}$$
* การคิดเป็นเงินหน่วยสตางค์ (ไม่มีขั้นต่ำ):
  $$\text{Electricity Charge (Satang)} = \text{Electric Units} \times \text{electricityRateSatang}$$
  $$\text{Water Charge (Satang)} = \text{Water Units} \times \text{waterRateSatang}$$

### 3.3 สูตรคำนวณค่าปรับหลังวันที่ 5 และการทบยอดค้างชำระ (Late Fee & Arrears Engine)
* กำหนดชำระคือ **วันที่ 5 ของเดือนถัดไป** (`dueDate = YYYY-(MM+1)-05T23:59:59`)
* หากวันที่ตรวจสอบ `asOfDate > dueDate` และบิลยังมียอดค้าง (`balanceDueSatang > 0`):
  $$\text{Late Days} = \text{จำนวนวันเต็มที่เกินจากวันที่ 5}$$
  $$\text{Accrued Late Fee (Satang)} = \text{Late Days} \times \text{dailyLateFeeSatang}$$

## 4. ขั้นแรกจะเริ่มจากอะไร (Step 1 Kickoff Plan สำหรับ `ERP-GeminiArgon4`)

ในการเริ่มต้นลงมือทำในคลัง **`ramajittilearn-ctrl/ERP-GeminiArgon4`** เราจะเริ่มจาก **"Zero-UI Financial & Database Core" (แกนคำนวณการเงินและฐานข้อมูล)** เป็นก้าวแรกสุดก่อนสร้างหน้าเว็บด้วยขั้นตอนย่อย 4 ข้อนี้:

1. **Step 1.1 — Initialize Repo & Docker Environment**:
   * สร้างโครงโปรเจกต์ Next.js (TypeScript) + Prisma + Vitest พร้อมไฟล์ `docker-compose.yml` สำหรับรัน PostgreSQL 16 ในเครื่อง
   * เก็บไฟล์ Web App Prototype ไว้ในโฟลเดอร์ `prototype/index.html` เพื่อใช้เป็น Reference UI สำหรับทุกหน้าจอ
2. **Step 1.2 — เขียนและล็อก `src/lib/finance.ts` (Satang Pure Functions)**:
   * สร้างฟังก์ชันคำนวณหน่วยสตางค์ครบทั้ง 6 สูตร (แปลงบาท-สตางค์, Prorate หาร 30 ชนวันที่ 25, มิเตอร์น้ำ-ไฟและกรณีวนรอบ `9999`, ค่าปรับรายวันหลังวันที่ 5, การทบยอดค้างชำระ, และการหักเงินประกันย้ายออก)
3. **Step 1.3 — เขียนชุดทดสอบ `tests/unit/finance.test.ts` ให้ผ่าน 100%**:
   * รันทดสอบทุกกรณีขอบเขต (Edge Cases) จนมั่นใจว่าไม่มีความคลาดเคลื่อนแม้แต่ 1 สตางค์
4. **Step 1.4 — สร้าง `prisma/schema.prisma` และ `prisma/seed.ts` (15 ห้อง)**:
   * รัน Migration สร้างตารางทั้ง 11 ตาราง และ Seed ห้อง `101`–`305` พร้อมเรทเริ่มต้น (ไฟ `6.50` บ., น้ำ `10.00` บ., ส่วนกลาง `0` บ.)

## 5. กลยุทธ์การทดสอบระบบ 4 ระดับ (4-Tier Testing Strategy)

| ระดับการทดสอบ | เครื่องมือ | สิ่งที่ทดสอบและกรณีดักจับบั๊ก (Mandatory Test Cases) |
| :--- | :--- | :--- |
| **1. Unit Tests (สูตรการเงินล้วน)** | `Vitest` | • **คูณเรททศนิยม 6.50 บาท**: ทดสอบหน่วยไฟเป็นเลขคี่ (เช่น `115 หน่วย × 650 สตางค์ = 747.50 บาท`) ต้องไม่เกิดเศษ `.500000001`<br>• **Prorate ชนวันที่ 25**: ทดสอบย้ายเข้าวันที่ 10 ต.ค. (อยู่ 16 วันถึงวันที่ 25) ของแพ็กเกจ 2,500 / 3,000 / 3,500 บาท<br>• **มิเตอร์วนรอบ 4 หลัก**: ทดสอบ `9985 → 0065` เมื่อเปิด `isRollover` ต้องได้ `80 หน่วย` และเมื่อปิด `isRollover` ต้องโยน Error ทันที<br>• **ค่าปรับเกินวันที่ 5**: ทดสอบจ่ายวันที่ 5 (ค่าปรับ `0`), จ่ายวันที่ 8 (ปรับ `3 วัน`), และบิลที่สถานะ `PAID` แล้วต้องไม่ถูกคิดค่าปรับเพิ่ม |
| **2. Integration & DB Transaction Tests** | `Vitest` + PostgreSQL | • **Arrears Rollover ไม่เบิ้ลยอด**: เมื่อออกบิลวันที่ 25 เดือนใหม่ บิลเก่าที่ค้างต้องถูกเปลี่ยนสถานะเป็น `ROLLED_OVER` และยอดคงเหลือเดิมต้องไม่ถูกนับซ้ำ 2 บิล<br>• **Partial Payment Ledger**: ทดสอบแบ่งจ่าย 3 งวดย่อยใน 1 บิล ยอด `paidAmountSatang + balanceDueSatang` ต้องเท่ากับ `totalAmountSatang` เสมอ<br>• **Idempotency (กันกดปุ่มเบิ้ล)**: กดออกบิลวันที่ 25 ซ้ำในเดือนเดียวกันต้องไม่สร้างบิลซ้ำ (`Unique Constraint`) |
| **3. End-to-End (E2E) Browser Tests** | `Playwright` | จำลองการใช้งานจริงของเจ้าของหอ: `รับจองห้อง 104` $\rightarrow$ `เปลี่ยนใบจองเป็นเข้าอยู่จริง (หักเงินจอง)` $\rightarrow$ `กรอกมิเตอร์ 15 ห้องวันที่ 25` $\rightarrow$ `กดรับเงินแบ่งจ่าย` $\rightarrow$ `แจ้งย้ายออกและออกใบคืนเงินประกัน` |
| **4. Physical Output & Banking QR Tests** | แอปธนาคารจริง + เครื่องพิมพ์ A4 | • **สแกน QR PromptPay จริง**: ใช้แอปธนาคารบนมือถือสแกน QR จากหน้าจอ ต้องขึ้นชื่อบัญชีที่ถูกต้องและยอดเงินตรงตามบิลถึงหลักสตางค์ (`.50`)<br>• **พิมพ์สลิปกระดาษ A4 จริง**: ทดสอบสั่งพิมพ์ลงกระดาษ A4 จริง ตรวจระยะขอบและเส้นประตัดครึ่งหน้าสำหรับสอดใต้ประตู |

## 6. กระบวนการ Audit 5 ด่านก่อนใช้งานจริง (Pre-Production Audit Protocol)

ก่อนนำระบบขึ้นรันจริงในหอพัก (Production Cutover) ต้องผ่านการตรวจสอบ (Audit) ครบทั้ง 5 ด่านดังนี้:

### ด่านที่ 1: Financial Reconciliation Audit (ตรวจสอบสมการบัญชี 100%)
* รันสคริปต์ `operations/audit-ledger.ts` เพื่อตรวจทุกแถวในฐานข้อมูลว่าสมการบัญชีเป็นจริงเสมอ:
  $$\text{Invoice.totalAmountSatang} = \sum \text{InvoiceLineItem.amountSatang}$$
  $$\text{Invoice.balanceDueSatang} = \text{Invoice.totalAmountSatang} - \sum \text{Payment.amountSatang}$$
* **Shadow Run 1 รอบบิลจริง**: นำเลขมิเตอร์จริงของหอพักทั้ง 15 ห้องในรอบวันที่ 25 มาคีย์ลงระบบ แล้วตรวจเทียบยอดสุทธิทั้ง 15 ห้องกับวิธีคิดเดิมทีละห้อง ต้องตรงกันทุกบาททุกสตางค์

### ด่านที่ 2: Room & Lease State Integrity Audit (ตรวจสอบความถูกต้องของสถานะห้อง)
* ตรวจสอบว่าห้องที่มีสถานะ `OCCUPIED` ทุกห้องมีสัญญา `Lease` สถานะ `ACTIVE` ผูกอยู่เพียง 1 สัญญาเท่านั้น
* ตรวจสอบความต่อเนื่องของเลขมิเตอร์ (`Continuity Check`): เลขมิเตอร์ตั้งต้นของรอบบิลใหม่ (`prevWater`, `prevElectric`) ต้องเท่ากับเลขมิเตอร์ปลายงวดของรอบบิลก่อนหน้า (`currWater`, `currElectric`) ทุกห้องโดยไม่มีเลขกระโดดหรือตกหล่น

### ด่านที่ 3: Backup & Disaster Recovery Audit (ซ้อมกู้คืนข้อมูลเมื่อคอมพัง)
* ทดสอบรัน `operations/backup.sh` เพื่อสร้างไฟล์สำรองฐานข้อมูล (`.sql`) และไฟล์ซิปรูปสลิปโอนเงิน
* **ซ้อมกู้ข้อมูลจริง (Restore Drill)**: ทดลองล้างฐานข้อมูลจำลองทิ้ง แล้วรัน `operations/restore.sh` จากไฟล์ Backup เพื่อยืนยันว่าข้อมูลผู้เช่า เลขมิเตอร์ บิล และรูปสลิปทั้ง 15 ห้องกลับคืนมาครบ 100% ภายใน 5 นาที

### ด่านที่ 4: Security & Local LAN Hardening Audit (ตรวจสอบความปลอดภัย)
* ตรวจสอบการตั้งค่ารหัสผ่าน Admin และ Cookie Session (`HttpOnly`, `SameSite=Lax`)
* ตรวจสอบระบบอัปโหลดสลิปโอนเงิน: บังคับรับเฉพาะไฟล์รูปภาพ/PDF ไม่เกิน 5MB และตั้งชื่อไฟล์ใหม่ด้วย UUID เพื่อป้องกัน Path Traversal
* ตรวจสอบ `docker-compose.yml` ว่าพอร์ตฐานข้อมูล PostgreSQL ถูกล็อกให้อยู่เฉพาะใน Docker Network หรือ Localhost เท่านั้น

### ด่านที่ 5: Operator Speed & UX Audit (ตรวจสอบความเร็วหน้างานจริง)
* ทดสอบคีย์เลขมิเตอร์น้ำ-ไฟตั้งต้นตั้งแต่ห้อง `101` ถึง `305` รวดเดียวด้วยปุ่ม `Tab`/`Enter` บนคีย์บอร์ด จนถึงกดปุ่มออกบิลและสั่งพิมพ์สลิป A4 ต้องใช้เวลารวมทั้งสิ้นไม่เกิน **3–5 นาที**
