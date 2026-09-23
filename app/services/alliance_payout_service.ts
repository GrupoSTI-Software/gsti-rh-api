import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import Alliance from '#models/alliance'
import AllianceCommission from '#models/alliance_commission'
import AlliancePayout from '#models/alliance_payout'
import User from '#models/user'
import { ALLIANCE_ERRORS } from '#constants/alliance_error_codes'
import { AllianceServiceError } from '#exceptions/alliance_service_error'
import { assertPositiveAllianceId } from '#services/alliance_service'
import { toBusinessDateString } from '#utils/business_date'
import type {
  AlliancePayoutView,
  CreateAlliancePayoutInput,
} from '../interfaces/alliance_payout_interface.js'

function throwFromCatalog(
  catalog: (typeof ALLIANCE_ERRORS)[keyof typeof ALLIANCE_ERRORS]
): never {
  throw new AllianceServiceError(
    catalog.detail,
    catalog.code,
    catalog.status,
    catalog.key,
    catalog.detail
  )
}

/** Código de error MySQL para violación de índice UNIQUE (defensa en profundidad). */
const ER_DUP_ENTRY = 'ER_DUP_ENTRY'
/** Nombre del UNIQUE que garantiza que una comisión nunca esté en dos liquidaciones vivas. */
const PIVOT_LIVE_UNIQUE = 'alliance_payout_commissions_commission_live_unique'

/** Máximo de un `int unsigned` de MySQL: tope defensivo del monto congelado. */
const MAX_UNSIGNED_INT = 4_294_967_295

/**
 * Registro de liquidaciones de alianza (USRH1787719056820).
 *
 * `createPayout` es todo o nada (regla 6): si una sola comisión del
 * conjunto no puede liquidarse, no se registra nada. La garantía de que
 * ninguna comisión quede pagada dos veces (regla 8) la da, en última
 * instancia, el UNIQUE `alliance_payout_commissions_commission_live_unique`
 * de la base de datos — la validación previa en esta clase es una
 * defensa en profundidad, no la fuente de la garantía.
 */
