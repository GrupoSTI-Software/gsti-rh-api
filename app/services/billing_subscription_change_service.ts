import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingSubscription, {
  LIVE_SUBSCRIPTION_STATUSES,
  type BillingSubscriptionStatus,
} from '#models/billing_subscription'
import BillingSubscriptionChange, {
  LIVE_SUBSCRIPTION_CHANGE_STATUSES,
  type BillingSubscriptionChangeStatus,
} from '#models/billing_subscription_change'
import BillingCatalogService, {
  type AppliedDiscountCode,
  type ResolvedPrice,
} from '#services/billing_catalog_service'
import BillingTenantService from '#services/billing_tenant_service'
import EmployeeQuotaService from '#services/employee_quota_service'
import {
  changeApplyFailedError,
  changeInconsistentSnapshotError,
} from '../helpers/billing_payment_error.js'
import {
  changeNotADecreaseError,
  changeNotAnIncreaseError,
  employeesBelowActiveHeadcountError,
  noLiveSubscriptionChangeError,
  noLiveSubscriptionError,
  periodNotProratableError,
  subscriptionChangeConflictError,
  subscriptionPastDueError,
} from '../helpers/billing_tenant_error.js'
import { BillingSubscriptionServiceError } from '../exceptions/billing_subscription_service_error.js'
import {
  daysBetweenBusinessDates,
  getBusinessTimeZone,
  toBusinessDateString,
  toCalendarIsoDate,
  todayInBusinessZone,
} from '../utils/business_date.js'

export type SubscriptionChangeType = 'increase' | 'decrease' | 'none'

export type SubscriptionChangeNextStep = 'awaiting_payment' | 'applied'

export interface SubscriptionChangePreviewAmounts {
  unitAmount?: number
  pricePerEmployee?: number
  discountPercent: number
  discountAmount?: number
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  /**
   * Bloque del código de descuento (USRH1787714804405 §11.1). Presentes solo
   * cuando la suscripción tiene un código congelado (agotado o no); ausentes
   * — no `null` — cuando nunca canjeó uno, para que la respuesta sea byte a
   * byte la de antes de esta historia (regla 13, CA-10).
   */
  codeDiscountAmount?: number
  undiscountedUnitAmount?: number
  undiscountedSubtotal?: number
  undiscountedTaxAmount?: number
  undiscountedTotal?: number
}

export interface SubscriptionChangePreviewCurrentPeriod {
  start: string
  end: string
  totalDays: number
  remainingDays: number
}

export interface SubscriptionChangePreviewProration {
  differenceCents: number
  totalDays: number
  remainingDays: number
  amountCents: number
  amountPesos: number
}

export interface SubscriptionChangePreview {
  billingSubscriptionId: number
  billingPlanId: number
  billingPlanPriceId: number
  billingSubscriptionStatus: BillingSubscriptionStatus
  currency: string
  changeType: SubscriptionChangeType
  contractedEmployees: number
  requestedEmployees: number
  activeEmployees: number
  minimumContractedEmployees: number
  currentPeriod: SubscriptionChangePreviewCurrentPeriod
  cutDate: string
  currentAmounts: SubscriptionChangePreviewAmounts
  newAmounts: SubscriptionChangePreviewAmounts
  proration: SubscriptionChangePreviewProration | null
  effectiveFrom: string | null
}

export interface SubscriptionChangeRecord {
  billingSubscriptionChangeId: number
  billingSubscriptionId: number
  billingSubscriptionChangeType: BillingSubscriptionChange['billingSubscriptionChangeType']
  billingSubscriptionChangeStatus: BillingSubscriptionChangeStatus
  billingSubscriptionChangePreviousEmployees: number
  billingSubscriptionChangeNewEmployees: number
  billingSubscriptionChangeUnitAmount: number
  billingSubscriptionChangeDiscountPercent: number
  billingSubscriptionChangeTaxRate: number
  billingSubscriptionChangeSubtotal: number
  billingSubscriptionChangeTaxAmount: number
  billingSubscriptionChangeTotal: number
  billingSubscriptionChangeProratedAmountCents: number
  billingSubscriptionChangeEffectiveAt: string | null
  billingSubscriptionChangeAppliedAt: string | null
  supersededBillingSubscriptionChangeId: number | null
}

export type ApplyIncreaseNotApplicableReason =
  | 'base-de-cantidad-desfasada'
  | 'plan-no-disponible'
  | 'descuento-desfasado'

export type ApplyIncreaseOutcome =
  | { outcome: 'no_live_change' }
  | { outcome: 'insufficient_payment'; change: SubscriptionChangeRecord }
  | {
      outcome: 'not_applicable'
      change: SubscriptionChangeRecord
      reason: ApplyIncreaseNotApplicableReason
    }
  | {
      outcome: 'applied'
      change: SubscriptionChangeRecord
      /** (USRH1785962095095 v2) Cuánto del dinero disponible tomó el adeudo prorrateado. */
      consumedCents: number
    }

export type ApplyScheduledDecreaseNotApplicableReason =
  | 'cantidad-menor-a-plantilla-activa'
  | 'descuento-desfasado'

export type ApplyScheduledDecreaseOutcome =
  | { outcome: 'sin_cambio' }
  | {
      outcome: 'not_applicable'
      change: SubscriptionChangeRecord
      activeEmployees: number
      minimumContractedEmployees: number
      reason: ApplyScheduledDecreaseNotApplicableReason
    }
  | {
      outcome: 'applied'
      change: SubscriptionChangeRecord
      previousEmployees: number
      newEmployees: number
      activeEmployees: number
      minimumContractedEmployees: number
    }

export interface SubscriptionIncreaseRequestResult {
  billingSubscriptionChangeId: number
  billingSubscriptionId: number
  billingSubscriptionChangeType: 'increase'
  billingSubscriptionChangeStatus: BillingSubscriptionChangeStatus
  previousEmployees: number
  newEmployees: number
  contractedEmployees: number
  currency: string
  newAmounts: {
    pricePerEmployee: number
    discountPercent: number
    subtotal: number
    taxRate: number
    taxAmount: number
    total: number
    codeDiscountAmount?: number
    undiscountedUnitAmount?: number
    undiscountedSubtotal?: number
    undiscountedTaxAmount?: number
    undiscountedTotal?: number
  }
  proration: SubscriptionChangePreviewProration | null
  cutDate: string
  effectiveAt: string | null
  appliedAt: string | null
  nextStep: SubscriptionChangeNextStep
  nextStepMessage: string
}

