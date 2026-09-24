import mail from '@adonisjs/mail/services/main'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingSubscription, { LIVE_SUBSCRIPTION_STATUSES } from '#models/billing_subscription'
import BillingSubscriptionChange, {
  LIVE_SUBSCRIPTION_CHANGE_STATUSES,
  type BillingSubscriptionChangeType,
} from '#models/billing_subscription_change'
import BusinessUnit, { type BusinessUnitOrigin } from '#models/business_unit'
import BillingCatalogService, { type ResolvedPrice } from '#services/billing_catalog_service'
import BillingSubscriptionService from '#services/billing_subscription_service'
import EmployeeQuotaService from '#services/employee_quota_service'
import SubscriptionRenewalRequestMail from '#mails/subscription_renewal_request_mail'
import { INTERNAL_CONTACT_EMAIL } from '#constants/support_contact'
import { resolveMailSender } from '#helpers/resolve_mail_sender'
import { BILLING_SUBSCRIPTION_ERROR_CODES } from '../constants/billing_subscription_error_codes.js'
import { BillingSubscriptionServiceError } from '../exceptions/billing_subscription_service_error.js'
import {
  assertContractedEmployees as assertContractedEmployeesRule,
  employeesAboveSafetyCapError,
  employeesBelowActiveHeadcountError,
  resolveMinimumContractedEmployees as resolveMinimumContractedEmployeesRule,
} from '../helpers/contracted_employees_rules.js'
import {
  originNotSelfServiceError,
  planUnavailableError,
  PUBLIC_CONTRACTED_EMPLOYEES_SAFETY_CAP,
  rethrowCatalogErrorForPublicSurface,
} from '../helpers/billing_tenant_error.js'
import { TenantContext } from '../utils/tenant_context.js'
import {
  daysBetweenBusinessDates,
  todayInBusinessZone,
  toBusinessDateString,
  toCalendarIsoDate,
} from '../utils/business_date.js'

// ---------------------------------------------------------------------------
// Tipos de salida (lista blanca de la superficie pública / tenant)
// ---------------------------------------------------------------------------

export interface PublicPlanCurrentPrice {
  pricePerEmployee: number
  currency: string
  taxRate: number
  trialDays: number
}

export interface PublicPlanVolumeTier {
  minEmployees: number
  discountPercent: number
}

export interface PublicPlanListItem {
  billingPlanId: number
  billingPlanName: string
  billingPlanDescription: string | null
  currentPrice: PublicPlanCurrentPrice
  volumeTiers: PublicPlanVolumeTier[]
}

export interface PublicResolvedPlanPrice {
  billingPlanId: number
  employeeCount: number
  pricePerEmployee: number
  currency: string
  discountPercent: number
  discountAmount: number
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
  trialDays: number
  firstPaymentDate: string
  resolvedAt: string
}

/**
 * Contratacion que el cliente puede renovar: vencida o dada de baja.
 *
 * Va aparte de `subscription` a proposito. `subscription` significa "hay
 * contratacion viva" y con eso decide el muro de acceso del backoffice; una
 * cancelada no es viva y meterla ahi abriria la puerta a una cuenta dada de
 * baja. Este bloque solo alimenta la pantalla de renovacion.
 *
 * El importe es el total contratado del periodo, que es la misma base con la
 * que la plataforma arma su cartera (`CONTRACTED_TOTAL_CENTS_SQL` en
 * `platform_receivable_service`). Se replica esa regla a proposito: si el
 * cliente viera una cifra distinta de la que cobranza le reclama, cada
 * llamada empezaria discutiendo el monto.
 */
export interface TenantRenewalSnapshot {
  /** Estado que dejo la contratacion fuera de servicio. */
  status: 'past_due' | 'canceled'
  planName: string
  contractedEmployees: number
  /** Importe a cubrir para ponerse al corriente, en la moneda contratada. */
  amount: number
  currency: string
  /** Fin del periodo que quedo sin cubrir, fecha calendario ISO. */
  periodEnd: string | null
  /** Dias transcurridos desde que vencio el periodo. */
  daysOverdue: number
  /**
   * Periodos sin cubrir. Hoy siempre es uno: el reloj marca `past_due` al
   * vencer el periodo y no vuelve a tocar la fila (regla R3 de
   * `billing_subscription_clock_service`), asi que el periodo no avanza.
   */
  periodsOverdue: number
}

