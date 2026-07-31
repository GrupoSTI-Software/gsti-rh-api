import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BillingSubscription from '#models/billing_subscription'
import BillingSubscriptionTransition from '#models/billing_subscription_transition'
import type { BillingSubscriptionTransitionReason } from '#models/billing_subscription_transition'
import { toBusinessDateString, isBusinessCalendarDateBefore } from '../utils/business_date.js'

// ─── Tipos internos ──────────────────────────────────────────────────────────

export interface ClockRunResult {
  businessDate: string
  processed: number
  transitioned: number
  skipped: number
  details: ClockTransitionDetail[]
}

export interface ClockTransitionDetail {
  billingSubscriptionId: number
  fromStatus: string
  toStatus: string
  reason: BillingSubscriptionTransitionReason
  idempotent: boolean
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
 * La idempotencia se garantiza en dos capas:
 *   1. Guards de estado: tras la transición el estado ya no cumple la condición.
 *   2. UNIQUE (billing_subscription_id, cut_date) en la bitácora; insertos
 *      duplicados se ignoran silenciosamente.
 */
export default class BillingSubscriptionClockService {
  /**
   * Ejecuta el barrido para la fecha de corte dada (CDMX).
   *
   * @param businessDate - Fecha de corte en formato `YYYY-MM-DD` (CDMX).
   *                       Por defecto es el día actual en la zona de negocio.
   */
  async run(businessDate: string = toBusinessDateString()): Promise<ClockRunResult> {
    const result: ClockRunResult = {
      businessDate,
      processed: 0,
      transitioned: 0,
      skipped: 0,
      details: [],
    }

    // R4: solo suscripciones no canceladas. SoftDeletes NO auto-filtra en este
    // repo (validador §B.7); se filtra explícitamente con whereNull('deletedAt').
    const subscriptions = await BillingSubscription.query()
      .whereNot('billingSubscriptionStatus', 'canceled')
      .whereNull('billing_subscription_deleted_at')

    for (const sub of subscriptions) {
      result.processed++

      const transition = this.resolveTransition(sub, businessDate)

      if (!transition) {
        result.skipped++
        continue
      }

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

    return result
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