/**
 * Motor de previsualización del cambio de cantidad contratada (USRH1786107870847).
 * Agnóstico de contexto HTTP: recibe `businessUnitId` explícito y no lee TenantContext.
 */
export default class BillingSubscriptionChangeService {
  private readonly tenantService = new BillingTenantService()
  private readonly catalog = new BillingCatalogService()
  private readonly employeeQuotaService = new EmployeeQuotaService()

  /**
   * Previsualiza el cambio de cantidad contratada de una empresa.
   * Solo lectura: no abre transacción y no escribe nada.
   */
  async previewChange(
    businessUnitId: number,
    requestedEmployees: number
  ): Promise<SubscriptionChangePreview> {
    const subscription = await this.loadLiveSubscription(businessUnitId)

    if (subscription.billingSubscriptionStatus === 'past_due') {
      throw subscriptionPastDueError()
    }

    const todayIso = toBusinessDateString()
    const periodStartIso = toCalendarIsoDate(subscription.billingSubscriptionCurrentPeriodStart)
    const periodEndIso = toCalendarIsoDate(subscription.billingSubscriptionCurrentPeriodEnd)

    const { totalDays, remainingDays } = this.resolvePeriodDays(
      periodStartIso,
      periodEndIso,
      todayIso
    )

    this.tenantService.assertContractedEmployees(requestedEmployees)

    const activeEmployees = await this.employeeQuotaService.countActiveEmployees(businessUnitId)
    const minimumContractedEmployees =
      this.tenantService.resolveMinimumContractedEmployees(activeEmployees)

    if (requestedEmployees < minimumContractedEmployees) {
      throw employeesBelowActiveHeadcountError(activeEmployees, minimumContractedEmployees)
    }

    await this.tenantService.assertPlanReadyToSubscribe(subscription.billingPlanId, todayIso)

    const contractedEmployees = subscription.billingSubscriptionContractedEmployees
    const changeType = this.classifyChangeType(contractedEmployees, requestedEmployees)

    const appliedCode = this.resolveAppliedCode(subscription)
    const resolved = await this.catalog.resolvePrice(
      subscription.billingPlanId,
      requestedEmployees,
      todayIso,
      appliedCode
    )

    const currentAmounts = this.buildCurrentAmounts(subscription)
    const newAmounts = this.buildNewAmounts(subscription, resolved)

    const proration =
      changeType === 'increase'
        ? this.buildProration(currentAmounts.total, newAmounts.total, totalDays, remainingDays)
        : null

    const effectiveFrom = changeType === 'decrease' ? periodEndIso : null

    return {
      billingSubscriptionId: subscription.billingSubscriptionId,
      billingPlanId: subscription.billingPlanId,
      billingPlanPriceId: subscription.billingPlanPriceId,
      billingSubscriptionStatus: subscription.billingSubscriptionStatus,
      currency: subscription.billingSubscriptionContractedCurrency,
      changeType,
      contractedEmployees,
      requestedEmployees,
      activeEmployees,
      minimumContractedEmployees,
      currentPeriod: {
        start: periodStartIso!,
        end: periodEndIso!,
        totalDays,
        remainingDays,
      },
      cutDate: periodEndIso!,
      currentAmounts,
      newAmounts,
      proration,
      effectiveFrom,
    }
  }

  /**
   * Registra la solicitud de AUMENTO de cantidad contratada de una empresa (USRH1786107870850).
   *
   * NO lee TenantContext ni HttpContext: recibe la empresa explícitamente, igual que
   * previewChange. No calcula: delega en previewChange y transcribe. No sube la cantidad
   * contratada salvo en periodo de prueba.
   */
  async requestIncrease(
    businessUnitId: number,
    requestedEmployees: number
  ): Promise<SubscriptionIncreaseRequestResult> {
    const preview = await this.previewChange(businessUnitId, requestedEmployees)

    if (preview.changeType !== 'increase') {
      throw changeNotAnIncreaseError(preview.contractedEmployees, preview.requestedEmployees)
    }

    const change = await db.transaction(async (trx) => {
      const fresh = await BillingSubscription.query({ client: trx })
        .where('business_unit_id', businessUnitId)
        .whereIn('billing_subscription_status', LIVE_SUBSCRIPTION_STATUSES)
        .whereNull('billing_subscription_deleted_at')
        .orderBy('billing_subscription_id', 'desc')
        .forUpdate()
        .first()

      if (!fresh) {
        throw noLiveSubscriptionError()
      }

      this.assertPreviewStillValid(fresh, preview)

      await BillingSubscriptionChange.query({ client: trx })
        .where('billing_subscription_id', fresh.billingSubscriptionId)
        .where('business_unit_id', businessUnitId)
        .whereIn('billing_subscription_change_status', LIVE_SUBSCRIPTION_CHANGE_STATUSES)
        .whereNull('billing_subscription_change_deleted_at')
        .update({ billing_subscription_change_status: 'canceled' })

      const isTrial = fresh.billingSubscriptionStatus === 'trialing'
      const proratedCents = isTrial
        ? 0
        : Math.max(0, preview.proration?.amountCents ?? 0)
      const appliedAt = isTrial ? todayInBusinessZone() : null

      const created = await BillingSubscriptionChange.create(
        {
          billingSubscriptionId: fresh.billingSubscriptionId,
          businessUnitId,
          billingSubscriptionChangeType: 'increase',
          billingSubscriptionChangeStatus: isTrial ? 'applied' : 'pending_payment',
          billingSubscriptionChangePreviousEmployees: preview.contractedEmployees,
          billingSubscriptionChangeNewEmployees: preview.requestedEmployees,
          billingSubscriptionChangeUnitAmount: preview.newAmounts.pricePerEmployee!,
          billingSubscriptionChangeDiscountPercent: preview.newAmounts.discountPercent,
          billingSubscriptionChangeTaxRate: preview.newAmounts.taxRate,
          billingSubscriptionChangeSubtotal: preview.newAmounts.subtotal,
          billingSubscriptionChangeTaxAmount: preview.newAmounts.taxAmount,
          billingSubscriptionChangeTotal: preview.newAmounts.total,
          billingSubscriptionChangeProratedAmountCents: proratedCents,
          billingSubscriptionChangeCodeDiscountAmount: preview.newAmounts.codeDiscountAmount ?? 0,
          billingSubscriptionChangeUndiscountedUnitAmount:
            preview.newAmounts.undiscountedUnitAmount ?? null,
          billingSubscriptionChangeUndiscountedSubtotal:
            preview.newAmounts.undiscountedSubtotal ?? null,
          billingSubscriptionChangeUndiscountedTaxAmount:
            preview.newAmounts.undiscountedTaxAmount ?? null,
          billingSubscriptionChangeUndiscountedTotal:
            preview.newAmounts.undiscountedTotal ?? null,
          billingSubscriptionChangeDiscountCodeText: fresh.billingSubscriptionDiscountCodeText,
          billingSubscriptionChangeDiscountCodeKind: fresh.billingSubscriptionDiscountCodeKind,
          billingSubscriptionChangeEffectiveAt: null,
          billingSubscriptionChangeAppliedAt: appliedAt,
          billingSubscriptionChangeBillingPaymentId: null,
          billingSubscriptionChangeNotApplicableReason: null,
        },
        { client: trx }
      )

      if (isTrial) {
        await this.applyTrialIncreaseSnapshot(fresh, preview, trx)
      }

      return created
    })

    return this.buildIncreaseRequestResult(preview, change)
  }

