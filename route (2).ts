// =============================================================================
// Taky Apartment ERP — Milestone 1: Secure Slip & Document Upload API (Audit Gate 4)
// Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
// Route: POST /api/upload-slip
// Enforces MIME whitelist, <= 5 MB file size limit, and UUID filename sanitization
// =============================================================================

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const ALLOWED_SLIP_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf'
]);

export const MAX_SLIP_FILE_BYTES = 5 * 1024 * 1024; // 5 MB hard limit

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf'
};

export function validateAndSanitizeSlipUpload(params: {
  mimeType: string;
  sizeBytes: number;
  originalName?: string;
}): { safeFileName: string; relativeUrl: string } {
  const { mimeType, sizeBytes } = params;

  if (!ALLOWED_SLIP_MIME_TYPES.has(mimeType)) {
    throw new Error(
      `Unsupported file type: ${mimeType}. Allowed: JPG, PNG, WEBP, PDF.`
    );
  }

  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new Error('Uploaded file cannot be empty');
  }

  if (sizeBytes > MAX_SLIP_FILE_BYTES) {
    throw new Error(
      `File size (${sizeBytes} bytes) exceeds 5 MB maximum limit (${MAX_SLIP_FILE_BYTES} bytes)`
    );
  }

  const ext = MIME_TO_EXT[mimeType] || '.bin';
  const uuid = crypto.randomUUID();
  const safeFileName = `slip_${uuid}${ext}`;
  const relativeUrl = `/uploads/slips/${safeFileName}`;

  return { safeFileName, relativeUrl };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json(
        { ok: false, error: 'กรุณาแนบไฟล์รูปสลิปโอนเงินหรือ PDF' },
        { status: 400 }
      );
    }

    const { safeFileName, relativeUrl } = validateAndSanitizeSlipUpload({
      mimeType: file.type,
      sizeBytes: file.size,
      originalName: file.name
    });

    const uploadDir = path.join(process.cwd(), 'uploads', 'slips');
    await fs.mkdir(uploadDir, { recursive: true });

    const arrayBuffer = await file.arrayBuffer();
    const targetPath = path.join(uploadDir, safeFileName);
    await fs.writeFile(targetPath, Buffer.from(arrayBuffer));

    return NextResponse.json({
      ok: true,
      fileName: safeFileName,
      slipImageUrl: relativeUrl,
      sizeBytes: file.size,
      mimeType: file.type
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Upload failed' },
      { status: 400 }
    );
  }
}