export interface TenantSubscriptionSnapshot {
  billingSubscriptionId: number
  billingPlanId: number
  billingPlanName: string
  billingSubscriptionStatus: BillingSubscription['billingSubscriptionStatus']
  billingSubscriptionContractedEmployees: number
  billingSubscriptionContractedUnitAmount: number
  billingSubscriptionDiscountPercent: number
  billingSubscriptionContractedCurrency: string
  billingSubscriptionContractedTaxRate: number
  billingSubscriptionContractedSubtotal: number
  billingSubscriptionContractedTaxAmount: number
  billingSubscriptionContractedTotal: number
  billingSubscriptionContractedTrialDays: number
  billingSubscriptionTrialEndsAt: string | null
  firstPaymentDate: string | null
  /** Inicio del periodo vigente, fecha calendario ISO (USRH1786107870865). */
  billingSubscriptionCurrentPeriodStart: string | null
  /** Fin del periodo vigente = fecha del próximo pago, fecha calendario ISO (USRH1786107870865). */
  billingSubscriptionCurrentPeriodEnd: string | null
  /**
   * Cambio de cantidad en curso (`pending_payment` o `scheduled`), o `null`.
   * Forma alineada con la orden 2 (USRH1786107870871).
   */
  liveChange: TenantLiveChangeSnapshot | null
}

/** Importes congelados del periodo al tamaño nuevo (pesos, con Number aplicado). */
export interface TenantLiveChangeAmounts {
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
}

/** Adeudo prorrateado del aumento; solo presentación (centavos + pesos). */
export interface TenantLiveChangeProration {
  amountCents: number
  amountPesos: number
}

export interface TenantLiveChangeSnapshot {
  billingSubscriptionChangeId: number
  type: BillingSubscriptionChangeType
  status: 'pending_payment' | 'scheduled'
  previousEmployees: number
  newEmployees: number
  newAmounts: TenantLiveChangeAmounts
  /** Null en reducción agendada o cuando no hay adeudo. */
  proration: TenantLiveChangeProration | null
  /** Fecha calendario ISO; solo en reducción agendada. */
  effectiveAt: string | null
  requestedAt: string
}

export interface MySubscriptionResult {
  businessUnitOrigin: BusinessUnitOrigin
  subscription: TenantSubscriptionSnapshot | null
  /**
   * Contratacion renovable (vencida o cancelada), o `null` cuando la empresa
   * esta al corriente o nunca contrato.
   */
  renewal: TenantRenewalSnapshot | null
  /**
   * Estado de la cuenta para cualquier usuario de la empresa.
   *
   * Va fuera de `subscription` porque no es dinero ni detalle del contrato:
   * es el aviso de que la cuenta esta vencida, y todo el equipo necesita
   * verlo. El recorte para quien no es dueno lo conserva.
   */
  accountStatus: BillingSubscription['billingSubscriptionStatus'] | null
  /**
   * Mínimo contratable para empresas `self_service` (con o sin suscripción viva).
   * El muro de contratación lo ignora cuando hay suscripción viva; la pantalla de
   * ajuste de cantidad (orden 8) lo consume.
   */
  minimumContractedEmployees: number | null
}

/** Respuesta 201 de `POST /api/billing/subscription` (lista blanca). */
export interface ContractSubscriptionResult {
  billingSubscriptionId: number
  billingPlanId: number
  billingPlanName: string
  billingSubscriptionStatus: BillingSubscription['billingSubscriptionStatus']
  billingSubscriptionContractedEmployees: number
  billingSubscriptionContractedUnitAmount: number
  billingSubscriptionDiscountPercent: number
  billingSubscriptionContractedCurrency: string
  billingSubscriptionContractedTaxRate: number
  billingSubscriptionContractedSubtotal: number
  billingSubscriptionContractedTaxAmount: number
  billingSubscriptionContractedTotal: number
  billingSubscriptionContractedTrialDays: number
  billingSubscriptionTrialEndsAt: string | null
  firstPaymentDate: string
}

