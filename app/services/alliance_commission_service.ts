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
   */
  private buildCommissionScope(
    allianceId: number,
    from: string | undefined,
    to: string | undefined
  ) {
    const scope = db.from('alliance_commissions as c').where('c.alliance_id', allianceId)
    if (from) {
      scope.where('c.alliance_commission_paid_on', '>=', from)
    }
    if (to) {
      scope.where('c.alliance_commission_paid_on', '<=', to)
    }
    return scope
  }

  /**
   * Total devengado del mismo alcance que el listado (regla 4, 8): un solo
   * `SELECT`, `accruedCents` en 0 cuando no hay filas.
   */
  private async computeCommissionTotals(
    scope: ReturnType<AllianceCommissionService['buildCommissionScope']>
  ): Promise<AllianceCommissionTotals> {
    const row = await scope
      .count('* as accrued_count')
      .sum('c.alliance_commission_amount_cents as accrued_cents')
      .first()

    return {
      accruedCount: Number(row?.accrued_count ?? 0),
      accruedCents: Number(row?.accrued_cents ?? 0),
    }
  }

  /** Mapea la fila cruda al contrato público. `livePayout` fijo en `null` (§7, R-3). */
  private toListItem(row: RawCommissionRow): AllianceCommissionListItem {
    const paidAt =
      row.billingPaymentPaidAt instanceof Date
        ? DateTime.fromJSDate(row.billingPaymentPaidAt, { zone: 'utc' })
        : DateTime.fromISO(String(row.billingPaymentPaidAt), { zone: 'utc' })
    const createdAt =
      row.createdAt instanceof Date
        ? DateTime.fromJSDate(row.createdAt, { zone: 'utc' })
        : DateTime.fromISO(String(row.createdAt), { zone: 'utc' })

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
      livePayout: null,
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

    const paginated = await scope
      .clone()
      .join('business_units as bu', 'bu.business_unit_id', 'c.business_unit_id')
      .join('billing_payments as p', 'p.billing_payment_id', 'c.billing_payment_id')
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
        'c.alliance_commission_created_at as createdAt'
      )
      .orderBy('c.alliance_commission_paid_on', 'desc')
      .orderBy('c.alliance_commission_id', 'desc')
      .paginate(page, limit)

    const json = paginated.toJSON()
    const totals = await this.computeCommissionTotals(scope.clone())

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