  /**
   * Agenda una reducción de la cantidad contratada al inicio del próximo periodo
   * (USRH1786107870853). No lee TenantContext ni HttpContext.
   * No modifica `billing_subscriptions`: solo escribe en `billing_subscription_changes`.
   */
  async scheduleDecrease(
    businessUnitId: number,
    requestedEmployees: number
  ): Promise<SubscriptionChangeRecord> {
    const todayIso = toBusinessDateString()

    const { change, supersededId } = await db.transaction(async (trx) => {
      const subscription = await BillingSubscription.query({ client: trx })
        .where('business_unit_id', businessUnitId)
        .whereIn('billing_subscription_status', LIVE_SUBSCRIPTION_STATUSES)
        .whereNull('billing_subscription_deleted_at')
        .orderBy('billing_subscription_id', 'desc')
        .forUpdate()
        .first()

      if (!subscription) {
        throw noLiveSubscriptionError()
      }

      if (subscription.billingSubscriptionStatus === 'past_due') {
        throw subscriptionPastDueError()
      }

      const periodStartIso = toCalendarIsoDate(subscription.billingSubscriptionCurrentPeriodStart)
      const periodEndIso = toCalendarIsoDate(subscription.billingSubscriptionCurrentPeriodEnd)
      this.resolvePeriodDays(periodStartIso, periodEndIso, todayIso)

      this.tenantService.assertContractedEmployees(requestedEmployees)

      const contractedEmployees = subscription.billingSubscriptionContractedEmployees
      if (requestedEmployees >= contractedEmployees) {
        throw changeNotADecreaseError(contractedEmployees, requestedEmployees)
      }

      const activeEmployees = await this.employeeQuotaService.countActiveEmployees(
        businessUnitId,
        trx
      )
      const minimumContractedEmployees =
        this.tenantService.resolveMinimumContractedEmployees(activeEmployees)

      if (requestedEmployees < minimumContractedEmployees) {
        throw employeesBelowActiveHeadcountError(activeEmployees, minimumContractedEmployees)
      }

      await this.tenantService.assertPlanReadyToSubscribe(subscription.billingPlanId, todayIso)

      const appliedCode = this.resolveAppliedCode(subscription)
      const resolved = await this.catalog.resolvePrice(
        subscription.billingPlanId,
        requestedEmployees,
        todayIso,
        appliedCode
      )
      const discountBlock = this.buildDiscountBlock(subscription, resolved)

      const liveChanges = await BillingSubscriptionChange.query({ client: trx })
        .where('billing_subscription_id', subscription.billingSubscriptionId)
        .where('business_unit_id', businessUnitId)
        .whereIn('billing_subscription_change_status', LIVE_SUBSCRIPTION_CHANGE_STATUSES)
        .whereNull('billing_subscription_change_deleted_at')
        .orderBy('billing_subscription_change_id', 'desc')
        .forUpdate()

      const supersededBillingSubscriptionChangeId =
        liveChanges[0]?.billingSubscriptionChangeId ?? null

      if (liveChanges.length > 0) {
        await BillingSubscriptionChange.query({ client: trx })
          .where('billing_subscription_id', subscription.billingSubscriptionId)
          .where('business_unit_id', businessUnitId)
          .whereIn('billing_subscription_change_status', LIVE_SUBSCRIPTION_CHANGE_STATUSES)
          .whereNull('billing_subscription_change_deleted_at')
          .update({ billing_subscription_change_status: 'canceled' })
      }

      const effectiveAt = DateTime.fromISO(periodEndIso!, { zone: getBusinessTimeZone() }).startOf(
        'day'
      )

      const created = await BillingSubscriptionChange.create(
        {
          billingSubscriptionId: subscription.billingSubscriptionId,
          businessUnitId,
          billingSubscriptionChangeType: 'decrease',
          billingSubscriptionChangeStatus: 'scheduled',
          billingSubscriptionChangePreviousEmployees: contractedEmployees,
          billingSubscriptionChangeNewEmployees: requestedEmployees,
          billingSubscriptionChangeUnitAmount: resolved.pricePerEmployee,
          billingSubscriptionChangeDiscountPercent: resolved.discountPercent,
          billingSubscriptionChangeTaxRate: resolved.taxRate,
          billingSubscriptionChangeSubtotal: resolved.subtotal,
          billingSubscriptionChangeTaxAmount: resolved.taxAmount,
          billingSubscriptionChangeTotal: resolved.total,
          billingSubscriptionChangeProratedAmountCents: 0,
          billingSubscriptionChangeCodeDiscountAmount: discountBlock.codeDiscountAmount,
          billingSubscriptionChangeUndiscountedUnitAmount: discountBlock.undiscountedUnitAmount,
          billingSubscriptionChangeUndiscountedSubtotal: discountBlock.undiscountedSubtotal,
          billingSubscriptionChangeUndiscountedTaxAmount: discountBlock.undiscountedTaxAmount,
          billingSubscriptionChangeUndiscountedTotal: discountBlock.undiscountedTotal,
          billingSubscriptionChangeDiscountCodeText: subscription.billingSubscriptionDiscountCodeText,
          billingSubscriptionChangeDiscountCodeKind: subscription.billingSubscriptionDiscountCodeKind,
          billingSubscriptionChangeEffectiveAt: effectiveAt,
          billingSubscriptionChangeAppliedAt: null,
          billingSubscriptionChangeBillingPaymentId: null,
          billingSubscriptionChangeNotApplicableReason: null,
        },
        { client: trx }
      )

      return { change: created, supersededId: supersededBillingSubscriptionChangeId }
    })

    return this.buildChangeRecord(change, supersededId)
  }

