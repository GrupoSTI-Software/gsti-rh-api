import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import limiter from '@adonisjs/limiter/services/main'
import AccessPoint from '#models/access_point'
import AdmsQuarantinedDevice from '#models/adms_quarantined_device'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'
import { AdmsError } from '#exceptions/adms_error'
import { TenantContext } from '#utils/tenant_context'
import { isValidDeviceSerial } from '#modules/adms/adms.constants'
import {
  CLAIM_FAILURES_PER_BUSINESS_UNIT,
  CLAIM_FAILURES_PER_ROW,
  CLAIM_FAILURE_WINDOW_MINUTES,
  maskIp,
  maskSerial,
} from './quarantine_claim.constants.js'

export interface QuarantineListRow {
  quarantinedDeviceId: number
  /** Solo los ultimos cuatro caracteres. */
  serialMasked: string
  status: string
  hitCount: number
  ipMasked: string
  platform: string | null
  firstSeenAt: string
  lastSeenAt: string
  locked: boolean
}

export interface ClaimInput {
  serialNumber: string
  businessUnitId: number
  accessPointName: string
  businessUnitIds: number[]
  userId: number | null
  now?: DateTime
}

/**
 * Reclamo de un checador que aparecio solo (spec ADMS 9.3).
 *
 * El canal nunca da de alta un aparato: un equipo con serie desconocida entra a
 * cuarentena y ahi se queda. Reclamarlo es decir "ese es mio", y eso hay que
 * probarlo tecleando la serie COMPLETA, que solo tiene quien lo ve de frente.
 *
 * Todos los fracasos responden igual: 404 sin distinguir si la serie no existe,
 * si ya es de otra empresa o si la fila esta bloqueada. Distinguirlos
 * convertiria el endpoint en un buscador de series ajenas.
 */
export default class QuarantineClaimService {
  /** Lista enmascarada de lo que esta esperando dueño. */
  async list(): Promise<QuarantineListRow[]> {
    /**
     * La cuarentena no tiene empresa -- justamente porque nadie la ha
     * reclamado -- asi que se lee sin corte. Lo que sale va enmascarado y el
     * permiso `claim-device` es estricto.
     */
    const rows = await TenantContext.runUnscoped(
      () =>
        AdmsQuarantinedDevice.query()
          .whereIn('adms_quarantined_device_status', ['pending', 'locked'])
          .orderBy('adms_quarantined_device_last_seen_at', 'desc')
          .limit(200),
      'cuarentena: las filas aun no pertenecen a ninguna empresa'
    )

    return rows.map((row) => ({
      quarantinedDeviceId: row.admsQuarantinedDeviceId,
      serialMasked: maskSerial(row.admsQuarantinedDeviceSerial),
      status: row.admsQuarantinedDeviceStatus,
      hitCount: row.admsQuarantinedDeviceHitCount,
      ipMasked: maskIp(row.admsQuarantinedDeviceLastIp),
      platform: row.admsQuarantinedDeviceHints?.platform ?? null,
      firstSeenAt: row.admsQuarantinedDeviceFirstSeenAt.toISO() ?? '',
      lastSeenAt: row.admsQuarantinedDeviceLastSeenAt.toISO() ?? '',
      locked: row.admsQuarantinedDeviceStatus === 'locked',
    }))
  }

