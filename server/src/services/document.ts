import path from 'path';
import fs from 'fs';
import { getOne, getAll, runQuery } from '../db/connection';

const SIGNED_DIR = path.join(__dirname, '../../signed');
if (!fs.existsSync(SIGNED_DIR)) fs.mkdirSync(SIGNED_DIR, { recursive: true });

export async function generateFinalDocument(processId: number): Promise<string | null> {
  try {
    const process = getOne('SELECT * FROM signing_processes WHERE id = ?', [processId]);
    if (!process) return null;

    const doc = getOne('SELECT * FROM documents WHERE id = ?', [process.document_id]);
    if (!doc) return null;

    const signers = getAll('SELECT * FROM signers WHERE signing_process_id = ? ORDER BY sign_order', [processId]);
    const fields = getAll('SELECT * FROM fields WHERE signing_process_id = ? AND value IS NOT NULL', [processId]);

    const sourcePath = path.join(__dirname, '../../uploads', doc.filepath);
    if (!fs.existsSync(sourcePath)) return null;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `signed_${processId}_${timestamp}.pdf`;
    const destPath = path.join(SIGNED_DIR, filename);

    fs.copyFileSync(sourcePath, destPath);

    const metadata = {
      processId,
      title: process.title,
      completedAt: new Date().toISOString(),
      signers: signers.map((s: any) => ({
        name: s.name,
        email: s.email,
        signedAt: s.signed_at,
        status: s.status,
      })),
      fields: fields.map((f: any) => ({
        id: f.id,
        type: f.type,
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        hasValue: !!f.value,
        signerId: f.signer_id,
      })),
    };

    const metaPath = path.join(SIGNED_DIR, `signed_${processId}_${timestamp}.json`);
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

    const signatureStamp = generateSignatureStamp(signers, process);
    const stampPath = path.join(SIGNED_DIR, `stamp_${processId}_${timestamp}.txt`);
    fs.writeFileSync(stampPath, signatureStamp);

    return `signed/${filename}`;
  } catch (err) {
    console.error('[Document] Failed to generate final document:', err);
    return null;
  }
}

function generateSignatureStamp(signers: any[], process: any): string {
  const lines = [
    '═══════════════════════════════════════════════════',
    '              SignGo 电子签署证明',
    '═══════════════════════════════════════════════════',
    `文档标题: ${process.title}`,
    `签署流程ID: ${process.id}`,
    `完成时间: ${new Date().toISOString()}`,
    '───────────────────────────────────────────────────',
    '签署方信息:',
  ];

  for (const signer of signers) {
    lines.push(`  ${signer.sign_order}. ${signer.name} <${signer.email}>`);
    lines.push(`     状态: ${signer.status === 'signed' ? '已签署' : signer.status}`);
    if (signer.signed_at) {
      lines.push(`     签署时间: ${signer.signed_at}`);
    }
  }

  lines.push('═══════════════════════════════════════════════════');
  return lines.join('\n');
}