  /**
   * Materializa una reducción `scheduled` cuya fecha de efecto ya se alcanzó
   * (USRH1786107870859). Agnóstico de contexto HTTP: recibe la suscripción y la
   * fecha de corte explícitas; no lee `TenantContext`.
   *
   * Algoritmo (transacción única por invocación):
   *   1. Candado `FOR UPDATE` sobre la fila `decrease` + `scheduled` más antigua
   *      con `effective_at <= businessDate`, filtrando por `billing_subscription_id`
   *      y `business_unit_id`.
   *   2. Revalidación contra la plantilla activa del momento (`countActiveEmployees`
   *      + `resolveMinimumContractedEmployees`).
   *   3. Desenlace `not_applicable` si la cantidad agendada quedó bajo el mínimo;
   *      desenlace `applied` copiando los importes congelados (sin recotizar catálogo).
   *
   * No mueve `current_period_start/end`, `trial_ends_at` ni `status`. No cobra ni
   * devuelve dinero. Idempotente: estados terminales (`applied`, `not_applicable`) no
   * se reprocesan.
   *
   * @param subscription - Suscripción viva ya cargada por el barrido; se usa su id
   *   y `businessUnitId` para aislamiento explícito entre empresas.
   * @param businessDate - Fecha de corte civil CDMX (`YYYY-MM-DD`).
   * @returns `sin_cambio` si no hay reducción vencida; `applied` o `not_applicable`
   *   con el registro del cambio y conteos de revalidación.
   */
  async applyScheduledDecrease(
    subscription: BillingSubscription,
    businessDate: string
  ): Promise<ApplyScheduledDecreaseOutcome> {
    const businessDateEnd = DateTime.fromISO(businessDate, { zone: getBusinessTimeZone() }).endOf(
      'day'
    )

    return db.transaction(async (trx) => {
      const change = await BillingSubscriptionChange.query({ client: trx })
        .where('billing_subscription_id', subscription.billingSubscriptionId)
        .where('business_unit_id', subscription.businessUnitId)
        .where('billing_subscription_change_type', 'decrease')
        .where('billing_subscription_change_status', 'scheduled')
        .whereNull('billing_subscription_change_deleted_at')
        .where(
          'billing_subscription_change_effective_at',
          '<=',
          businessDateEnd.toSQL({ includeOffset: false })!
        )
        .orderBy('billing_subscription_change_id', 'asc')
        .forUpdate()
        .first()

      if (!change) {
        return { outcome: 'sin_cambio' }
      }

      if (change.businessUnitId !== subscription.businessUnitId) {
        throw new Error('El cambio agendado no pertenece a la empresa de la suscripción.')
      }

      const activeEmployees = await this.employeeQuotaService.countActiveEmployees(
        subscription.businessUnitId,
        trx
      )
      const minimumContractedEmployees =
        this.tenantService.resolveMinimumContractedEmployees(activeEmployees)

      if (change.billingSubscriptionChangeNewEmployees < minimumContractedEmployees) {
        const updated = await this.markScheduledDecreaseNotApplicable(change, trx)
        return {
          outcome: 'not_applicable',
          change: this.buildChangeRecord(updated, null),
          activeEmployees,
          minimumContractedEmployees,
          reason: 'cantidad-menor-a-plantilla-activa',
        }
      }

      const lockedSub = await BillingSubscription.query({ client: trx })
        .where('billing_subscription_id', subscription.billingSubscriptionId)
        .where('business_unit_id', subscription.businessUnitId)
        .whereNull('billing_subscription_deleted_at')
        .forUpdate()
        .firstOrFail()

      this.assertIncreaseChangeSnapshotConsistent(change)

      if (this.detectDiscountCodeDrift(change, lockedSub)) {
        const updated = await this.markScheduledDecreaseNotApplicable(
          change,
          trx,
          'descuento-desfasado'
        )
        return {
          outcome: 'not_applicable',
          change: this.buildChangeRecord(updated, null),
          activeEmployees,
          minimumContractedEmployees,
          reason: 'descuento-desfasado',
        }
      }

      const previousEmployees = lockedSub.billingSubscriptionContractedEmployees

      lockedSub.billingSubscriptionContractedEmployees = change.billingSubscriptionChangeNewEmployees
      lockedSub.billingSubscriptionContractedUnitAmount =
        change.billingSubscriptionChangeUnitAmount
      lockedSub.billingSubscriptionDiscountPercent = change.billingSubscriptionChangeDiscountPercent
      lockedSub.billingSubscriptionContractedTaxRate = change.billingSubscriptionChangeTaxRate
      lockedSub.billingSubscriptionContractedSubtotal = change.billingSubscriptionChangeSubtotal
      lockedSub.billingSubscriptionContractedTaxAmount = change.billingSubscriptionChangeTaxAmount
      lockedSub.billingSubscriptionContractedTotal = change.billingSubscriptionChangeTotal
      lockedSub.billingSubscriptionCodeDiscountAmount = Number(
        change.billingSubscriptionChangeCodeDiscountAmount
      )
      lockedSub.billingSubscriptionUndiscountedUnitAmount =
        change.billingSubscriptionChangeUndiscountedUnitAmount !== null
          ? Number(change.billingSubscriptionChangeUndiscountedUnitAmount)
          : null
      lockedSub.billingSubscriptionUndiscountedSubtotal =
        change.billingSubscriptionChangeUndiscountedSubtotal !== null
          ? Number(change.billingSubscriptionChangeUndiscountedSubtotal)
          : null
      lockedSub.billingSubscriptionUndiscountedTaxAmount =
        change.billingSubscriptionChangeUndiscountedTaxAmount !== null
          ? Number(change.billingSubscriptionChangeUndiscountedTaxAmount)
          : null
      lockedSub.billingSubscriptionUndiscountedTotal =
        change.billingSubscriptionChangeUndiscountedTotal !== null
          ? Number(change.billingSubscriptionChangeUndiscountedTotal)
          : null
      lockedSub.billingSubscriptionContractedEffectiveFrom = DateTime.fromISO(businessDate, {
        zone: getBusinessTimeZone(),
      })
      await lockedSub.save()

      change.useTransaction(trx)
      change.billingSubscriptionChangeStatus = 'applied'
      change.billingSubscriptionChangeAppliedAt = DateTime.now()
      change.billingSubscriptionChangeNotApplicableReason = null
      await change.save()

      return {
        outcome: 'applied',
        change: this.buildChangeRecord(change, null),
        previousEmployees,
        newEmployees: change.billingSubscriptionChangeNewEmployees,
        activeEmployees,
        minimumContractedEmployees,
      }
    })
  }