export default class AlliancePayoutService {
  /**
   * Registra que GSTI le pagó a la alianza el conjunto de comisiones
   * indicado. Orden de evaluación fijado por el spec (no reordenar):
   * forma → fecha de calendario → fecha futura → alianza → comisiones
   * existentes y propias → fecha vs. comisión más reciente → ya pagada →
   * monto → inserción.
   *
   * @throws {AllianceServiceError}
   * `VAL_INPUT` fecha imposible o monto fuera de rango;
   * `PAYOUT_DATE_IN_FUTURE` fecha posterior a hoy de negocio;
   * `NOT_FOUND` alianza inexistente o retirada;
   * `COMMISSION_NOT_FOUND` alguna comisión no existe o es de otra alianza;
   * `PAYOUT_DATE_BEFORE_ACCRUAL` fecha anterior a la comisión más reciente;
   * `COMMISSION_ALREADY_PAID` alguna comisión ya está en una liquidación viva.
   */
  async createPayout(
    allianceId: number,
    input: CreateAlliancePayoutInput,
    actorUserId: number
  ): Promise<AlliancePayoutView> {
    assertPositiveAllianceId(allianceId)

    const paidOnDate = DateTime.fromISO(input.paidOn, { zone: 'utc' })
    if (!paidOnDate.isValid || paidOnDate.toISODate() !== input.paidOn) {
      throwFromCatalog(ALLIANCE_ERRORS.VAL_INPUT)
    }

    const today = toBusinessDateString()
    if (input.paidOn > today) {
      throwFromCatalog(ALLIANCE_ERRORS.PAYOUT_DATE_IN_FUTURE)
    }

    const alliance = await Alliance.query()
      .where('alliance_id', allianceId)
      .whereNull('alliance_deleted_at')
      .first()
    if (!alliance) {
      throwFromCatalog(ALLIANCE_ERRORS.NOT_FOUND)
    }

    // Ids ordenados antes de tomar los candados (Notas para IA §15): evita
    // ciclos de deadlock entre dos liquidaciones con conjuntos que se cruzan.
    const commissionIds = [...new Set(input.commissionIds)].sort((a, b) => a - b)

    return db.transaction(async (trx) => {
      const commissions = await AllianceCommission.query({ client: trx })
        .whereIn('alliance_commission_id', commissionIds)
        .where('alliance_id', allianceId)
        .forUpdate()
        .orderBy('alliance_commission_id', 'asc')

      if (commissions.length !== commissionIds.length) {
        throwFromCatalog(ALLIANCE_ERRORS.COMMISSION_NOT_FOUND)
      }

      const mostRecentAccruedOn = commissions.reduce((max, commission) => {
        const accruedOn = commission.allianceCommissionPaidOn.toISODate()!
        return accruedOn > max ? accruedOn : max
      }, '0000-00-00')

      if (input.paidOn < mostRecentAccruedOn) {
        throwFromCatalog(ALLIANCE_ERRORS.PAYOUT_DATE_BEFORE_ACCRUAL)
      }

      // Validación previa SIN `forUpdate`: candados de hueco sobre el
      // pivote permitirían que dos liquidaciones de conjuntos disjuntos
      // se bloqueen entre sí (Notas para IA §15). La garantía real es el
      // UNIQUE, capturado en el `catch` de más abajo.
      const alreadyPaid = await db
        .from('alliance_payout_commissions')
        .useTransaction(trx)
        .whereIn('alliance_commission_id', commissionIds)
        .whereNull('alliance_payout_commission_annulled_at')
        .first()
      if (alreadyPaid) {
        throwFromCatalog(ALLIANCE_ERRORS.COMMISSION_ALREADY_PAID)
      }

      const amountCents = commissions.reduce(
        (sum, commission) => sum + commission.allianceCommissionAmountCents,
        0
      )
      if (amountCents > MAX_UNSIGNED_INT) {
        throwFromCatalog(ALLIANCE_ERRORS.VAL_INPUT)
      }

      let payout: AlliancePayout
      try {
        payout = await AlliancePayout.create(
          {
            allianceId,
            alliancePayoutPaidOn: DateTime.fromISO(input.paidOn, { zone: 'utc' }),
            alliancePayoutReference: input.reference,
            alliancePayoutAmountCents: amountCents,
            alliancePayoutCreatedByUserId: actorUserId,
          },
          { client: trx }
        )

        await trx.table('alliance_payout_commissions').multiInsert(
          commissionIds.map((commissionId) => ({
            alliance_payout_id: payout.alliancePayoutId,
            alliance_commission_id: commissionId,
          }))
        )
      } catch (error) {
        this.rethrowDuplicatePayoutError(error)
      }

      const createdByUser = await User.query({ client: trx })
        .where('user_id', actorUserId)
        .preload('person')
        .firstOrFail()

      return {
        alliancePayoutId: payout.alliancePayoutId,
        allianceId,
        alliancePayoutPaidOn: input.paidOn,
        alliancePayoutReference: input.reference,
        alliancePayoutAmountCents: amountCents,
        alliancePayoutCommissionsCount: commissionIds.length,
        allianceCommissionIds: commissionIds,
        alliancePayoutCreatedByUserId: actorUserId,
        alliancePayoutCreatedByName: `${createdByUser.person.personFirstname} ${createdByUser.person.personLastname}`,
        createdAt: payout.createdAt.toISO()!,
      }
    })
  }

  /** Traduce `ER_DUP_ENTRY` del UNIQUE del pivote al 409 de negocio (regla 8). */
  private rethrowDuplicatePayoutError(error: unknown): never {
    const dbError = error as { code?: string; sqlMessage?: string }
    if (dbError?.code === ER_DUP_ENTRY && dbError.sqlMessage?.includes(PIVOT_LIVE_UNIQUE)) {
      throwFromCatalog(ALLIANCE_ERRORS.COMMISSION_ALREADY_PAID)
    }
    throw error
  }
}
