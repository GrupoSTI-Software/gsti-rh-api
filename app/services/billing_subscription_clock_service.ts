import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import BillingSubscription from '#models/billing_subscription'
import BillingSubscriptionTransition from '#models/billing_subscription_transition'
import type { BillingSubscriptionTransitionReason } from '#models/billing_subscription_transition'
import BillingSubscriptionChangeService, {
  type ApplyScheduledDecreaseOutcome,
} from '#services/billing_subscription_change_service'
import { toBusinessDateString, isBusinessCalendarDateBefore } from '../utils/business_date.js'

// ─── Tipos internos ──────────────────────────────────────────────────────────

/** Resumen de una corrida de `billing:tick-subscriptions` (USRH1784574994921 + 0859). */
export interface ClockRunResult {
  businessDate: string
  /** Suscripciones no canceladas evaluadas (transición + reducción agendada). */
  processed: number
  /** Suscripciones cuyo estado cambió en esta corrida. */
  transitioned: number
  /** Suscripciones sin transición de estado en esta corrida. */
  skipped: number
  details: ClockTransitionDetail[]
  /** Reducciones agendadas materializadas con desenlace `applied`. */
  changesApplied: number
  /** Reducciones agendadas resueltas como `not_applicable`. */
  changesNotApplicable: number
  /** Suscripciones con al menos un fallo (transición o reducción); se reintentan. */
  failed: number
  changeDetails: ClockScheduledChangeDetail[]
}

export interface ClockTransitionDetail {
  billingSubscriptionId: number
  fromStatus: string
  toStatus: string
  reason: BillingSubscriptionTransitionReason
  idempotent: boolean
}

export interface ClockScheduledChangeDetail {
  billingSubscriptionId: number
  billingSubscriptionChangeId: number
  outcome: 'applied' | 'not_applicable'
  previousEmployees: number
  newEmployees: number
  activeEmployees: number
  minimumContractedEmployees: number
  reason: string | null
}

// ─── Servicio ────────────────────────────────────────────────────────────────

/**
 * Reloj de suscripción (USRH1784574994921).
 *
 * Barrido diario idempotente que evalúa cada suscripción no cancelada y
 * mueve su estado según las reglas R0-R7 del spec. El reloj **nunca cobra**
 * ni inserta en `billing_payments` (R0); solo actualiza `status` en
 * `billing_subscriptions` y registra la transición en
 * `billing_subscription_transitions`.
 *
 * Tras el gobierno de estados, aplica reducciones agendadas cuya fecha de
 * efecto ya se alcanzó (USRH1786107870859) sin mover las fechas del periodo.
 *
 * La idempotencia se garantiza en dos capas:
 *   1. Guards de estado: tras la transición el estado ya no cumple la condición.
 *   2. UNIQUE (billing_subscription_id, cut_date) en la bitácora; insertos
 *      duplicados se ignoran silenciosamente.
 */
export default class BillingSubscriptionClockService {
  private readonly changeService = new BillingSubscriptionChangeService()

  /**
   * Ejecuta el barrido para la fecha de corte dada (CDMX).
   *
   * Por cada suscripción no cancelada, en orden:
   *   1. Gobierno de estados (`resolveTransition` → `applyTransition`), transacción propia.
   *   2. Materialización de reducción agendada (`applyScheduledDecrease`), transacción propia.
   *
   * Un fallo en cualquiera de los dos pasos se registra en `failed` y no aborta el lote
   * (regla 14, USRH1786107870859). Las transacciones de cada paso son independientes.
   *
   * @param businessDate - Fecha de corte en formato `YYYY-MM-DD` (CDMX).
   *                       Por defecto es el día actual en la zona de negocio.
   * @returns Contadores de transiciones y desenlaces de reducción agendada.
   */
  async run(businessDate: string = toBusinessDateString()): Promise<ClockRunResult> {
    const result: ClockRunResult = {
      businessDate,
      processed: 0,
      transitioned: 0,
      skipped: 0,
      details: [],
      changesApplied: 0,
      changesNotApplicable: 0,
      failed: 0,
      changeDetails: [],
    }

    // R4: solo suscripciones no canceladas. SoftDeletes NO auto-filtra en este
    // repo (validador §B.7); se filtra explícitamente con whereNull('deletedAt').
    const subscriptions = await BillingSubscription.query()
      .whereNot('billingSubscriptionStatus', 'canceled')
      .whereNull('billing_subscription_deleted_at')

    for (const sub of subscriptions) {
      result.processed++

      let subscriptionFailed = false

      try {
        const transition = this.resolveTransition(sub, businessDate)

        if (!transition) {
          result.skipped++
        } else {
          const wasIdempotent = await this.applyTransition(sub, transition, businessDate)

          result.transitioned++
          result.details.push({
            billingSubscriptionId: sub.billingSubscriptionId,
            fromStatus: transition.from,
            toStatus: transition.to,
            reason: transition.reason,
            idempotent: wasIdempotent,
          })
        }
      } catch (error: unknown) {
        subscriptionFailed = true
        logger.error(
          {
            err: error,
            billingSubscriptionId: sub.billingSubscriptionId,
            businessDate,
          },
          'billing:tick-subscriptions — fallo al transicionar suscripción'
        )
      }

      try {
        const decreaseOutcome = await this.changeService.applyScheduledDecrease(sub, businessDate)
        this.recordScheduledDecreaseOutcome(result, decreaseOutcome)
      } catch (error: unknown) {
        subscriptionFailed = true
        logger.error(
          {
            err: error,
            billingSubscriptionId: sub.billingSubscriptionId,
            businessDate,
          },
          'billing:tick-subscriptions — fallo al aplicar reducción agendada'
        )
      }

      if (subscriptionFailed) {
        result.failed++
      }
    }

    return result
  }