  /**
   * Aplica un aumento `pending_payment` cuando el dinero disponible cubre el adeudo
   * prorrateado (USRH1786107870856). Mutar la suscripción en memoria; el caller persiste
   * con `save()`.
   *
   * (USRH1785962095095 v2) `availableCents` es el saldo disponible del acto de cobro
   * (saldo previo + monto asentado), **no** el importe del pago: el saldo a favor es la
   * única puerta de entrada del dinero, y el adeudo se cubre desde ahí antes que los
   * periodos. Si se cubre, el `outcome: 'applied'` regresa `consumedCents` para que el
   * llamador reste ese dinero antes de traducir el resto en periodos completos.
   *
   * @throws {BillingPaymentServiceError} si el cambio no pertenece a la empresa o el
   *   snapshot congelado es inválido (fail-closed, rollback de la transacción del pago).
   */
  async applyIncreaseOnPayment(
    subscription: BillingSubscription,
    billingPaymentId: number,
    availableCents: number,
    trx: TransactionClientContract
  ): Promise<ApplyIncreaseOutcome> {
    const liveChange = await BillingSubscriptionChange.query({ client: trx })
      .where('billing_subscription_id', subscription.billingSubscriptionId)
      .where('business_unit_id', subscription.businessUnitId)
      .where('billing_subscription_change_type', 'increase')
      .where('billing_subscription_change_status', 'pending_payment')
      .whereNull('billing_subscription_change_deleted_at')
      .orderBy('billing_subscription_change_id', 'desc')
      .forUpdate()
      .first()

    if (!liveChange) {
      return { outcome: 'no_live_change' }
    }

    if (liveChange.businessUnitId !== subscription.businessUnitId) {
      throw changeApplyFailedError(
        'El cambio pendiente no pertenece a la empresa de la suscripción.'
      )
    }

    this.assertIncreaseChangeSnapshotConsistent(liveChange)

    if (availableCents < liveChange.billingSubscriptionChangeProratedAmountCents) {
      return {
        outcome: 'insufficient_payment',
        change: this.buildChangeRecord(liveChange, null),
      }
    }

    if (
      subscription.billingSubscriptionContractedEmployees !==
      liveChange.billingSubscriptionChangePreviousEmployees
    ) {
      const updated = await this.markChangeNotApplicable(
        liveChange,
        billingPaymentId,
        'base-de-cantidad-desfasada',
        trx
      )
      return {
        outcome: 'not_applicable',
        change: this.buildChangeRecord(updated, null),
        reason: 'base-de-cantidad-desfasada',
      }
    }

    if (this.detectDiscountCodeDrift(liveChange, subscription)) {
      const updated = await this.markChangeNotApplicable(
        liveChange,
        billingPaymentId,
        'descuento-desfasado',
        trx
      )
      return {
        outcome: 'not_applicable',
        change: this.buildChangeRecord(updated, null),
        reason: 'descuento-desfasado',
      }
    }

    const todayIso = toBusinessDateString()
    try {
      await this.tenantService.assertPlanReadyToSubscribe(subscription.billingPlanId, todayIso)
    } catch (error) {
      if (error instanceof BillingSubscriptionServiceError) {
        const updated = await this.markChangeNotApplicable(
          liveChange,
          billingPaymentId,
          'plan-no-disponible',
          trx
        )
        return {
          outcome: 'not_applicable',
          change: this.buildChangeRecord(updated, null),
          reason: 'plan-no-disponible',
        }
      }
      throw error
    }

    subscription.useTransaction(trx)
    subscription.billingSubscriptionContractedEmployees =
      liveChange.billingSubscriptionChangeNewEmployees
    subscription.billingSubscriptionContractedUnitAmount = Number(
      liveChange.billingSubscriptionChangeUnitAmount
    )
    subscription.billingSubscriptionDiscountPercent = Number(
      liveChange.billingSubscriptionChangeDiscountPercent
    )
    subscription.billingSubscriptionContractedTaxRate = Number(
      liveChange.billingSubscriptionChangeTaxRate
    )
    subscription.billingSubscriptionContractedSubtotal = Number(
      liveChange.billingSubscriptionChangeSubtotal
    )
    subscription.billingSubscriptionContractedTaxAmount = Number(
      liveChange.billingSubscriptionChangeTaxAmount
    )
    subscription.billingSubscriptionContractedTotal = Number(
      liveChange.billingSubscriptionChangeTotal
    )
    subscription.billingSubscriptionCodeDiscountAmount = Number(
      liveChange.billingSubscriptionChangeCodeDiscountAmount
    )
    subscription.billingSubscriptionUndiscountedUnitAmount =
      liveChange.billingSubscriptionChangeUndiscountedUnitAmount !== null
        ? Number(liveChange.billingSubscriptionChangeUndiscountedUnitAmount)
        : null
    subscription.billingSubscriptionUndiscountedSubtotal =
      liveChange.billingSubscriptionChangeUndiscountedSubtotal !== null
        ? Number(liveChange.billingSubscriptionChangeUndiscountedSubtotal)
        : null
    subscription.billingSubscriptionUndiscountedTaxAmount =
      liveChange.billingSubscriptionChangeUndiscountedTaxAmount !== null
        ? Number(liveChange.billingSubscriptionChangeUndiscountedTaxAmount)
        : null
    subscription.billingSubscriptionUndiscountedTotal =
      liveChange.billingSubscriptionChangeUndiscountedTotal !== null
        ? Number(liveChange.billingSubscriptionChangeUndiscountedTotal)
        : null

    liveChange.useTransaction(trx)
    liveChange.billingSubscriptionChangeStatus = 'applied'
    liveChange.billingSubscriptionChangeAppliedAt = DateTime.now()
    liveChange.billingSubscriptionChangeBillingPaymentId = billingPaymentId
    liveChange.billingSubscriptionChangeNotApplicableReason = null
    await liveChange.save()

    return {
      outcome: 'applied',
      change: this.buildChangeRecord(liveChange, null),
      consumedCents: liveChange.billingSubscriptionChangeProratedAmountCents,
    }
  }