/**
 * Superficie de lectura de billing orientada al visitante anónimo y al tenant
 * autenticado (USRH1785441817226). Reutiliza el cálculo del catálogo landlord
 * sin reimplementar la fórmula de precio.
 */
export default class BillingTenantService {
  private readonly catalog = new BillingCatalogService()
  private readonly subscriptionService = new BillingSubscriptionService()
  private readonly employeeQuotaService = new EmployeeQuotaService()

  /**
   * Mínimo contratable: el siguiente bloque de 10 por encima de la plantilla activa.
   * Con 0 activos devuelve el mínimo general de la superficie self-service (10).
   */
  resolveMinimumContractedEmployees(activeEmployees: number): number {
    return resolveMinimumContractedEmployeesRule(activeEmployees)
  }

  /**
   * Re-contratación self-service desde el tenant autenticado (USRH1785441822058).
   * Solo empresas de origen `self_service` sin suscripción viva; nace sin periodo de prueba.
   */
  async contractSubscription(
    billingPlanId: number,
    contractedEmployees: number
  ): Promise<ContractSubscriptionResult> {
    const businessUnitId = TenantContext.getScope()[0]

    if (!businessUnitId || businessUnitId <= 0) {
      throw new BillingSubscriptionServiceError(
        'No se pudo resolver la empresa activa del tenant',
        BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
        500,
        'empresa-no-resuelta',
        'No se pudo determinar la empresa activa para contratar.'
      )
    }

    const businessUnit = await BusinessUnit.query()
      .where('business_unit_id', businessUnitId)
      .whereNull('business_unit_deleted_at')
      .first()

    if (!businessUnit) {
      throw new BillingSubscriptionServiceError(
        `Empresa ${businessUnitId} no encontrada`,
        BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
        404,
        'empresa-no-encontrada',
        'La empresa solicitada no existe.'
      )
    }

    if (businessUnit.businessUnitOrigin !== 'self_service') {
      throw originNotSelfServiceError()
    }

    this.assertContractedEmployees(contractedEmployees)

    const activeEmployees = await this.employeeQuotaService.countActiveEmployees(
      businessUnitId
    )
    const minimum = this.resolveMinimumContractedEmployees(activeEmployees)

    if (minimum > PUBLIC_CONTRACTED_EMPLOYEES_SAFETY_CAP) {
      throw employeesAboveSafetyCapError()
    }

    if (contractedEmployees < minimum) {
      throw employeesBelowActiveHeadcountError(activeEmployees, minimum)
    }

    const subscription = await this.subscriptionService.createSubscription({
      businessUnitPublicId: businessUnit.businessUnitPublicId,
      billingPlanId,
      contractedEmployees,
      skipTrial: true,
    })

    await subscription.load('plan')

    return this.toContractSubscriptionResult(subscription)
  }

  /**
   * Regla 3 — cantidad contratada en bloques de 10 (mínimo 10) con tope defensivo.
   * Método compartido con signup/start y complete() (hermana B).
   */
  assertContractedEmployees(employeeCount: number): void {
    assertContractedEmployeesRule(employeeCount)
  }

  /**
   * Plan vendible para `POST /api/auth/signup/start` (respuesta opaca 404).
   */
  async assertPublicSellablePlan(planId: number, referenceDate?: string): Promise<void> {
    const refDate = referenceDate ?? toBusinessDateString()
    const sellable = await this.findSellablePlan(planId, refDate)
    if (!sellable) {
      throw planUnavailableError()
    }
  }

