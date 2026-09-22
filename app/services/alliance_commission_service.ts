import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { resolveRemainingTermPeriods } from '#helpers/alliance_commission'
import AllianceAttribution from '#models/alliance_attribution'
import AllianceCommission from '#models/alliance_commission'
import Alliance from '#models/alliance'
import { ALLIANCE_ERRORS } from '#constants/alliance_error_codes'
import { AllianceServiceError } from '#exceptions/alliance_service_error'
import { assertPositiveAllianceId } from '#services/alliance_service'
import { getBusinessTimeZone, toBusinessDateString } from '#utils/business_date'
import type {
  AllianceCommissionListItem,
  AllianceCommissionLivePayout,
  AllianceCommissionStatus,
  AllianceCommissionTotals,
  ListAllianceCommissionsFilters,
  ListAllianceCommissionsResult,
} from '../interfaces/alliance_commission_interface.js'

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

/** Fila cruda que entrega la consulta con Knex, antes de mapear al contrato. */
interface RawCommissionRow {
  allianceCommissionId: number
  allianceId: number
  allianceAttributionId: number
  businessUnitPublicId: string
  businessUnitName: string
  billingPaymentId: number
  billingSubscriptionId: number
  billingPaymentPaidAt: Date | string
  allianceCommissionAccruedOn: string
  allianceCommissionPeriods: number
  allianceCommissionBaseCents: number
  allianceCommissionPercent: number | string
  allianceCommissionAmountCents: number
  createdAt: Date | string
  /** `NULL` cuando la comisión sigue por pagar (LEFT JOIN sin fila viva). */
  livePayoutId: number | null
  livePayoutPaidOn: string | null
  livePayoutReference: string | null
  livePayoutCreatedByName: string | null
}

export interface AccrueOnPaymentInput {
  businessUnitId: number
  billingPaymentId: number
  /** Periodos de servicio que el pago completa (con IVA, saldo tras adeudo). */
  periodsCovered: number
  /** Precio de un periodo sin IVA y con descuentos, en centavos. */
  periodSubtotalCents: number
  paidAt: DateTime
}

/**
 * Monto de la comisión en centavos: base × porcentaje, redondeado al
 * centavo con medio hacia arriba. Única regla de redondeo del eslabón.
 *
 * Se opera en centavos enteros: `percent` se escala a centésimas
 * (`1.15` → `115`) para no arrastrar binarios de IEEE-754.
 */
export function roundCommissionAmountCents(baseCents: number, percent: number): number {
  const percentHundredths = Math.round(percent * 100)
  return Math.round((baseCents * percentHundredths) / 10_000)
}

function toCommissionPaidOn(paidAt: DateTime): DateTime {
  const iso = toBusinessDateString(paidAt.setZone(getBusinessTimeZone()))
  return DateTime.fromISO(iso, { zone: 'utc' })
}

/**
 * Devengo de comisiones de alianza al registrar un pago
 * (ESB-07-09-09-09).
 *
 * La falta de comisión no es un error del pago: si no hay atribución
 * viva, el porcentaje es cero, no se completa un periodo o el plazo ya
 * está agotado, el pago sigue exactamente igual. Si el INSERT falla, la
 * transacción del pago revierte el acto completo.
 */
export default class AllianceCommissionService {
  /**
   * Suma los periodos de las comisiones de una atribución. Es la única
   * fuente de "periodos devengados": no hay contador en la atribución.
   */
  async sumAccruedPeriods(
    allianceAttributionId: number,
    trx: TransactionClientContract
  ): Promise<number> {
    const row = await db
      .from('alliance_commissions')
      .useTransaction(trx)
      .where('alliance_attribution_id', allianceAttributionId)
      .sum('alliance_commission_periods as accrued')
      .first()

    const accrued = Number(row?.accrued ?? 0)
    return Number.isFinite(accrued) ? accrued : 0
  }