  /**
   * Cancela el cambio vivo de la empresa mientras no haya surtido efecto
   * (USRH1786107870853). No modifica `billing_subscriptions`.
   */
  async cancelLiveChange(businessUnitId: number): Promise<SubscriptionChangeRecord> {
    const change = await db.transaction(async (trx) => {
      const subscription = await BillingSubscription.query({ client: trx })
        .where('business_unit_id', businessUnitId)
        .whereIn('billing_subscription_status', LIVE_SUBSCRIPTION_STATUSES)
        .whereNull('billing_subscription_deleted_at')
        .orderBy('billing_subscription_id', 'desc')
        .forUpdate()
        .first()

      if (!subscription) {
        throw noLiveSubscriptionError()
      }

      if (subscription.billingSubscriptionStatus === 'past_due') {
        throw subscriptionPastDueError()
      }

      const liveChange = await BillingSubscriptionChange.query({ client: trx })
        .where('billing_subscription_id', subscription.billingSubscriptionId)
        .where('business_unit_id', businessUnitId)
        .whereIn('billing_subscription_change_status', LIVE_SUBSCRIPTION_CHANGE_STATUSES)
        .whereNull('billing_subscription_change_deleted_at')
        .orderBy('billing_subscription_change_id', 'desc')
        .forUpdate()
        .first()

      if (!liveChange) {
        throw noLiveSubscriptionChangeError()
      }

      liveChange.useTransaction(trx)
      liveChange.billingSubscriptionChangeStatus = 'canceled'
      await liveChange.save()

      return liveChange
    })

    return this.buildChangeRecord(change, null)
  }

  private async markScheduledDecreaseNotApplicable(
    change: BillingSubscriptionChange,
    trx: TransactionClientContract,
    reason: ApplyScheduledDecreaseNotApplicableReason = 'cantidad-menor-a-plantilla-activa'
  ): Promise<BillingSubscriptionChange> {
    change.useTransaction(trx)
    change.billingSubscriptionChangeStatus = 'not_applicable'
    change.billingSubscriptionChangeNotApplicableReason = reason
    change.billingSubscriptionChangeAppliedAt = null
    await change.save()
    return change
  }

  private async markChangeNotApplicable(
    change: BillingSubscriptionChange,
    billingPaymentId: number,
    reason: ApplyIncreaseNotApplicableReason,
    trx: TransactionClientContract
  ): Promise<BillingSubscriptionChange> {
    change.useTransaction(trx)
    change.billingSubscriptionChangeStatus = 'not_applicable'
    change.billingSubscriptionChangeNotApplicableReason = reason
    change.billingSubscriptionChangeBillingPaymentId = billingPaymentId
    change.billingSubscriptionChangeAppliedAt = null
    await change.save()
    return change
  }

  private assertIncreaseChangeSnapshotConsistent(change: BillingSubscriptionChange): void {
    const numericFields = [
      change.billingSubscriptionChangeUnitAmount,
      change.billingSubscriptionChangeDiscountPercent,
      change.billingSubscriptionChangeTaxRate,
      change.billingSubscriptionChangeSubtotal,
      change.billingSubscriptionChangeTaxAmount,
      change.billingSubscriptionChangeTotal,
    ]

    for (const value of numericFields) {
      const numeric = Number(value)
      if (!Number.isFinite(numeric)) {
        throw changeInconsistentSnapshotError()
      }
    }

    if (
      !Number.isInteger(change.billingSubscriptionChangeProratedAmountCents) ||
      change.billingSubscriptionChangeProratedAmountCents < 0
    ) {
      throw changeInconsistentSnapshotError()
    }

    if (
      !Number.isInteger(change.billingSubscriptionChangePreviousEmployees) ||
      !Number.isInteger(change.billingSubscriptionChangeNewEmployees) ||
      change.billingSubscriptionChangePreviousEmployees <= 0 ||
      change.billingSubscriptionChangeNewEmployees <= 0
    ) {
      throw changeInconsistentSnapshotError()
    }

    // Bloque del código (USRH1787714804405 §14/CA-7): con código congelado en
    // la fila del cambio, los cinco campos deben venir completos y finitos
    // — agotado o no, `resolveAppliedCode`/`buildDiscountBlock` siempre los
    // llenan (regla 5: sin código, 0/undiscounted=contracted).
    if (change.billingSubscriptionChangeDiscountCodeText !== null) {
      const discountFields = [
        change.billingSubscriptionChangeCodeDiscountAmount,
        change.billingSubscriptionChangeUndiscountedUnitAmount,
        change.billingSubscriptionChangeUndiscountedSubtotal,
        change.billingSubscriptionChangeUndiscountedTaxAmount,
        change.billingSubscriptionChangeUndiscountedTotal,
      ]

      for (const value of discountFields) {
        if (value === null || !Number.isFinite(Number(value))) {
          throw changeInconsistentSnapshotError()
        }
      }
    }
  }

  private buildChangeRecord(
    change: BillingSubscriptionChange,
    supersededBillingSubscriptionChangeId: number | null
  ): SubscriptionChangeRecord {
    return {
      billingSubscriptionChangeId: change.billingSubscriptionChangeId,
      billingSubscriptionId: change.billingSubscriptionId,
      billingSubscriptionChangeType: change.billingSubscriptionChangeType,
      billingSubscriptionChangeStatus: change.billingSubscriptionChangeStatus,
      billingSubscriptionChangePreviousEmployees: change.billingSubscriptionChangePreviousEmployees,
      billingSubscriptionChangeNewEmployees: change.billingSubscriptionChangeNewEmployees,
      billingSubscriptionChangeUnitAmount: Number(change.billingSubscriptionChangeUnitAmount),
      billingSubscriptionChangeDiscountPercent: Number(
        change.billingSubscriptionChangeDiscountPercent
      ),
      billingSubscriptionChangeTaxRate: Number(change.billingSubscriptionChangeTaxRate),
      billingSubscriptionChangeSubtotal: Number(change.billingSubscriptionChangeSubtotal),
      billingSubscriptionChangeTaxAmount: Number(change.billingSubscriptionChangeTaxAmount),
      billingSubscriptionChangeTotal: Number(change.billingSubscriptionChangeTotal),
      billingSubscriptionChangeProratedAmountCents: change.billingSubscriptionChangeProratedAmountCents,
      billingSubscriptionChangeEffectiveAt: change.billingSubscriptionChangeEffectiveAt
        ? toCalendarIsoDate(change.billingSubscriptionChangeEffectiveAt)
        : null,
      billingSubscriptionChangeAppliedAt:
        change.billingSubscriptionChangeAppliedAt?.toISO() ?? null,
      supersededBillingSubscriptionChangeId,
    }
  }