  /**
   * Plan listo para contratar al cerrar el registro (errores explícitos 404/422).
   */
  async assertPlanReadyToSubscribe(planId: number, referenceDate?: string): Promise<void> {
    const refDate = referenceDate ?? toBusinessDateString()
    const plan = await BillingPlan.query().where('billing_plan_id', planId).first()

    if (!plan) {
      throw new BillingSubscriptionServiceError(
        `Plan ${planId} no encontrado`,
        BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_FOUND,
        404,
        'plan-no-encontrado',
        'El plan solicitado no existe.'
      )
    }

    if (!plan.isPublished || !plan.billingPlanActive) {
      throw new BillingSubscriptionServiceError(
        `Plan ${planId} no está publicado`,
        BILLING_SUBSCRIPTION_ERROR_CODES.PLAN_NOT_PUBLISHED,
        422,
        'plan-no-publicado',
        'Solo se puede contratar sobre un plan publicado del catálogo.'
      )
    }

    if (!this.pickCurrentPrice(await this.loadPlanPrices(planId), refDate)) {
      throw new BillingSubscriptionServiceError(
        `Plan ${planId} no tiene precio vigente para ${refDate}`,
        BILLING_SUBSCRIPTION_ERROR_CODES.NO_ACTIVE_PRICE,
        422,
        'sin-precio-vigente',
        'El plan no tiene un precio vigente en el catálogo para la fecha de hoy.'
      )
    }
  }

  /**
   * Plan público de la landing (USRH1787619255299).
   *
   * Devuelve el plan marcado como público **solo si sigue siendo vendible hoy**
   * (publicado, activo, no eliminado y con precio vigente). La marca por sí
   * sola no garantiza vendibilidad — `deletePlan` no la quita, por lo que la
   * revalidación se hace en cada lectura.
   *
   * Devuelve `null` cuando no hay plan marcado **o** el marcado ya no es
   * vendible; ambos casos son indistinguibles a propósito (regla 4 de la HU).
   * Nunca devuelve un arreglo.
   */
  async getPublicPlan(referenceDate?: string): Promise<PublicPlanListItem | null> {
    const refDate = referenceDate ?? toBusinessDateString()

    const plan = await BillingPlan.query()
      .where('billing_plan_is_public', 1)
      .whereNotNull('billing_plan_published_at')
      .where('billing_plan_active', 1)
      .whereNull('billing_plan_deleted_at')
      .preload('prices', (query) => {
        query.orderBy('billing_plan_price_effective_from', 'asc')
      })
      .preload('volumeTiers', (query) => {
        query
          .whereNull('billing_volume_tier_deleted_at')
          .orderBy('billing_volume_tier_min_employees', 'asc')
      })
      .first()

    if (!plan) {
      return null
    }

    const currentPrice = this.pickCurrentPrice(plan.prices, refDate)
    if (!currentPrice) {
      return null
    }

    return this.toPublicPlanListItem(plan, currentPrice)
  }

  /** Catálogo público: solo planes vendibles con precio vigente (regla 1). */
  async listPublicPlans(referenceDate?: string): Promise<PublicPlanListItem[]> {
    const refDate = referenceDate ?? toBusinessDateString()
    const plans = await BillingPlan.query()
      .whereNotNull('billing_plan_published_at')
      .where('billing_plan_active', 1)
      .whereNull('billing_plan_deleted_at')
      .preload('prices', (query) => {
        query.orderBy('billing_plan_price_effective_from', 'asc')
      })
      .preload('volumeTiers', (query) => {
        query
          .whereNull('billing_volume_tier_deleted_at')
          .orderBy('billing_volume_tier_min_employees', 'asc')
      })
      .orderBy('billing_plan_id', 'asc')

    const items: PublicPlanListItem[] = []

    for (const plan of plans) {
      const currentPrice = this.pickCurrentPrice(plan.prices, refDate)
      if (!currentPrice) {
        continue
      }

      items.push(this.toPublicPlanListItem(plan, currentPrice))
    }

    return items
  }

