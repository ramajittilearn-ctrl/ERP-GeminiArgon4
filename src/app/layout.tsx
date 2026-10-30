// =============================================================================
// Taky Apartment ERP — Root Layout (Single-Admin Thai Interface)
// Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
// =============================================================================

import React from 'react';

export const metadata = {
  title: 'Taky Apartment ERP — ระบบบริหารหอพัก 15 ห้อง (Local LAN)',
  description:
    'ระบบบริหารหอพัก Taky Apartment 15 ห้อง 3 ชั้น คำนวณหน่วยสตางค์ ตัดรอบวันที่ 25 พร้อม QR PromptPay และพิมพ์สลิป A4'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        style={{
          fontFamily: "'Noto Sans Thai', 'Inter', sans-serif",
          backgroundColor: '#f8fafc',
          color: '#0f172a',
          margin: 0
        }}
      >
        {children}
      </body>
    </html>
  );
}
