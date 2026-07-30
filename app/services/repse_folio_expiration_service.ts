import { DateTime } from 'luxon'
import RepseRegistration from '#models/repse_registration'
import { RENEWAL_THRESHOLD_DAYS, buildInformativaExpirationSnapshot } from '#constants/repse_folio_aviso'
import { getAllowedBusinessUnitIds } from '#helpers/repse_tenant_scope'
import {
  getBusinessTimeZone,
  todayInBusinessZone,
  toBusinessDateString,
  toCalendarIsoDate,
} from '#utils/business_date'

/** Próxima informativa cuatrimestral (17 ene/may/sep), calculada en servidor. */
export type RepseFolioInformativaExpiration = {
  presentationDate: string
  daysRemaining: number
}

/** Fila del listado de vencimientos del folio REPSE para la Matriz de Vencimientos. */
export type RepseFolioExpirationRow = {
  repseRegistrationId: number
  businessUnitId: number
  businessUnitName: string | null
  folio: string
  expiresAt: string
  status: string
  daysToExpire: number
  informativa: RepseFolioInformativaExpiration
}

/**
 * Lectura de folios REPSE vencidos o por vencer (umbral de renovación 90 días)
 * para la card REPSE de la Matriz de Vencimientos.
 */
export default class RepseFolioExpirationService {
  /**
   * Registros activos del tenant con `expiresAt` vencido o dentro de los próximos
   * 90 días (zona de negocio). Ordenados por urgencia (`daysToExpire` ascendente).
   */
  async getExpiredAndExpiring(): Promise<RepseFolioExpirationRow[]> {
    const allowed = await getAllowedBusinessUnitIds()
    if (allowed.length === 0) {
      return []
    }

    const today = todayInBusinessZone()
    const horizonIso = toBusinessDateString(today.plus({ days: RENEWAL_THRESHOLD_DAYS }))
    const zone = getBusinessTimeZone()
    const informativa = buildInformativaExpirationSnapshot(today)

    const registrations = await RepseRegistration.query()
      .whereNull('repse_registration_deleted_at')
      .where('repse_registration_status', 'active')
      .whereIn('business_unit_id', allowed)
      .where('repse_registration_expires_at', '<=', horizonIso)
      .preload('businessUnit')
      .orderBy('repse_registration_expires_at', 'asc')
      .orderBy('repse_registration_folio', 'asc')

    const rows = registrations.map((registration): RepseFolioExpirationRow => {
      const expiresIso = toCalendarIsoDate(registration.expiresAt)!
      const expiresDt = DateTime.fromISO(expiresIso, { zone }).startOf('day')
      const daysToExpire = Math.round(expiresDt.diff(today, 'days').days)

      return {
        repseRegistrationId: registration.repseRegistrationId,
        businessUnitId: registration.businessUnitId,
        businessUnitName: registration.businessUnit?.businessUnitName ?? null,
        folio: registration.folio.trim(),
        expiresAt: expiresIso,
        status: registration.status,
        daysToExpire,
        informativa,
      }
    })

    rows.sort((a, b) => {
      if (a.daysToExpire !== b.daysToExpire) {
        return a.daysToExpire - b.daysToExpire
      }
      return a.folio.localeCompare(b.folio)
    })

    return rows
  }
}