  /**
   * Precio resuelto para visitantes anónimos. Valida bloques de 10, verifica
   * que el plan sea vendible y delega el cálculo a `resolvePrice`.
   */
  async resolvePublicPlanPrice(
    planId: number,
    employeeCount: number,
    referenceDate?: string
  ): Promise<PublicResolvedPlanPrice> {
    this.assertContractedEmployees(employeeCount)

    const refDate = referenceDate ?? toBusinessDateString()
    const sellable = await this.findSellablePlan(planId, refDate)
    if (!sellable) {
      throw planUnavailableError()
    }

    let resolved: ResolvedPrice
    try {
      resolved = await this.catalog.resolvePrice(planId, employeeCount, refDate)
    } catch (error) {
      rethrowCatalogErrorForPublicSurface(error)
    }

    const firstPaymentDate = toBusinessDateString(
      todayInBusinessZone().plus({ days: resolved.trialDays })
    )

    return {
      billingPlanId: resolved.billingPlanId,
      employeeCount: resolved.employeeCount,
      pricePerEmployee: resolved.pricePerEmployee,
      currency: resolved.currency,
      discountPercent: resolved.discountPercent,
      discountAmount: resolved.discountAmount,
      subtotal: resolved.subtotal,
      taxRate: resolved.taxRate,
      taxAmount: resolved.taxAmount,
      total: resolved.total,
      trialDays: resolved.trialDays,
      firstPaymentDate,
      resolvedAt: resolved.resolvedAt,
    }
  }

  /**
   * Contratación viva del tenant activo + origen de la empresa (regla 9).
   * Siempre responde datos; `subscription` puede ser null.
   */
  async getMySubscription(): Promise<MySubscriptionResult> {
    const businessUnitId = TenantContext.getScope()[0]

    if (!businessUnitId || businessUnitId <= 0) {
      throw new BillingSubscriptionServiceError(
        'No se pudo resolver la empresa activa del tenant',
        BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
        500,
        'empresa-no-resuelta',
        'No se pudo determinar la empresa activa para consultar la suscripción.'
      )
    }

    const businessUnit = await BusinessUnit.query()
      .where('business_unit_id', businessUnitId)
      .whereNull('business_unit_deleted_at')
      .first()

    if (!businessUnit) {
      throw new BillingSubscriptionServiceError(
        `Empresa ${businessUnitId} no encontrada`,
        BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
        404,
        'empresa-no-encontrada',
        'La empresa solicitada no existe.'
      )
    }

    const subscription = await BillingSubscription.query()
      .where('business_unit_id', businessUnitId)
      .whereIn('billing_subscription_status', LIVE_SUBSCRIPTION_STATUSES)
      .whereNull('billing_subscription_deleted_at')
      .preload('plan')
      .orderBy('billing_subscription_id', 'desc')
      .first()

    let minimumContractedEmployees: number | null = null

    if (businessUnit.businessUnitOrigin === 'self_service') {
      const activeEmployees = await this.employeeQuotaService.countActiveEmployees(
        businessUnitId
      )
      minimumContractedEmployees = this.resolveMinimumContractedEmployees(activeEmployees)
    }

    const renewal = await this.findRenewableSubscription(businessUnitId)

    return {
      businessUnitOrigin: businessUnit.businessUnitOrigin,
      subscription: subscription
        ? await this.toTenantSubscriptionSnapshot(subscription, businessUnitId)
        : null,
      renewal,
      accountStatus:
        subscription?.billingSubscriptionStatus ?? renewal?.status ?? null,
      minimumContractedEmployees,
    }
  }

  private async findSellablePlan(planId: number, referenceDate: string): Promise<BillingPlan | null> {
    const plan = await BillingPlan.query()
      .where('billing_plan_id', planId)
      .whereNotNull('billing_plan_published_at')
      .where('billing_plan_active', 1)
      .whereNull('billing_plan_deleted_at')
      .preload('prices', (query) => {
        query.orderBy('billing_plan_price_effective_from', 'asc')
      })
      .preload('volumeTiers', (query) => {
        query
          .whereNull('billing_volume_tier_deleted_at')
          .orderBy('billing_volume_tier_min_employees', 'asc')
      })
      .first()
    if (!plan) {
      return null
    }

    if (!this.pickCurrentPrice(plan.prices, referenceDate)) {
      return null
    }

    return plan
  }