  /**
   * Escribe la comisión del pago, topada al plazo que le quede a la
   * atribución viva. `forUpdate` sobre esa atribución serializa el
   * devengo con el cierre, el ajuste y otro pago de la misma empresa.
   */
  async accrueOnPayment(input: AccrueOnPaymentInput, trx: TransactionClientContract): Promise<void> {
    if (input.periodsCovered < 1) {
      return
    }

    const attribution = await AllianceAttribution.query({ client: trx })
      .where('business_unit_id', input.businessUnitId)
      .whereNull('alliance_attribution_closed_at')
      .forUpdate()
      .first()

    if (!attribution) {
      return
    }

    const percent = Number(attribution.allianceAttributionCommissionPercent)
    if (percent <= 0) {
      return
    }

    const term = attribution.allianceAttributionTermPeriods
    const accrued = await this.sumAccruedPeriods(attribution.allianceAttributionId, trx)
    const remaining = resolveRemainingTermPeriods(term, accrued)
    const periodsConsumed =
      remaining === null ? input.periodsCovered : Math.min(input.periodsCovered, remaining)

    if (periodsConsumed < 1) {
      return
    }

    const baseCents = input.periodSubtotalCents * periodsConsumed
    const amountCents = roundCommissionAmountCents(baseCents, percent)

    await AllianceCommission.create(
      {
        allianceId: attribution.allianceId,
        allianceAttributionId: attribution.allianceAttributionId,
        businessUnitId: input.businessUnitId,
        billingPaymentId: input.billingPaymentId,
        allianceCommissionPeriods: periodsConsumed,
        allianceCommissionBaseCents: baseCents,
        allianceCommissionPercent: percent,
        allianceCommissionAmountCents: amountCents,
        allianceCommissionPaidOn: toCommissionPaidOn(input.paidAt),
      },
      { client: trx }
    )
  }

  /**
   * Rango de fechas validado semánticamente (fecha de calendario real y
   * `from ≤ to`). El formato ya lo afirmó `listAllianceCommissionsValidator`.
   */
  private parseDateRange(
    from: string | undefined,
    to: string | undefined
  ): { from: string | undefined; to: string | undefined } {
    for (const value of [from, to]) {
      if (value === undefined) continue
      const parsed = DateTime.fromISO(value, { zone: 'utc' })
      if (!parsed.isValid || parsed.toISODate() !== value) {
        throwFromCatalog(ALLIANCE_ERRORS.VAL_INPUT)
      }
    }
    if (from !== undefined && to !== undefined && from > to) {
      throwFromCatalog(ALLIANCE_ERRORS.VAL_INPUT)
    }
    return { from, to }
  }

  /**
   * Alcance base de comisiones de la alianza, acotado por el rango
   * (regla 5, 6). Una sola fuente para el listado y para los totales:
   * evita que se desincronicen (regla 8, riesgo R-1 del spec).
   *
   * El `LEFT JOIN` a `alliance_payout_commissions` con
   * `alliance_payout_commission_is_live = 1` es la única definición de
   * "pagada" (USRH1787719056820, regla 11, Notas para IA §15): se escribe
   * aquí una sola vez y la usan filas y totales por igual. El UNIQUE del
   * pivote garantiza a lo sumo una fila viva por comisión: el join no
   * duplica filas.
   */
  private buildCommissionScope(
    allianceId: number,
    from: string | undefined,
    to: string | undefined
  ) {
    const scope = db
      .from('alliance_commissions as c')
      .where('c.alliance_id', allianceId)
      .leftJoin('alliance_payout_commissions as apc', (join) => {
        join
          .on('apc.alliance_commission_id', 'c.alliance_commission_id')
          .andOnVal('apc.alliance_payout_commission_is_live', 1)
      })
    if (from) {
      scope.where('c.alliance_commission_paid_on', '>=', from)
    }
    if (to) {
      scope.where('c.alliance_commission_paid_on', '<=', to)
    }
    return scope
  }