  async claim(input: ClaimInput): Promise<AccessPoint> {
    const now = input.now ?? DateTime.utc()

    /** La empresa que se reclama tiene que estar en el alcance de quien pide. */
    if (!input.businessUnitIds.includes(input.businessUnitId)) {
      throw notFound()
    }
    if (!isValidDeviceSerial(input.serialNumber)) {
      await this.countFailure(input.businessUnitId, null)
      throw notFound()
    }

    const row = await TenantContext.runUnscoped(
      () =>
        AdmsQuarantinedDevice.query()
          .where('adms_quarantined_device_serial', input.serialNumber)
          .first(),
      'cuarentena: la fila aun no pertenece a ninguna empresa'
    )

    if (!row || row.admsQuarantinedDeviceStatus !== 'pending') {
      await this.countFailure(input.businessUnitId, row?.admsQuarantinedDeviceId ?? null)
      if (row) await this.recordRowFailure(row)
      throw notFound()
    }

    /**
     * Una serie viva de otra empresa NO se puede reclamar, y la respuesta no
     * dice de quien es: eso le contaria a una empresa que otra existe y que
     * tiene ese aparato.
     */
    const existing = await TenantContext.runUnscoped(
      () =>
        AccessPoint.query()
          .withTrashed()
          .where('access_point_serial_number', input.serialNumber)
          .first(),
      'cuarentena: se busca la serie en todas las empresas antes de crear'
    )

    if (existing && existing.deletedAt === null) {
      if (existing.businessUnitId !== input.businessUnitId) {
        await this.countFailure(input.businessUnitId, row.admsQuarantinedDeviceId)
        await this.recordRowFailure(row)
        throw new AdmsError(
          'Esa serie ya esta registrada',
          ADMS_ERROR_CODES.QUAR_SERIAL_TAKEN,
          409,
          'serie-ya-registrada',
          'Esa serie ya esta dada de alta. Si crees que es un error, avisa a soporte.'
        )
      }
      await this.markClaimed(row, existing, input.userId, now)
      return existing
    }

    return db.transaction(async (trx) => {
      /**
       * Una fila dada de baja de la MISMA empresa se reactiva en vez de crear
       * otra: la serie es UNICA en la tabla y un alta nueva chocaria contra la
       * fila borrada.
       */
      const accessPoint = existing ?? new AccessPoint()
      accessPoint.useTransaction(trx)
      accessPoint.accessPointName = input.accessPointName
      accessPoint.businessUnitId = input.businessUnitId
      accessPoint.accessPointSerialNumber = input.serialNumber
      accessPoint.accessPointActive = 1
      accessPoint.accessPointStatus = 0
      accessPoint.deletedAt = null
      await accessPoint.save()

      await this.markClaimed(row, accessPoint, input.userId, now, trx)
      return accessPoint
    })
  }

  private async markClaimed(
    row: AdmsQuarantinedDevice,
    accessPoint: AccessPoint,
    userId: number | null,
    now: DateTime,
    trx?: Parameters<AdmsQuarantinedDevice['useTransaction']>[0]
  ): Promise<void> {
    if (trx) row.useTransaction(trx)
    row.admsQuarantinedDeviceStatus = 'claimed'
    row.claimedBusinessUnitId = accessPoint.businessUnitId
    row.claimedAccessPointId = accessPoint.accessPointId
    row.admsQuarantinedDeviceResolvedByUserId = userId
    row.admsQuarantinedDeviceResolvedAt = now
    await row.save()
  }

  /**
   * Cuenta el intento fallido contra la empresa. Al quinto en quince minutos,
   * el limitador corta: probar series deja de ser gratis.
   */
  private async countFailure(businessUnitId: number, quarantineId: number | null): Promise<void> {
    await limiter
      .use({
        requests: CLAIM_FAILURES_PER_BUSINESS_UNIT,
        duration: `${CLAIM_FAILURE_WINDOW_MINUTES} minutes`,
      })
      .increment(`adms-claim-bu:${businessUnitId}`)
    if (quarantineId !== null) {
      await limiter
        .use({
          requests: CLAIM_FAILURES_PER_BUSINESS_UNIT,
          duration: `${CLAIM_FAILURE_WINDOW_MINUTES} minutes`,
        })
        .increment(`adms-claim-row:${quarantineId}`)
    }
  }

  /**
   * Y ademas se acumula en la fila. El limite por empresa frena la velocidad;
   * este frena la insistencia: sin el, quien tenga tiempo prueba cinco series
   * cada cuarto de hora hasta acertar.
   */
  private async recordRowFailure(row: AdmsQuarantinedDevice): Promise<void> {
    row.admsQuarantinedDeviceFailedClaims += 1
    if (row.admsQuarantinedDeviceFailedClaims >= CLAIM_FAILURES_PER_ROW) {
      row.admsQuarantinedDeviceStatus = 'locked'
    }
    await row.save()
  }
}

/** Todos los fracasos se ven igual desde fuera. */
function notFound(): AdmsError {
  return new AdmsError(
    'No se encontro un equipo en espera con esa serie',
    ADMS_ERROR_CODES.QUAR_SERIAL_MISMATCH,
    404,
    'cuarentena-no-encontrada',
    'Revisa la serie impresa en el equipo y vuelve a intentarlo.'
  )
}