  private async loadPlanPrices(planId: number): Promise<BillingPlanPrice[]> {
    return BillingPlanPrice.query()
      .where('billing_plan_id', planId)
      .orderBy('billing_plan_price_effective_from', 'asc')
  }

  private pickCurrentPrice(
    prices: BillingPlanPrice[],
    referenceDate: string
  ): BillingPlanPrice | null {
    let current: BillingPlanPrice | null = null

    for (const price of prices) {
      const effectiveFrom = toCalendarIsoDate(price.billingPlanPriceEffectiveFrom)
      if (effectiveFrom && effectiveFrom <= referenceDate) {
        current = price
      }
    }

    return current
  }

  private toPublicPlanListItem(
    plan: BillingPlan,
    currentPrice: BillingPlanPrice
  ): PublicPlanListItem {
    return {
      billingPlanId: plan.billingPlanId,
      billingPlanName: plan.billingPlanName,
      billingPlanDescription: plan.billingPlanDescription,
      currentPrice: {
        pricePerEmployee: Number(currentPrice.billingPlanPriceAmount),
        currency: currentPrice.billingPlanPriceCurrency,
        taxRate: Number(currentPrice.billingPlanPriceTaxRate),
        trialDays: currentPrice.billingPlanPriceTrialDays,
      },
      volumeTiers: plan.volumeTiers.map((tier) => ({
        minEmployees: tier.billingVolumeTierMinEmployees,
        discountPercent: tier.billingVolumeTierDiscountPercent,
      })),
    }
  }

  private async findLiveSubscriptionChange(
    businessUnitId: number,
    billingSubscriptionId: number
  ): Promise<BillingSubscriptionChange | null> {
    return BillingSubscriptionChange.query()
      .where('business_unit_id', businessUnitId)
      .where('billing_subscription_id', billingSubscriptionId)
      .whereIn('billing_subscription_change_status', LIVE_SUBSCRIPTION_CHANGE_STATUSES)
      .whereNull('billing_subscription_change_deleted_at')
      .orderBy('billing_subscription_change_id', 'asc')
      .first()
  }

  private toLiveChangeSnapshot(
    change: BillingSubscriptionChange
  ): TenantLiveChangeSnapshot | null {
    if (!LIVE_SUBSCRIPTION_CHANGE_STATUSES.includes(change.billingSubscriptionChangeStatus)) {
      return null
    }

    const amountCents = change.billingSubscriptionChangeProratedAmountCents
    const proration =
      change.billingSubscriptionChangeType === 'increase' && amountCents > 0
        ? {
            amountCents,
            amountPesos: amountCents / 100,
          }
        : null

    return {
      billingSubscriptionChangeId: change.billingSubscriptionChangeId,
      type: change.billingSubscriptionChangeType,
      status: change.billingSubscriptionChangeStatus as 'pending_payment' | 'scheduled',
      previousEmployees: change.billingSubscriptionChangePreviousEmployees,
      newEmployees: change.billingSubscriptionChangeNewEmployees,
      newAmounts: {
        subtotal: Number(change.billingSubscriptionChangeSubtotal),
        taxRate: Number(change.billingSubscriptionChangeTaxRate),
        taxAmount: Number(change.billingSubscriptionChangeTaxAmount),
        total: Number(change.billingSubscriptionChangeTotal),
      },
      proration,
      effectiveAt:
        change.billingSubscriptionChangeType === 'decrease'
          ? toCalendarIsoDate(change.billingSubscriptionChangeEffectiveAt)
          : null,
      requestedAt: change.billingSubscriptionChangeCreatedAt.toISO() ?? '',
    }
  }

