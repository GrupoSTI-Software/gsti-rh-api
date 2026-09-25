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
import AllianceCommissionService from '#services/alliance_commission_service'
import type {
  AlliancePayoutView,
  AlliancePayoutListItem,
  AlliancePayoutDetailView,
  AnnulAlliancePayoutInput,
  CreateAlliancePayoutInput,
  ListAlliancePayoutsFilters,
  ListAlliancePayoutsResult,
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

/** Id de ruta de liquidación inválido (NaN, 0, negativo) → 404 uniforme. */
function assertPositivePayoutId(payoutId: number): void {
  if (!Number.isFinite(payoutId) || payoutId <= 0) {
    throwFromCatalog(ALLIANCE_ERRORS.PAYOUT_NOT_FOUND)
  }
}

/**
 * Determina si la respuesta del `UPDATE` afectó al menos una fila.
 * Replica localmente el helper privado de `billing_tax_receipt_service.ts`
 * (`:468-482`): el driver puede entregar `number`, arreglo u objeto
 * con `affectedRows`/`rowCount`.
 */
function hasAffectedRows(affected: unknown): boolean {
  if (typeof affected === 'number') return affected > 0
  if (Array.isArray(affected)) {
    const first = affected[0] as { affectedRows?: number } | number | undefined
    if (typeof first === 'number') return first > 0
    return Number(first?.affectedRows ?? 0) > 0
  }
  const header = affected as { affectedRows?: number; rowCount?: number } | null | undefined
  return Number(header?.affectedRows ?? header?.rowCount ?? 0) > 0
}

/** Límite por página del historial de liquidaciones. */
const PAYOUT_LIST_LIMIT = 20

/** Fila cruda del historial antes de mapear al contrato. */
interface RawPayoutRow {
  alliancePayoutId: number
  allianceId: number
  alliancePayoutPaidOn: string
  alliancePayoutReference: string
  alliancePayoutAmountCents: number
  alliancePayoutCreatedByName: string
  alliancePayoutAnnulledAt: string | Date | null
  alliancePayoutAnnulmentReason: string | null
  alliancePayoutAnnulledByName: string | null
  createdAt: string | Date
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
  private readonly commissionService = new AllianceCommissionService()

  // ─────────────────────────────────────────────────────────────────────────
  // Consultas (USRH1787719056821)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Historial paginado de liquidaciones de una alianza (reglas 1 y 2):
   * todas (registradas y anuladas), de la más reciente a la más antigua,
   * con conteo de comisiones y nombres de actor.
   *
   * @throws {AllianceServiceError} `NOT_FOUND` si la alianza no existe o está retirada.
   * @throws {AllianceServiceError} `VAL_INPUT` si `page` o `limit` son inválidos.
   */
  async listPayouts(
    allianceId: number,
    filters: ListAlliancePayoutsFilters
  ): Promise<ListAlliancePayoutsResult> {
    assertPositiveAllianceId(allianceId)

    const alliance = await Alliance.query()
      .where('alliance_id', allianceId)
      .whereNull('alliance_deleted_at')
      .first()
    if (!alliance) {
      throwFromCatalog(ALLIANCE_ERRORS.NOT_FOUND)
    }

    const page = filters.page ?? 1
    const limit = filters.limit ?? PAYOUT_LIST_LIMIT

    const paginated = await db
      .from('alliance_payouts as ap')
      .where('ap.alliance_id', allianceId)
      .join('users as cu', 'cu.user_id', 'ap.alliance_payout_created_by_user_id')
      .join('people as cp', 'cp.person_id', 'cu.person_id')
      .leftJoin('users as au', 'au.user_id', 'ap.alliance_payout_annulled_by_user_id')
      .leftJoin('people as ap2', 'ap2.person_id', 'au.person_id')
      .select(
        'ap.alliance_payout_id as alliancePayoutId',
        'ap.alliance_id as allianceId',
        db.raw("DATE_FORMAT(ap.alliance_payout_paid_on, '%Y-%m-%d') as alliancePayoutPaidOn"),
        'ap.alliance_payout_reference as alliancePayoutReference',
        'ap.alliance_payout_amount_cents as alliancePayoutAmountCents',
        db.raw("CONCAT_WS(' ', cp.person_firstname, cp.person_lastname) as alliancePayoutCreatedByName"),
        'ap.alliance_payout_annulled_at as alliancePayoutAnnulledAt',
        'ap.alliance_payout_annulment_reason as alliancePayoutAnnulmentReason',
        db.raw("CONCAT_WS(' ', ap2.person_firstname, ap2.person_lastname) as alliancePayoutAnnulledByName"),
        'ap.created_at as createdAt'
      )
      .orderBy('ap.alliance_payout_paid_on', 'desc')
      .orderBy('ap.alliance_payout_id', 'desc')
      .paginate(page, limit)

    // Conteo de comisiones (vivas + anuladas) por liquidación de la página
    const pageIds: number[] = (paginated.toJSON().data as { alliancePayoutId: number }[]).map(
      (r) => r.alliancePayoutId
    )
    const commissionsCountMap = new Map<number, number>()
    if (pageIds.length > 0) {
      const counts = await db
        .from('alliance_payout_commissions')
        .whereIn('alliance_payout_id', pageIds)
        .groupBy('alliance_payout_id')
        .select('alliance_payout_id as payoutId')
        .count('* as cnt')
      for (const row of counts as { payoutId: number; cnt: number | string }[]) {
        commissionsCountMap.set(Number(row.payoutId), Number(row.cnt))
      }
    }

    const json = paginated.toJSON()
    return {
      data: (json.data as RawPayoutRow[]).map((row) =>
        this.toListItem(row, commissionsCountMap.get(row.alliancePayoutId) ?? 0)
      ),
      meta: {
        total: json.meta.total,
        page: json.meta.currentPage,
        limit: json.meta.perPage,
        lastPage: json.meta.lastPage,
      },
    }
  }

  /**
   * Detalle de una liquidación con el rastro completo de sus comisiones
   * (regla 3). Las comisiones se ordenan por `alliance_commission_id` asc.
   *
   * @throws {AllianceServiceError} `PAYOUT_NOT_FOUND` si no existe o el id es inválido.
   */
  async getPayoutDetail(alliancePayoutId: number): Promise<AlliancePayoutDetailView> {
    assertPositivePayoutId(alliancePayoutId)

    const rows = await db
      .from('alliance_payouts as ap')
      .where('ap.alliance_payout_id', alliancePayoutId)
      .join('users as cu', 'cu.user_id', 'ap.alliance_payout_created_by_user_id')
      .join('people as cp', 'cp.person_id', 'cu.person_id')
      .leftJoin('users as au', 'au.user_id', 'ap.alliance_payout_annulled_by_user_id')
      .leftJoin('people as ap2', 'ap2.person_id', 'au.person_id')
      .select(
        'ap.alliance_payout_id as alliancePayoutId',
        'ap.alliance_id as allianceId',
        db.raw("DATE_FORMAT(ap.alliance_payout_paid_on, '%Y-%m-%d') as alliancePayoutPaidOn"),
        'ap.alliance_payout_reference as alliancePayoutReference',
        'ap.alliance_payout_amount_cents as alliancePayoutAmountCents',
        db.raw("CONCAT_WS(' ', cp.person_firstname, cp.person_lastname) as alliancePayoutCreatedByName"),
        'ap.alliance_payout_annulled_at as alliancePayoutAnnulledAt',
        'ap.alliance_payout_annulment_reason as alliancePayoutAnnulmentReason',
        db.raw("CONCAT_WS(' ', ap2.person_firstname, ap2.person_lastname) as alliancePayoutAnnulledByName"),
        'ap.created_at as createdAt'
      )
      .first()

    if (!rows) {
      throwFromCatalog(ALLIANCE_ERRORS.PAYOUT_NOT_FOUND)
    }

    const commissionCount = await db
      .from('alliance_payout_commissions')
      .where('alliance_payout_id', alliancePayoutId)
      .count('* as cnt')
      .first()

    const header = this.toListItem(rows as RawPayoutRow, Number((commissionCount as { cnt: number }).cnt ?? 0))

    const commissions = await this.commissionService.listCommissionsOfPayout(alliancePayoutId)

    return { ...header, alliancePayoutCommissions: commissions }
  }

  /**
   * Anula completa una liquidación registrada (reglas 4, 6-11).
   *
   * Orden de operación:
   * 1. `FOR UPDATE` sobre la liquidación → 404 si no existe, 422 si ya anulada.
   * 2. `UPDATE` condicionado con `hasAffectedRows` (molde `billing_tax_receipt_service`).
   * 3. `UPDATE` del pivote en la misma transacción, misma marca de tiempo.
   *
   * Sin candado sobre `alliance_commissions`: la columna generada `is_live`
   * del pivote los libera sola; un candado aquí ciclaría con `createPayout`
   * (R-P4 del spec).
   *
   * @throws {AllianceServiceError} `PAYOUT_NOT_FOUND` si no existe o el id es inválido.
   * @throws {AllianceServiceError} `PAYOUT_ALREADY_ANNULLED` si ya estaba anulada.
   */
  async annulPayout(
    alliancePayoutId: number,
    input: AnnulAlliancePayoutInput,
    actorUserId: number
  ): Promise<AlliancePayoutDetailView> {
    assertPositivePayoutId(alliancePayoutId)

    await db.transaction(async (trx) => {
      const payout = await db
        .from('alliance_payouts')
        .useTransaction(trx)
        .where('alliance_payout_id', alliancePayoutId)
        .forUpdate()
        .first()

      if (!payout) {
        throwFromCatalog(ALLIANCE_ERRORS.PAYOUT_NOT_FOUND)
      }

      if (payout.alliance_payout_annulled_at !== null) {
        throwFromCatalog(ALLIANCE_ERRORS.PAYOUT_ALREADY_ANNULLED)
      }

      // Un solo timestamp para las dos escrituras (CA-6: deben quedar idénticos).
      const annulledAt = DateTime.utc().toSQL({ includeOffset: false })

      const affected = await db
        .from('alliance_payouts')
        .useTransaction(trx)
        .where('alliance_payout_id', alliancePayoutId)
        .whereNull('alliance_payout_annulled_at')
        .update({
          alliance_payout_annulled_at: annulledAt,
          alliance_payout_annulment_reason: input.reason,
          alliance_payout_annulled_by_user_id: actorUserId,
        })

      if (!hasAffectedRows(affected)) {
        // Carrera: otra transacción la anuló entre el FOR UPDATE y el UPDATE.
        throwFromCatalog(ALLIANCE_ERRORS.PAYOUT_ALREADY_ANNULLED)
      }

      await db
        .from('alliance_payout_commissions')
        .useTransaction(trx)
        .where('alliance_payout_id', alliancePayoutId)
        .whereNull('alliance_payout_commission_annulled_at')
        .update({ alliance_payout_commission_annulled_at: annulledAt })
    })

    // Leer el detalle fuera de la transacción para que lea el estado ya confirmado
    return this.getPayoutDetail(alliancePayoutId)
  }

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

  /** Mapea una fila cruda del historial al item del contrato. */
  private toListItem(row: RawPayoutRow, commissionsCount: number): AlliancePayoutListItem {
    const annulledAt =
      row.alliancePayoutAnnulledAt instanceof Date
        ? DateTime.fromJSDate(row.alliancePayoutAnnulledAt, { zone: 'utc' }).toISO()!
        : row.alliancePayoutAnnulledAt
          ? row.alliancePayoutAnnulledAt
          : null
    const createdAt =
      row.createdAt instanceof Date
        ? DateTime.fromJSDate(row.createdAt, { zone: 'utc' }).toISO()!
        : String(row.createdAt)

    return {
      alliancePayoutId: row.alliancePayoutId,
      allianceId: row.allianceId,
      alliancePayoutPaidOn: row.alliancePayoutPaidOn,
      alliancePayoutReference: row.alliancePayoutReference,
      alliancePayoutAmountCents: row.alliancePayoutAmountCents,
      alliancePayoutCommissionsCount: commissionsCount,
      alliancePayoutStatus: annulledAt === null ? 'registered' : 'annulled',
      alliancePayoutCreatedByName: row.alliancePayoutCreatedByName,
      alliancePayoutAnnulledAt: annulledAt,
      alliancePayoutAnnulmentReason: row.alliancePayoutAnnulmentReason,
      alliancePayoutAnnulledByName:
        row.alliancePayoutAnnulledByName && row.alliancePayoutAnnulledByName.trim() !== ''
          ? row.alliancePayoutAnnulledByName
          : null,
      createdAt,
    }
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
