'use client';

// =============================================================================
// Taky Apartment ERP — Dedicated 25th Bulk Meter Entry Grid Component (Gate 5)
// Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
// Supports Enter / ArrowDown / ArrowUp Keyboard Navigation & 4-Digit Rollover
// =============================================================================

import React from 'react';
import { formatBaht, calculateMeterUnits } from '../lib/finance';

export interface BulkMeterGridProps {
  occupiedRooms: Array<{
    roomNumber: string;
    lastWaterMeter: number;
    lastElectricMeter: number;
  }>;
  leases: Array<{
    roomNumber: string;
    tenantName: string;
    packageTier: string;
    monthlyRentSatang: number;
    status: string;
  }>;
  settings: {
    waterRateSatang: number;
    electricityRateSatang: number;
  };
  meterDrafts: Record<
    string,
    { currWater: number; waterRollover: boolean; currElectric: number; electricRollover: boolean }
  >;
  onChangeDraft: (
    roomNumber: string,
    patch: Partial<{
      currWater: number;
      waterRollover: boolean;
      currElectric: number;
      electricRollover: boolean;
    }>
  ) => void;
  onCommitBatch: () => void;
}

export default function BulkMeterGrid({
  occupiedRooms,
  leases,
  settings,
  meterDrafts,
  onChangeDraft,
  onCommitBatch
}: BulkMeterGridProps) {
  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    colType: 'water' | 'elec'
  ) {
    const totalRows = occupiedRooms.length;
    if (totalRows === 0) return;

    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextRow = (rowIndex + 1) % totalRows;
      const nextEl = document.getElementById(`meter-grid-${colType}-${nextRow}`);
      if (nextEl) (nextEl as HTMLInputElement).focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevRow = (rowIndex - 1 + totalRows) % totalRows;
      const prevEl = document.getElementById(`meter-grid-${colType}-${prevRow}`);
      if (prevEl) (prevEl as HTMLInputElement).focus();
    }
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0 }}>
            ตารางจดมิเตอร์น้ำ-ไฟประจำวันที่ 25 (กด Enter เพื่อเลื่อนลงห้องถัดไปอัตโนมัติ)
          </h3>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
            รองรับมิเตอร์ 4 หลักวนรอบ (9999 → 0000) และคำนวณหน่วยสตางค์ (ค่าไฟ 6.50 บ./หน่วย, ค่าน้ำ 10.00 บ./หน่วย)
          </p>
        </div>
        <button
          onClick={onCommitBatch}
          style={{
            backgroundColor: '#059669',
            color: '#ffffff',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.6rem 1.1rem',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          ✅ ยืนยันและออกบิลประจำวันที่ 25 ทั้งหมด
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
        <thead>
          <tr style={{ backgroundColor: '#0f172a', color: '#ffffff', textAlign: 'left' }}>
            <th style={{ padding: '0.6rem' }}>ห้อง</th>
            <th style={{ padding: '0.6rem' }}>ผู้เช่า</th>
            <th style={{ padding: '0.6rem', textAlign: 'center' }}>มิเตอร์น้ำ (เก่า → ใหม่)</th>
            <th style={{ padding: '0.6rem', textAlign: 'right' }}>ค่าน้ำ</th>
            <th style={{ padding: '0.6rem', textAlign: 'center' }}>มิเตอร์ไฟ (เก่า → ใหม่)</th>
            <th style={{ padding: '0.6rem', textAlign: 'right' }}>ค่าไฟ</th>
          </tr>
        </thead>
        <tbody>
          {occupiedRooms.map((rm, idx) => {
            const activeLease = leases.find(
              l => l.roomNumber === rm.roomNumber && l.status === 'ACTIVE'
            );
            const draft = meterDrafts[rm.roomNumber] || {
              currWater: rm.lastWaterMeter,
              waterRollover: false,
              currElectric: rm.lastElectricMeter,
              electricRollover: false
            };

            let wUnits = 0;
            let eUnits = 0;
            try {
              wUnits = calculateMeterUnits(
                rm.lastWaterMeter,
                Number(draft.currWater),
                Boolean(draft.waterRollover)
              );
            } catch {
              wUnits = -1;
            }
            try {
              eUnits = calculateMeterUnits(
                rm.lastElectricMeter,
                Number(draft.currElectric),
                Boolean(draft.electricRollover)
              );
            } catch {
              eUnits = -1;
            }

            const wSatang = Math.max(0, wUnits) * settings.waterRateSatang;
            const eSatang = Math.max(0, eUnits) * settings.electricityRateSatang;

            return (
              <tr key={rm.roomNumber} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '0.55rem', fontWeight: 800 }}>{rm.roomNumber}</td>
                <td style={{ padding: '0.55rem' }}>
                  {activeLease?.tenantName} ({activeLease?.packageTier})
                </td>
                <td style={{ padding: '0.55rem', textAlign: 'center' }}>
                  <span>{rm.lastWaterMeter} → </span>
                  <input
                    id={`meter-grid-water-${idx}`}
                    type="number"
                    value={draft.currWater}
                    onKeyDown={e => handleKeyDown(e, idx, 'water')}
                    onChange={e =>
                      onChangeDraft(rm.roomNumber, { currWater: Number(e.target.value) })
                    }
                    style={{ width: '74px', padding: '0.25rem', fontWeight: 700 }}
                  />
                </td>
                <td style={{ padding: '0.55rem', textAlign: 'right' }}>
                  ฿{formatBaht(wSatang)} ({wUnits} หน่วย)
                </td>
                <td style={{ padding: '0.55rem', textAlign: 'center' }}>
                  <span>{rm.lastElectricMeter} → </span>
                  <input
                    id={`meter-grid-elec-${idx}`}
                    type="number"
                    value={draft.currElectric}
                    onKeyDown={e => handleKeyDown(e, idx, 'elec')}
                    onChange={e =>
                      onChangeDraft(rm.roomNumber, { currElectric: Number(e.target.value) })
                    }
                    style={{ width: '78px', padding: '0.25rem', fontWeight: 700 }}
                  />
                  <label style={{ marginLeft: '0.35rem', fontSize: '0.72rem' }}>
                    <input
                      type="checkbox"
                      checked={draft.electricRollover}
                      onChange={e =>
                        onChangeDraft(rm.roomNumber, { electricRollover: e.target.checked })
                      }
                    />{' '}
                    วนรอบ
                  </label>
                </td>
                <td style={{ padding: '0.55rem', textAlign: 'right' }}>
                  ฿{formatBaht(eSatang)} ({eUnits} หน่วย)
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