  private async toTenantSubscriptionSnapshot(
    subscription: BillingSubscription,
    businessUnitId: number
  ): Promise<TenantSubscriptionSnapshot> {
    const trialEndsAtIso = toCalendarIsoDate(subscription.billingSubscriptionTrialEndsAt)
    const liveChangeRow = await this.findLiveSubscriptionChange(
      businessUnitId,
      subscription.billingSubscriptionId
    )

    return {
      billingSubscriptionId: subscription.billingSubscriptionId,
      billingPlanId: subscription.billingPlanId,
      billingPlanName: subscription.plan?.billingPlanName ?? '',
      billingSubscriptionStatus: subscription.billingSubscriptionStatus,
      billingSubscriptionContractedEmployees: subscription.billingSubscriptionContractedEmployees,
      billingSubscriptionContractedUnitAmount: Number(
        subscription.billingSubscriptionContractedUnitAmount
      ),
      billingSubscriptionDiscountPercent: subscription.billingSubscriptionDiscountPercent,
      billingSubscriptionContractedCurrency: subscription.billingSubscriptionContractedCurrency,
      billingSubscriptionContractedTaxRate: Number(subscription.billingSubscriptionContractedTaxRate),
      billingSubscriptionContractedSubtotal: Number(
        subscription.billingSubscriptionContractedSubtotal
      ),
      billingSubscriptionContractedTaxAmount: Number(
        subscription.billingSubscriptionContractedTaxAmount
      ),
      billingSubscriptionContractedTotal: Number(subscription.billingSubscriptionContractedTotal),
      billingSubscriptionContractedTrialDays: subscription.billingSubscriptionContractedTrialDays,
      billingSubscriptionTrialEndsAt: trialEndsAtIso,
      firstPaymentDate: trialEndsAtIso,
      billingSubscriptionCurrentPeriodStart: toCalendarIsoDate(
        subscription.billingSubscriptionCurrentPeriodStart
      ),
      billingSubscriptionCurrentPeriodEnd: toCalendarIsoDate(
        subscription.billingSubscriptionCurrentPeriodEnd
      ),
      liveChange: liveChangeRow ? this.toLiveChangeSnapshot(liveChangeRow) : null,
    }
  }

