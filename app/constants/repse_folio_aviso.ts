import { DateTime } from 'luxon'
import {
  getBusinessTimeZone,
  todayInBusinessZone,
  toBusinessDateString,
} from '#utils/business_date'

/**
 * Catálogo cerrado de tipos de aviso de vigencia del folio REPSE.
 */
export const REPSE_FOLIO_AVISO_TIPO = {
  /** Renovación trienal del registro (aviso 90 días antes de expiresAt). */
  RENOVACION: 'renovacion',
  /** Informativa cuatrimestral ICSOE/SISUB (aviso 15 días antes del 17 ene/may/sep). */
  INFORMATIVA: 'informativa',
} as const

export type RepseFolioAvisoTipoValue =
  (typeof REPSE_FOLIO_AVISO_TIPO)[keyof typeof REPSE_FOLIO_AVISO_TIPO]

export const REPSE_FOLIO_AVISO_TIPO_VALUES = [
  REPSE_FOLIO_AVISO_TIPO.RENOVACION,
  REPSE_FOLIO_AVISO_TIPO.INFORMATIVA,
] as const

/** Slug del comando ace agendado. Referencia canónica para scheduler y endpoint manual. */
export const REPSE_NOTIFY_FOLIO_EXPIRING_COMMAND = 'repse:notify-folio-expiring'

/** Motivo auditado para TenantContext.runUnscoped en la corrida batch. */
export const REPSE_FOLIO_RUN_UNSCOPED_REASON =
  'Aviso de vigencia del folio REPSE por system setting activo (cross-empresa)'

/** Días de anticipación para aviso de renovación trienal. */
export const RENEWAL_THRESHOLD_DAYS = 90

/** Días de anticipación para aviso de informativa cuatrimestral. */
export const INFORMATIVA_THRESHOLD_DAYS = 15

/** Fechas de presentación de informativas (17 ene/may/sep) y clave de cuatrimestre. */
export const INFORMATIVA_PRESENTATION_DATES = [
  { month: 1, day: 17, cuatrimestre: 'C1' as const },
  { month: 5, day: 17, cuatrimestre: 'C2' as const },
  { month: 9, day: 17, cuatrimestre: 'C3' as const },
] as const

export type InformativaCuatrimestre = (typeof INFORMATIVA_PRESENTATION_DATES)[number]['cuatrimestre']

/** Construye la clave de periodo para aviso de renovación (ej. `2026-RENOV`). */
export function buildRenovacionPeriodoClave(expiresAtYear: number): string {
  return `${expiresAtYear}-RENOV`
}

/** Construye la clave de periodo para aviso de informativa (ej. `2026-C1`). */
export function buildInformativaPeriodoClave(
  year: number,
  cuatrimestre: InformativaCuatrimestre
): string {
  return `${year}-${cuatrimestre}`
}

/**
 * Si hoy cae en la ventana de aviso de alguna informativa
 * `[presentacion - 15, presentacion)`, devuelve la fecha de presentación
 * y la clave de periodo correspondiente.
 */
export function getActiveInformativaWindow(today: DateTime): {
  presentationDate: DateTime
  periodoClave: string
  cuatrimestre: InformativaCuatrimestre
} | null {
  const todayStart = today.startOf('day')

  for (const { month, day, cuatrimestre } of INFORMATIVA_PRESENTATION_DATES) {
    const presentation = todayStart.set({ month, day })
    const windowStart = presentation.minus({ days: INFORMATIVA_THRESHOLD_DAYS })

    if (todayStart >= windowStart && todayStart < presentation) {
      return {
        presentationDate: presentation,
        periodoClave: buildInformativaPeriodoClave(presentation.year, cuatrimestre),
        cuatrimestre,
      }
    }
  }

  return null
}

/**
 * Próxima fecha de presentación de informativa (17 ene/may/sep) en zona de negocio.
 */
export function getNextInformativaPresentationDate(
  today: DateTime = todayInBusinessZone()
): DateTime {
  const zone = getBusinessTimeZone()
  const todayStart = today.setZone(zone).startOf('day')
  const year = todayStart.year

  const candidates = INFORMATIVA_PRESENTATION_DATES.map(({ month, day }) =>
    todayStart.set({ month, day })
  ).filter((candidate) => candidate >= todayStart)

  if (candidates.length > 0) {
    return candidates[0]
  }

  return todayStart.set({ year: year + 1, month: 1, day: 17 })
}

/** Snapshot de la próxima informativa cuatrimestral para UI y matriz de vencimientos. */
export function buildInformativaExpirationSnapshot(today: DateTime = todayInBusinessZone()): {
  presentationDate: string
  daysRemaining: number
} {
  const zone = getBusinessTimeZone()
  const ref = today.setZone(zone).startOf('day')
  const presentation = getNextInformativaPresentationDate(ref)
  const presentationDate = toBusinessDateString(presentation)
  const daysRemaining = Math.round(presentation.startOf('day').diff(ref, 'days').days)

  return { presentationDate, daysRemaining }
}
