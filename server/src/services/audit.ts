import { runInsert, getAll } from '../db/connection';

export type AuditAction =
  | 'process_created'
  | 'process_sent'
  | 'process_completed'
  | 'process_expired'
  | 'signer_notified'
  | 'signer_viewed'
  | 'signer_signed'
  | 'signer_rejected'
  | 'document_generated'
  | 'document_downloaded';

interface AuditLogEntry {
  signingProcessId: number;
  signerId?: number;
  userId?: number;
  action: AuditAction;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
}

export function logAudit(entry: AuditLogEntry) {
  runInsert(
    `INSERT INTO audit_logs (signing_process_id, signer_id, user_id, action, details, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.signingProcessId,
      entry.signerId || null,
      entry.userId || null,
      entry.action,
      entry.details || null,
      entry.ipAddress || null,
      entry.userAgent || null,
    ]
  );
}

export function getAuditLogs(signingProcessId: number) {
  return getAll(
    `SELECT al.*, s.name as signer_name, s.email as signer_email
     FROM audit_logs al
     LEFT JOIN signers s ON al.signer_id = s.id
     WHERE al.signing_process_id = ?
     ORDER BY al.created_at ASC`,
    [signingProcessId]
  );
}