  /**
   * Busca la contratacion que el cliente puede renovar.
   *
   * Mira vencidas y canceladas, que son los dos finales de una contratacion:
   * la consulta de suscripcion viva deja fuera a `canceled`, asi que sin esta
   * segunda lectura una cuenta dada de baja llegaria al backoffice igual que
   * una empresa que nunca contrato.
   *
   * @param businessUnitId - Empresa activa del tenant.
   * @returns Contratacion renovable, o `null` si no hay ninguna.
   */
  /**
   * Avisa al equipo de que un cliente quiere renovar su contratacion.
   *
   * No hay pasarela de cobro ni registro de la solicitud: el pago se acuerda
   * fuera de la plataforma, asi que el correo es el disparo que el equipo
   * recibe para responder con la referencia. Si no hay contratacion renovable
   * no se manda nada, para que el buzon no reciba avisos de cuentas al
   * corriente.
   *
   * @param params - Quien pide la renovacion.
   * @param params.requesterName - Nombre de quien apreto el boton.
   * @param params.requesterEmail - Correo al que el equipo puede responder.
   * @returns La contratacion por la que se aviso.
   * @throws Si la empresa no tiene contratacion vencida ni cancelada.
   */
  async requestRenewal(params: {
    requesterName: string
    requesterEmail: string
  }): Promise<TenantRenewalSnapshot> {
    const businessUnitId = TenantContext.getScope()[0]

    if (!businessUnitId || businessUnitId <= 0) {
      throw new BillingSubscriptionServiceError(
        'No se pudo resolver la empresa activa del tenant',
        BILLING_SUBSCRIPTION_ERROR_CODES.BUSINESS_UNIT_NOT_FOUND,
        500,
        'empresa-no-resuelta',
        'No se pudo determinar la empresa activa para solicitar la renovación.'
      )
    }

    const businessUnit = await BusinessUnit.query()
      .where('business_unit_id', businessUnitId)
      .whereNull('business_unit_deleted_at')
      .first()

    const renewal = await this.findRenewableSubscription(businessUnitId)

    if (!businessUnit || !renewal) {
      throw new BillingSubscriptionServiceError(
        `La empresa ${businessUnitId} no tiene contratación que renovar`,
        BILLING_SUBSCRIPTION_ERROR_CODES.NO_LIVE_SUBSCRIPTION,
        422,
        'sin-contratacion-que-renovar',
        'Esta empresa no tiene una contratación vencida por renovar.'
      )
    }

    const amount = new Intl.NumberFormat('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(renewal.amount)

    await mail.send(
      new SubscriptionRenewalRequestMail({
        to: INTERNAL_CONTACT_EMAIL,
        from: resolveMailSender(),
        language: 'es',
        branding: {
          tradeName: 'Valanserh',
          backgroundImageLogo:
            'https://gsti-assets.sfo3.cdn.digitaloceanspaces.com/valanserh/logos/logotipo-min.png',
        },
        companyName: businessUnit.businessUnitName,
        planName: renewal.planName,
        status: renewal.status,
        amount,
        currency: renewal.currency,
        periodsOverdue: renewal.periodsOverdue,
        contractedEmployees: renewal.contractedEmployees,
        requesterName: params.requesterName,
        requesterEmail: params.requesterEmail,
      })
    )

    return renewal
  }

  private async findRenewableSubscription(
    businessUnitId: number
  ): Promise<TenantRenewalSnapshot | null> {
    const subscription = await BillingSubscription.query()
      .where('business_unit_id', businessUnitId)
      .whereIn('billing_subscription_status', ['past_due', 'canceled'])
      .whereNull('billing_subscription_deleted_at')
      .preload('plan')
      .orderBy('billing_subscription_id', 'desc')
      .first()

    if (!subscription) {
      return null
    }

    const periodEnd = toCalendarIsoDate(subscription.billingSubscriptionCurrentPeriodEnd)
    const businessDate = toBusinessDateString()
    const daysOverdue = periodEnd
      ? Math.max(0, daysBetweenBusinessDates(periodEnd, businessDate))
      : 0

    return {
      status: subscription.billingSubscriptionStatus as 'past_due' | 'canceled',
      planName: subscription.plan?.billingPlanName ?? '',
      contractedEmployees: subscription.billingSubscriptionContractedEmployees,
      amount: Number(subscription.billingSubscriptionContractedTotal),
      currency: subscription.billingSubscriptionContractedCurrency,
      periodEnd,
      daysOverdue,
      periodsOverdue: 1,
    }
  }

  private toContractSubscriptionResult(
    subscription: BillingSubscription
  ): ContractSubscriptionResult {
    const trialEndsAtIso = toCalendarIsoDate(subscription.billingSubscriptionTrialEndsAt)
    const firstPaymentDate = toBusinessDateString()

    return {
      billingSubscriptionId: subscription.billingSubscriptionId,
      billingPlanId: subscription.billingPlanId,
      billingPlanName: subscription.plan?.billingPlanName ?? '',
      billingSubscriptionStatus: subscription.billingSubscriptionStatus,
      billingSubscriptionContractedEmployees: subscription.billingSubscriptionContractedEmployees,
      billingSubscriptionContractedUnitAmount: Number(
        subscription.billingSubscriptionContractedUnitAmount
      ),
      billingSubscriptionDiscountPercent: subscription.billingSubscriptionDiscountPercent,
      billingSubscriptionContractedCurrency: subscription.billingSubscriptionContractedCurrency,
      billingSubscriptionContractedTaxRate: Number(subscription.billingSubscriptionContractedTaxRate),
      billingSubscriptionContractedSubtotal: Number(
        subscription.billingSubscriptionContractedSubtotal
      ),
      billingSubscriptionContractedTaxAmount: Number(
        subscription.billingSubscriptionContractedTaxAmount
      ),
      billingSubscriptionContractedTotal: Number(subscription.billingSubscriptionContractedTotal),
      billingSubscriptionContractedTrialDays: subscription.billingSubscriptionContractedTrialDays,
      billingSubscriptionTrialEndsAt: trialEndsAtIso,
      firstPaymentDate,
    }
  }
}
