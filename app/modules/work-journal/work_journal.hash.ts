import { createHmac, timingSafeEqual } from 'node:crypto'
import env from '#start/env'
import type { WorkJournalSnapshot } from '#models/work_journal_entry'
import { WorkJournalEntryError } from '#exceptions/work_journal_entry_error'
import { WJE_ERROR_CODES } from '#constants/work_journal_entry_error_codes'

/**
 * Versión de llave HMAC vigente. Se persiste junto al sello para permitir
 * rotación futura sin invalidar los sellos ya emitidos (regla de negocio #11):
 * al verificar se elige el secreto correspondiente a esta versión.
 */
export const CURRENT_HMAC_KEY_VERSION = 1

/**
 * Serializa el snapshot de forma determinista (claves ordenadas) para que el
 * HMAC sea reproducible byte a byte. No usa el orden de inserción del objeto.
 */
export function canonicalizeSnapshot(snapshot: WorkJournalSnapshot): string {
  const ordered: Record<string, unknown> = {}
  for (const key of Object.keys(snapshot).sort()) {
    ordered[key] = (snapshot as Record<string, unknown>)[key]
  }
  return JSON.stringify(ordered)
}

/**
 * Resuelve el secreto del servidor para una versión de llave dada. Lanza
 * WJE.SYS.002 si no está configurado (no se puede sellar ni verificar).
 */
function resolveSecret(keyVersion: number): string {
  const secret = env.get('WORK_JOURNAL_HMAC_SECRET')
  if (!secret || keyVersion !== CURRENT_HMAC_KEY_VERSION) {
    throw new WorkJournalEntryError(
      'No hay secreto HMAC configurado para sellar la jornada.',
      WJE_ERROR_CODES.SEAL_SECRET_MISSING,
      500,
      'sello-sin-secreto',
      'Falta configurar WORK_JOURNAL_HMAC_SECRET en el servidor.'
    )
  }
  return secret
}

/** Calcula el sello HMAC-SHA-256 (hex) del snapshot con la llave del servidor. */
export function computeSeal(
  snapshot: WorkJournalSnapshot,
  keyVersion: number = CURRENT_HMAC_KEY_VERSION
): string {
  const secret = resolveSecret(keyVersion)
  return createHmac('sha256', secret).update(canonicalizeSnapshot(snapshot)).digest('hex')
}

/**
 * Compara dos sellos en tiempo constante para no filtrar información por el
 * tiempo de comparación. Devuelve false si los tamaños difieren.
 */
export function sealsMatch(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(actual, 'hex')
  if (a.length !== b.length || a.length === 0) {
    return false
  }
  return timingSafeEqual(a, b)
}
