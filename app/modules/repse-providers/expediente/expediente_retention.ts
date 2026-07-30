import { DateTime } from 'luxon'
import {
  EXPEDIENTE_RETENTION_YEARS,
  type RepseExpedienteAccion,
} from './expediente.constants.js'
import {
  parseBusinessCalendarDate,
  todayInBusinessZone,
  toBusinessCalendarDate,
} from '../repse_provider_dates.js'

/** Calcula la fecha límite de conservación normativa (5 años desde la fecha base). */
export function computeConservarHasta(
  fechaDocumento: DateTime | null,
  referenceDate: DateTime = todayInBusinessZone()
): DateTime {
  const base = fechaDocumento ? toBusinessCalendarDate(fechaDocumento) : referenceDate
  return base.plus({ years: EXPEDIENTE_RETENTION_YEARS })
}

/** Indica si el documento aún está dentro del periodo de retención obligatoria. */
export function isRetentionActive(
  conservarHasta: DateTime,
  hoy: DateTime = todayInBusinessZone()
): boolean {
  return toBusinessCalendarDate(conservarHasta) > hoy
}

export function parseOptionalFechaDocumento(value: unknown): DateTime | null {
  if (value === null || value === undefined || value === '') {
    return null
  }
  if (value instanceof Date) {
    return parseBusinessCalendarDate(value.toISOString().substring(0, 10))
  }
  const parsed = parseBusinessCalendarDate(String(value))
  return parsed.isValid ? parsed : null
}

export type { RepseExpedienteAccion }