  /** Aplica el filtro de estado (regla 13) SOLO al alcance del detalle, nunca al de los totales. */
  private applyStatusFilter(
    scope: ReturnType<AllianceCommissionService['buildCommissionScope']>,
    status: AllianceCommissionStatus | undefined
  ) {
    if (status === 'pending') {
      scope.whereNull('apc.alliance_payout_commission_id')
    } else if (status === 'paid') {
      scope.whereNotNull('apc.alliance_payout_commission_id')
    }
    return scope
  }

  /**
   * Totales del mismo alcance que el listado, SIN el filtro de estado
   * (regla 14): devengado, pagado y por pagar, cada uno con su conteo. Un
   * solo `SELECT`; en 0 cuando no hay filas. `pendingCount`/`pendingCents`
   * se derivan por resta para que `accruedCount = paidCount + pendingCount`
   * siempre cuadre (regla 15) — nunca se cuentan aparte.
   */
  private async computeCommissionTotals(
    scope: ReturnType<AllianceCommissionService['buildCommissionScope']>
  ): Promise<AllianceCommissionTotals> {
    const row = await scope
      .count('* as accrued_count')
      .sum('c.alliance_commission_amount_cents as accrued_cents')
      .count('apc.alliance_payout_commission_id as paid_count')
      .select(
        db.raw(
          'SUM(CASE WHEN apc.alliance_payout_commission_id IS NOT NULL THEN c.alliance_commission_amount_cents ELSE 0 END) as paid_cents'
        )
      )
      .first()

    const accruedCount = Number(row?.accrued_count ?? 0)
    const accruedCents = Number(row?.accrued_cents ?? 0)
    const paidCount = Number(row?.paid_count ?? 0)
    const paidCents = Number(row?.paid_cents ?? 0)

    return {
      accruedCount,
      accruedCents,
      paidCount,
      paidCents,
      pendingCount: accruedCount - paidCount,
      pendingCents: accruedCents - paidCents,
    }
  }

  /**
   * Mapea la fila cruda al contrato público. "Pagada" se deduce de que
   * `livePayoutId` no sea `NULL` (regla 11): la misma condición que ya
   * fijó el `LEFT JOIN` de `buildCommissionScope`, nunca una segunda
   * derivación aparte.
   */
  private toListItem(row: RawCommissionRow): AllianceCommissionListItem {
    const paidAt =
      row.billingPaymentPaidAt instanceof Date
        ? DateTime.fromJSDate(row.billingPaymentPaidAt, { zone: 'utc' })
        : DateTime.fromISO(String(row.billingPaymentPaidAt), { zone: 'utc' })
    const createdAt =
      row.createdAt instanceof Date
        ? DateTime.fromJSDate(row.createdAt, { zone: 'utc' })
        : DateTime.fromISO(String(row.createdAt), { zone: 'utc' })

    const livePayout: AllianceCommissionLivePayout | null =
      row.livePayoutId === null
        ? null
        : {
            alliancePayoutId: row.livePayoutId,
            paidOn: row.livePayoutPaidOn!,
            reference: row.livePayoutReference!,
            createdByName: row.livePayoutCreatedByName!,
          }

    return {
      allianceCommissionId: row.allianceCommissionId,
      allianceId: row.allianceId,
      allianceAttributionId: row.allianceAttributionId,
      businessUnitPublicId: row.businessUnitPublicId,
      businessUnitName: row.businessUnitName,
      billingPaymentId: row.billingPaymentId,
      billingSubscriptionId: row.billingSubscriptionId,
      billingPaymentPaidAt: paidAt.toISO()!,
      allianceCommissionAccruedOn: row.allianceCommissionAccruedOn,
      allianceCommissionPeriods: row.allianceCommissionPeriods,
      allianceCommissionBaseCents: row.allianceCommissionBaseCents,
      allianceCommissionPercent: Number(row.allianceCommissionPercent),
      allianceCommissionAmountCents: row.allianceCommissionAmountCents,
      allianceCommissionStatus: livePayout === null ? 'pending' : 'paid',
      livePayout,
      createdAt: createdAt.toISO()!,
    }
  }