  private assertPreviewStillValid(
    fresh: BillingSubscription,
    preview: SubscriptionChangePreview
  ): void {
    if (fresh.billingSubscriptionId !== preview.billingSubscriptionId) {
      throw subscriptionChangeConflictError()
    }

    if (Number(fresh.billingSubscriptionContractedEmployees) !== preview.contractedEmployees) {
      throw subscriptionChangeConflictError()
    }

    const freshPeriodEnd = toCalendarIsoDate(fresh.billingSubscriptionCurrentPeriodEnd)
    if (freshPeriodEnd !== preview.currentPeriod.end) {
      throw subscriptionChangeConflictError()
    }
  }

  private async applyTrialIncreaseSnapshot(
    subscription: BillingSubscription,
    preview: SubscriptionChangePreview,
    trx: TransactionClientContract
  ): Promise<void> {
    const todayIso = toBusinessDateString()
    const appliedCode = this.resolveAppliedCode(subscription)
    const resolved = await this.catalog.resolvePrice(
      subscription.billingPlanId,
      preview.requestedEmployees,
      todayIso,
      appliedCode
    )

    const currentPrice = await BillingPlanPrice.query({ client: trx })
      .where('billing_plan_id', subscription.billingPlanId)
      .where('billing_plan_price_effective_from', '<=', todayIso)
      .orderBy('billing_plan_price_effective_from', 'desc')
      .first()

    if (!currentPrice) {
      throw subscriptionChangeConflictError()
    }

    const discountBlock = this.buildDiscountBlock(subscription, resolved)

    subscription.useTransaction(trx)
    subscription.billingSubscriptionContractedEmployees = preview.requestedEmployees
    subscription.billingPlanPriceId = currentPrice.billingPlanPriceId
    subscription.billingSubscriptionContractedUnitAmount = resolved.pricePerEmployee
    subscription.billingSubscriptionDiscountPercent = resolved.discountPercent
    subscription.billingSubscriptionContractedSubtotal = resolved.subtotal
    subscription.billingSubscriptionContractedTaxRate = resolved.taxRate
    subscription.billingSubscriptionContractedTaxAmount = resolved.taxAmount
    subscription.billingSubscriptionContractedTotal = resolved.total
    subscription.billingSubscriptionContractedCurrency = resolved.currency
    subscription.billingSubscriptionCodeDiscountAmount = discountBlock.codeDiscountAmount
    subscription.billingSubscriptionUndiscountedUnitAmount = discountBlock.undiscountedUnitAmount
    subscription.billingSubscriptionUndiscountedSubtotal = discountBlock.undiscountedSubtotal
    subscription.billingSubscriptionUndiscountedTaxAmount = discountBlock.undiscountedTaxAmount
    subscription.billingSubscriptionUndiscountedTotal = discountBlock.undiscountedTotal
    await subscription.save()
  }

  private buildIncreaseRequestResult(
    preview: SubscriptionChangePreview,
    change: BillingSubscriptionChange
  ): SubscriptionIncreaseRequestResult {
    const isTrial = change.billingSubscriptionChangeStatus === 'applied'
    const proration = isTrial ? null : preview.proration

    return {
      billingSubscriptionChangeId: change.billingSubscriptionChangeId,
      billingSubscriptionId: change.billingSubscriptionId,
      billingSubscriptionChangeType: 'increase',
      billingSubscriptionChangeStatus: change.billingSubscriptionChangeStatus,
      previousEmployees: change.billingSubscriptionChangePreviousEmployees,
      newEmployees: change.billingSubscriptionChangeNewEmployees,
      contractedEmployees: isTrial ? preview.requestedEmployees : preview.contractedEmployees,
      currency: preview.currency,
      newAmounts: {
        pricePerEmployee: preview.newAmounts.pricePerEmployee!,
        discountPercent: preview.newAmounts.discountPercent,
        subtotal: preview.newAmounts.subtotal,
        taxRate: preview.newAmounts.taxRate,
        taxAmount: preview.newAmounts.taxAmount,
        total: preview.newAmounts.total,
        codeDiscountAmount: preview.newAmounts.codeDiscountAmount,
        undiscountedUnitAmount: preview.newAmounts.undiscountedUnitAmount,
        undiscountedSubtotal: preview.newAmounts.undiscountedSubtotal,
        undiscountedTaxAmount: preview.newAmounts.undiscountedTaxAmount,
        undiscountedTotal: preview.newAmounts.undiscountedTotal,
      },
      proration,
      cutDate: preview.cutDate,
      effectiveAt: null,
      appliedAt: change.billingSubscriptionChangeAppliedAt?.toISO() ?? null,
      nextStep: isTrial ? 'applied' : 'awaiting_payment',
      nextStepMessage: isTrial
        ? `Tu cantidad contratada ya es de ${preview.requestedEmployees} empleados. Tu primer pago saldrá a ese importe.`
        : 'Registramos tu solicitud. Tu cupo aumentará cuando confirmemos el pago del adeudo.',
    }
  }

  private async loadLiveSubscription(businessUnitId: number): Promise<BillingSubscription> {
    const subscription = await BillingSubscription.query()
      .where('business_unit_id', businessUnitId)
      .whereIn('billing_subscription_status', LIVE_SUBSCRIPTION_STATUSES)
      .whereNull('billing_subscription_deleted_at')
      .orderBy('billing_subscription_id', 'desc')
      .first()

    if (!subscription) {
      throw noLiveSubscriptionError()
    }

    return subscription
  }

  private resolvePeriodDays(
    periodStartIso: string | null,
    periodEndIso: string | null,
    todayIso: string
  ): { totalDays: number; remainingDays: number } {
    if (!periodStartIso || !periodEndIso) {
      throw periodNotProratableError()
    }

    const totalDays = daysBetweenBusinessDates(periodStartIso, periodEndIso)
    const remainingDays = daysBetweenBusinessDates(todayIso, periodEndIso)

    if (totalDays <= 0 || remainingDays <= 0) {
      throw periodNotProratableError()
    }

    return { totalDays, remainingDays }
  }

  private classifyChangeType(
    contractedEmployees: number,
    requestedEmployees: number
  ): SubscriptionChangeType {
    if (requestedEmployees > contractedEmployees) {
      return 'increase'
    }
    if (requestedEmployees < contractedEmployees) {
      return 'decrease'
    }
    return 'none'
  }

