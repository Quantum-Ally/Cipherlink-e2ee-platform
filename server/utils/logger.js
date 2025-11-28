import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logsDir = path.join(__dirname, '../logs');

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function getLogFileName(eventType) {
  const date = new Date().toISOString().split('T')[0];
  return path.join(logsDir, `${eventType}-${date}.log`);
}

function formatLogEntry(eventType, details) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    eventType,
    ...details,
  }) + '\n';
}

export function logSecurityEvent(eventType, details) {
  try {
    const logFile = getLogFileName(eventType);
    const entry = formatLogEntry(eventType, details);
    fs.appendFileSync(logFile, entry, 'utf8');
  } catch (error) {
    console.error('Failed to write log:', error);
  }
}

export function logAuthAttempt(username, success, ip) {
  logSecurityEvent('auth_attempt', {
    username,
    success,
    ip: ip || 'unknown',
  });
}

export function logKeyExchange(userId, recipientId, success) {
  logSecurityEvent('key_exchange', {
    userId,
    recipientId,
    success,
  });
}

export function logFailedDecryption(userId, messageId, error) {
  logSecurityEvent('failed_decryption', {
    userId,
    messageId,
    error: error.message || error,
  });
}

export function logReplayAttack(userId, nonce, details) {
  logSecurityEvent('replay_attack', {
    userId,
    nonce,
    ...details,
  });
}

export function logInvalidSignature(userId, details) {
  logSecurityEvent('invalid_signature', {
    userId,
    ...details,
  });
}

export function logMetadataAccess(userId, resourceType, resourceId) {
  logSecurityEvent('metadata_access', {
    userId,
    resourceType,
    resourceId,
  });
}

