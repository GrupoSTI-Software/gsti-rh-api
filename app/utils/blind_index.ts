import { createHmac } from 'node:crypto'
import env from '#start/env'

/**
 * Calcula la huella determinista e irreversible de un identificador personal
 * para su uso como índice ciego (blind-index).
 *
 * Propiedades:
 *   - Determinista: el mismo valor produce siempre el mismo hash.
 *   - Irreversible: HMAC-SHA256 con secreto externo (`BLIND_INDEX_KEY`).
 *     Sin ese secreto no es viable reconstruir el valor original.
 *   - Normalizado: `trim().toUpperCase()` — idéntico a `normalizeRfc()`
 *     (`app/shared/validators/rfc.validator.ts:52-54`) para que la huella
 *     del RFC de empresa case con lo que los servicios ya reciben normalizado.
 *
 * Uso:
 *   - Guardar junto al dato cifrado para validar unicidad sin descifrar.
 *   - Comparar en alta/actualización: `where('<col>_hash', blindIndex(value))`.
 *   - NUNCA exponer en respuestas de API (`serializeAs: null` en el modelo).
 *
 * Fundamento: LFPDPPP / GSTI — el hash con secreto evita que un volcado de BD
 * permita enumerar los identificadores por fuerza bruta.
 *
 * @param value — Valor en claro (no cifrado). Se normaliza internamente.
 * @returns Hex de 64 caracteres (SHA-256).
 */
export function blindIndex(value: string): string {
  const normalized = value.trim().toUpperCase()
  return createHmac('sha256', env.get('BLIND_INDEX_KEY')).update(normalized).digest('hex')
}