  private buildCurrentAmounts(
    subscription: BillingSubscription
  ): SubscriptionChangePreviewAmounts {
    return {
      unitAmount: Number(subscription.billingSubscriptionContractedUnitAmount),
      discountPercent: Number(subscription.billingSubscriptionDiscountPercent),
      subtotal: Number(subscription.billingSubscriptionContractedSubtotal),
      taxRate: Number(subscription.billingSubscriptionContractedTaxRate),
      taxAmount: Number(subscription.billingSubscriptionContractedTaxAmount),
      total: Number(subscription.billingSubscriptionContractedTotal),
    }
  }

  private buildNewAmounts(
    subscription: BillingSubscription,
    resolved: ResolvedPrice
  ): SubscriptionChangePreviewAmounts {
    const base: SubscriptionChangePreviewAmounts = {
      pricePerEmployee: resolved.pricePerEmployee,
      discountPercent: resolved.discountPercent,
      discountAmount: resolved.discountAmount,
      subtotal: resolved.subtotal,
      taxRate: resolved.taxRate,
      taxAmount: resolved.taxAmount,
      total: resolved.total,
    }

    if (subscription.billingSubscriptionDiscountCodeText === null) {
      return base
    }

    const block = this.buildDiscountBlock(subscription, resolved)
    return {
      ...base,
      codeDiscountAmount: block.codeDiscountAmount,
      undiscountedUnitAmount: block.undiscountedUnitAmount ?? undefined,
      undiscountedSubtotal: block.undiscountedSubtotal ?? undefined,
      undiscountedTaxAmount: block.undiscountedTaxAmount ?? undefined,
      undiscountedTotal: block.undiscountedTotal ?? undefined,
    }
  }

  /**
   * Determina si a la suscripción se le debe aplicar su código congelado al
   * recotizar (USRH1787714804405 §4.1). `undefined` sin código o con el
   * beneficio agotado (regla 15 de USRH1787714804404.md, fuente única): un
   * cambio de cupo no revive un beneficio agotado ni lo consume.
   */
  private resolveAppliedCode(subscription: BillingSubscription): AppliedDiscountCode | undefined {
    const text = subscription.billingSubscriptionDiscountCodeText
    if (text === null) {
      return undefined
    }

    const benefitPeriods = subscription.billingSubscriptionDiscountCodeBenefitPeriods
    const benefitPeriodsUsed = subscription.billingSubscriptionDiscountCodeBenefitPeriodsUsed
    const benefitExhausted = benefitPeriods !== null && benefitPeriodsUsed >= benefitPeriods

    if (benefitExhausted) {
      return undefined
    }

    const kind = subscription.billingSubscriptionDiscountCodeKind
    const value = subscription.billingSubscriptionDiscountCodeValue
    if (kind === null || value === null) {
      return undefined
    }

    return { kind, value: Number(value) }
  }

  /**
   * Construye el bloque de cifras del código a partir de un `ResolvedPrice`
   * (regla 3 y 5). Con código congelado y no agotado, viene de los
   * `undiscounted*` que `resolvePrice` calculó del lado del código. Con
   * código congelado pero agotado (`resolveAppliedCode` devolvió
   * `undefined`), el trato se calculó sin código: `codeDiscountAmount = 0`
   * y `undiscounted_* = contracted_*` (regla 5, no se deja en NULL). Sin
   * código nunca (§13, sin regresión), no se llama a este método.
   */
  private buildDiscountBlock(
    subscription: BillingSubscription,
    resolved: ResolvedPrice
  ): {
    codeDiscountAmount: number
    undiscountedUnitAmount: number | null
    undiscountedSubtotal: number | null
    undiscountedTaxAmount: number | null
    undiscountedTotal: number | null
  } {
    if (subscription.billingSubscriptionDiscountCodeText === null) {
      return {
        codeDiscountAmount: 0,
        undiscountedUnitAmount: null,
        undiscountedSubtotal: null,
        undiscountedTaxAmount: null,
        undiscountedTotal: null,
      }
    }

    if (resolved.codeDiscountAmount !== undefined) {
      return {
        codeDiscountAmount: resolved.codeDiscountAmount,
        undiscountedUnitAmount: resolved.undiscountedPricePerEmployee ?? null,
        undiscountedSubtotal: resolved.undiscountedSubtotal ?? null,
        undiscountedTaxAmount: resolved.undiscountedTaxAmount ?? null,
        undiscountedTotal: resolved.undiscountedTotal ?? null,
      }
    }

    // Beneficio agotado: sin código, undiscounted_* = contracted_* (regla 5).
    return {
      codeDiscountAmount: 0,
      undiscountedUnitAmount: resolved.pricePerEmployee,
      undiscountedSubtotal: resolved.subtotal,
      undiscountedTaxAmount: resolved.taxAmount,
      undiscountedTotal: resolved.total,
    }
  }

  /**
   * Guarda fail-closed de código desfasado (USRH1787714804405 §4.3, regla
   * 10). Compara el texto del código congelado en la fila del cambio contra
   * el de la suscripción bloqueada y, si coincide, el estado de agotamiento
   * al congelar (`codeDiscountAmount > 0` ⇒ se aplicó) contra el actual
   * (`resolveAppliedCode`). Cualquier diferencia es desfase: el cambio no se
   * aplica.
   */
  private detectDiscountCodeDrift(
    change: BillingSubscriptionChange,
    subscription: BillingSubscription
  ): boolean {
    const frozenText = change.billingSubscriptionChangeDiscountCodeText
    const currentText = subscription.billingSubscriptionDiscountCodeText

    if (frozenText !== currentText) {
      return true
    }

    if (frozenText === null) {
      return false
    }

    const frozenApplied = Number(change.billingSubscriptionChangeCodeDiscountAmount) > 0
    const currentApplied = this.resolveAppliedCode(subscription) !== undefined

    return frozenApplied !== currentApplied
  }

  private buildProration(
    currentTotalPesos: number,
    newTotalPesos: number,
    totalDays: number,
    remainingDays: number
  ): SubscriptionChangePreviewProration {
    const differenceCents = Math.round((newTotalPesos - currentTotalPesos) * 100)
    const amountCents = Math.round((differenceCents * remainingDays) / totalDays)

    return {
      differenceCents,
      totalDays,
      remainingDays,
      amountCents,
      amountPesos: amountCents / 100,
    }
  }
}
