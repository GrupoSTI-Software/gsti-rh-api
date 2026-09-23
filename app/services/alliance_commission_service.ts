import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { resolveRemainingTermPeriods } from '#helpers/alliance_commission'
import AllianceAttribution from '#models/alliance_attribution'
import AllianceCommission from '#models/alliance_commission'
import { getBusinessTimeZone, toBusinessDateString } from '#utils/business_date'

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
}
