import type { DateTime } from 'luxon'

/** ISO 8601 en UTC con milisegundos, el formato de toda fecha del módulo. */
export function toIsoUtc(value: DateTime | null): string | null {
  return value ? value.toUTC().toISO() : null
}