  /**
   * Comisiones devengadas de una alianza, paginadas y con el total del
   * mismo rango (USRH1789529505468). Solo lectura: no recalcula ninguna
   * comisión (regla 10, 12).
   *
   * @throws {AllianceServiceError} `NOT_FOUND` si la alianza no existe o
   * está retirada; `VAL_INPUT` si el rango de fechas es inválido.
   */
  async listAllianceCommissionsByAlliance(
    allianceId: number,
    filters: ListAllianceCommissionsFilters
  ): Promise<ListAllianceCommissionsResult> {
    assertPositiveAllianceId(allianceId)

    const alliance = await Alliance.query().where('alliance_id', allianceId).first()
    if (!alliance) {
      throwFromCatalog(ALLIANCE_ERRORS.NOT_FOUND)
    }

    const { from, to } = this.parseDateRange(filters.from, filters.to)
    const page = filters.page ?? 1
    const limit = filters.limit ?? 20

    const scope = this.buildCommissionScope(allianceId, from, to)
    // Los totales se calculan ANTES de aplicar el filtro de estado: responden
    // solo al rango de fechas (regla 14), nunca al recorte del detalle.
    const totals = await this.computeCommissionTotals(scope.clone())

    const listScope = this.applyStatusFilter(scope.clone(), filters.status)

    const paginated = await listScope
      .join('business_units as bu', 'bu.business_unit_id', 'c.business_unit_id')
      .join('billing_payments as p', 'p.billing_payment_id', 'c.billing_payment_id')
      .leftJoin('alliance_payouts as ap', 'ap.alliance_payout_id', 'apc.alliance_payout_id')
      .leftJoin('users as ppu', 'ppu.user_id', 'ap.alliance_payout_created_by_user_id')
      .leftJoin('people as ppe', 'ppe.person_id', 'ppu.person_id')
      .select(
        'c.alliance_commission_id as allianceCommissionId',
        'c.alliance_id as allianceId',
        'c.alliance_attribution_id as allianceAttributionId',
        'bu.business_unit_public_id as businessUnitPublicId',
        'bu.business_unit_name as businessUnitName',
        'c.billing_payment_id as billingPaymentId',
        'p.billing_subscription_id as billingSubscriptionId',
        'p.billing_payment_paid_at as billingPaymentPaidAt',
        db.raw("DATE_FORMAT(c.alliance_commission_paid_on, '%Y-%m-%d') as allianceCommissionAccruedOn"),
        'c.alliance_commission_periods as allianceCommissionPeriods',
        'c.alliance_commission_base_cents as allianceCommissionBaseCents',
        'c.alliance_commission_percent as allianceCommissionPercent',
        'c.alliance_commission_amount_cents as allianceCommissionAmountCents',
        'c.alliance_commission_created_at as createdAt',
        'ap.alliance_payout_id as livePayoutId',
        db.raw("DATE_FORMAT(ap.alliance_payout_paid_on, '%Y-%m-%d') as livePayoutPaidOn"),
        'ap.alliance_payout_reference as livePayoutReference',
        db.raw("CONCAT_WS(' ', ppe.person_firstname, ppe.person_lastname) as livePayoutCreatedByName")
      )
      .orderBy('c.alliance_commission_paid_on', 'desc')
      .orderBy('c.alliance_commission_id', 'desc')
      .paginate(page, limit)

    const json = paginated.toJSON()

    return {
      data: (json.data as RawCommissionRow[]).map((row) => this.toListItem(row)),
      meta: {
        total: json.meta.total,
        page: json.meta.currentPage,
        limit: json.meta.perPage,
        lastPage: json.meta.lastPage,
        totals,
      },
    }
  }
}