  private recordScheduledDecreaseOutcome(
    result: ClockRunResult,
    outcome: ApplyScheduledDecreaseOutcome
  ): void {
    if (outcome.outcome === 'sin_cambio') {
      return
    }

    if (outcome.outcome === 'applied') {
      result.changesApplied++
      result.changeDetails.push({
        billingSubscriptionId: outcome.change.billingSubscriptionId,
        billingSubscriptionChangeId: outcome.change.billingSubscriptionChangeId,
        outcome: 'applied',
        previousEmployees: outcome.previousEmployees,
        newEmployees: outcome.newEmployees,
        activeEmployees: outcome.activeEmployees,
        minimumContractedEmployees: outcome.minimumContractedEmployees,
        reason: null,
      })
      return
    }

    result.changesNotApplicable++
    result.changeDetails.push({
      billingSubscriptionId: outcome.change.billingSubscriptionId,
      billingSubscriptionChangeId: outcome.change.billingSubscriptionChangeId,
      outcome: 'not_applicable',
      previousEmployees: outcome.change.billingSubscriptionChangePreviousEmployees,
      newEmployees: outcome.change.billingSubscriptionChangeNewEmployees,
      activeEmployees: outcome.activeEmployees,
      minimumContractedEmployees: outcome.minimumContractedEmployees,
      reason: outcome.reason,
    })
  }

  // ─── Reglas de transición ─────────────────────────────────────────────────

  /**
   * Determina si una suscripción debe transicionar y calcula el estado destino.
   * Retorna `null` si no hay transición que aplicar (estado queda igual).
   */
  private resolveTransition(
    sub: BillingSubscription,
    businessDate: string
  ): { from: string; to: string; reason: BillingSubscriptionTransitionReason } | null {
    const trialEndsAt = sub.billingSubscriptionTrialEndsAt
      ? (sub.billingSubscriptionTrialEndsAt as DateTime).toISODate()
      : null
    const periodEnd = sub.billingSubscriptionCurrentPeriodEnd
      ? (sub.billingSubscriptionCurrentPeriodEnd as DateTime).toISODate()
      : null

    // R1: trial vencido
    if (
      sub.billingSubscriptionStatus === 'trialing' &&
      isBusinessCalendarDateBefore(trialEndsAt, businessDate)
    ) {
      // Tiene cobertura de periodo vigente (period_end >= businessDate)
      if (periodEnd && !isBusinessCalendarDateBefore(periodEnd, businessDate)) {
        return { from: 'trialing', to: 'active', reason: 'trial_expired_covered' }
      }
      return { from: 'trialing', to: 'past_due', reason: 'trial_expired_uncovered' }
    }

    // R2: periodo activo vencido
    if (
      sub.billingSubscriptionStatus === 'active' &&
      isBusinessCalendarDateBefore(periodEnd, businessDate)
    ) {
      return { from: 'active', to: 'past_due', reason: 'period_expired' }
    }

    // R3: past_due sin cambio; R4: canceled nunca llega aquí
    return null
  }

  // ─── Aplicación atómica de transición ────────────────────────────────────

  /**
   * Aplica la transición y registra en bitácora dentro de una misma transacción.
   * Si la bitácora ya tiene un registro para (subscription_id, cut_date) — UNIQUE —
   * el INSERT lanza un error de duplicado que se captura y se trata como
   * corrida idempotente (el estado ya fue cambiado en la corrida anterior).
   *
   * @returns `true` si ya existía una entrada (corrida repetida), `false` si fue nueva.
   */
  private async applyTransition(
    sub: BillingSubscription,
    transition: { from: string; to: string; reason: BillingSubscriptionTransitionReason },
    businessDate: string
  ): Promise<boolean> {
    try {
      await db.transaction(async (trx) => {
        sub.useTransaction(trx)
        sub.billingSubscriptionStatus = transition.to as BillingSubscription['billingSubscriptionStatus']
        await sub.save()

        await BillingSubscriptionTransition.create(
          {
            billingSubscriptionId: sub.billingSubscriptionId,
            billingSubscriptionTransitionFrom: transition.from,
            billingSubscriptionTransitionTo: transition.to,
            billingSubscriptionTransitionReason: transition.reason,
            billingSubscriptionTransitionCutDate: DateTime.fromISO(businessDate),
          },
          { client: trx }
        )
      })
      return false
    } catch (error: unknown) {
      // El UNIQUE de bitácora dispara un error de duplicado cuando el barrido
      // ya corrió para esta suscripción hoy: idempotencia secundaria garantizada.
      if (this.isDuplicateEntryError(error)) {
        return true
      }
      throw error
    }
  }

  private isDuplicateEntryError(error: unknown): boolean {
    if (error instanceof Error) {
      // MySQL: código 1062; código SQLSTATE 23000
      const msg = error.message.toLowerCase()
      return (
        msg.includes('duplicate entry') ||
        msg.includes('unique constraint') ||
        ('code' in error && (error as NodeJS.ErrnoException).code === 'ER_DUP_ENTRY')
      )
    }
    return false
  }
}
