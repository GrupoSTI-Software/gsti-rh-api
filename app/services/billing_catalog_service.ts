import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import { BILLING_CATALOG_ERROR_CODES } from '../constants/billing_catalog_error_codes.js'
import { BillingCatalogServiceError } from '../exceptions/billing_catalog_service_error.js'
import { toBusinessDateString } from '../utils/business_date.js'

// ---------------------------------------------------------------------------
// Tipos de entrada
// ---------------------------------------------------------------------------

export interface CreatePlanInput {
  billingPlanName: string
  billingPlanDescription?: string | null
  billingPlanProvider?: string
  billingPlanStripeProductId?: string | null
}

export interface UpdatePlanInput {
  billingPlanName?: string
  billingPlanDescription?: string | null
  billingPlanStripeProductId?: string | null
  billingPlanActive?: number
}

export interface CreatePriceInput {
  billingPlanPriceAmount: number
  billingPlanPriceCurrency?: string
  billingPlanPriceTaxRate?: number
  billingPlanPriceTrialDays?: number
  billingPlanPriceEffectiveFrom: string
  billingPlanPriceStripePriceId?: string | null
  billingPlanPriceProvider?: string
}

export interface CreateTierInput {
  billingVolumeTierMinEmployees: number
  billingVolumeTierDiscountPercent: number
}

export interface UpdateTierInput {
  billingVolumeTierDiscountPercent?: number
}

// ---------------------------------------------------------------------------
// Tipos de salida
// ---------------------------------------------------------------------------

export interface ResolvedPrice {
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
  effectiveFrom: string
  resolvedAt: string
}

// ---------------------------------------------------------------------------
// Servicio
// ---------------------------------------------------------------------------

/**
 * Lógica de negocio del catálogo de cobro de la plataforma Valanserh.
 *
 * Invariantes garantizados por el servicio:
 *  - Los precios son append-only (ningún UPDATE ni DELETE sobre `billing_plan_prices`).
 *  - Los tramos solo son mutables mientras el plan es borrador.
 *  - La publicación de un plan es irreversible.
 *  - El precio resuelto es determinista dado `(planId, employeeCount, referenceDate)`.
 */
export default class BillingCatalogService {
  // ─── Planes ──────────────────────────────────────────────────────────────

  async listPlans(): Promise<BillingPlan[]> {
    return BillingPlan.query().orderBy('billing_plan_id', 'asc')
  }

  async getPlan(planId: number): Promise<BillingPlan> {
    const plan = await BillingPlan.query()
      .where('billing_plan_id', planId)
      .preload('prices', (q) => q.orderBy('billing_plan_price_effective_from', 'asc'))
      .preload('volumeTiers', (q) => q.orderBy('billing_volume_tier_min_employees', 'asc'))
      .first()

    if (!plan) {
      throw new BillingCatalogServiceError(
        `Plan ${planId} no encontrado`,
        BILLING_CATALOG_ERROR_CODES.PLAN_NOT_FOUND,
        404,
        'PLT.CAT.PLAN_NOT_FOUND',
        'El plan solicitado no existe o fue eliminado.'
      )
    }

    return plan
  }

  async createPlan(input: CreatePlanInput): Promise<BillingPlan> {
    return BillingPlan.create({
      billingPlanName: input.billingPlanName,
      billingPlanDescription: input.billingPlanDescription ?? null,
      billingPlanProvider: input.billingPlanProvider ?? 'manual',
      billingPlanStripeProductId: input.billingPlanStripeProductId ?? null,
      billingPlanActive: 1,
      billingPlanPublishedAt: null,
    })
  }

  async updatePlan(planId: number, input: UpdatePlanInput): Promise<BillingPlan> {
    const plan = await this.getPlan(planId)

    if (input.billingPlanName !== undefined) plan.billingPlanName = input.billingPlanName
    if (input.billingPlanDescription !== undefined)
      plan.billingPlanDescription = input.billingPlanDescription
    if (input.billingPlanStripeProductId !== undefined)
      plan.billingPlanStripeProductId = input.billingPlanStripeProductId
    if (input.billingPlanActive !== undefined) plan.billingPlanActive = input.billingPlanActive

    await plan.save()
    return plan
  }

  async deletePlan(planId: number): Promise<void> {
    const plan = await this.getPlan(planId)
    await (plan as unknown as { delete(): Promise<void> }).delete()
  }

  /**
   * Publica el plan (borrador → publicado). Irreversible.
   *
   * Requisitos para publicar:
   *  - Al menos un precio con effective_from ≤ hoy.
   *  - Al menos un tramo activo.
   */
  async publishPlan(planId: number): Promise<BillingPlan> {
    const plan = await this.getPlan(planId)

    if (plan.isPublished) {
      throw new BillingCatalogServiceError(
        `Plan ${planId} ya está publicado`,
        BILLING_CATALOG_ERROR_CODES.PLAN_ALREADY_PUBLISHED,
        409,
        'PLT.CAT.PLAN_ALREADY_PUBLISHED',
        'No se puede publicar un plan que ya está publicado.'
      )
    }

    const today = toBusinessDateString()
    const currentPrice = await BillingPlanPrice.query()
      .where('billing_plan_id', planId)
      .where('billing_plan_price_effective_from', '<=', today)
      .orderBy('billing_plan_price_effective_from', 'desc')
      .first()

    if (!currentPrice) {
      throw new BillingCatalogServiceError(
        `Plan ${planId} no tiene precio vigente para publicar`,
        BILLING_CATALOG_ERROR_CODES.PLAN_PUBLISH_REQUIREMENTS,
        422,
        'PLT.CAT.PLAN_PUBLISH_REQUIREMENTS',
        'El plan debe tener al menos un precio con vigencia igual o anterior a hoy.'
      )
    }

    const activeTiers = await BillingVolumeTier.query()
      .where('billing_plan_id', planId)

    if (activeTiers.length === 0) {
      throw new BillingCatalogServiceError(
        `Plan ${planId} no tiene tramos para publicar`,
        BILLING_CATALOG_ERROR_CODES.PLAN_PUBLISH_REQUIREMENTS,
        422,
        'PLT.CAT.PLAN_PUBLISH_REQUIREMENTS',
        'El plan debe tener al menos un tramo de descuento configurado.'
      )
    }

    plan.billingPlanPublishedAt = DateTime.utc()
    await plan.save()
    return plan
  }

  /**
   * Clona un plan publicado como nuevo borrador.
   * Copia nombre, descripción, precios y tramos.
   */
  async clonePlan(planId: number): Promise<BillingPlan> {
    const source = await this.getPlan(planId)

    const newPlan = await db.transaction(async (trx) => {
      const cloned = await BillingPlan.create(
        {
          billingPlanName: `${source.billingPlanName} (copia)`,
          billingPlanDescription: source.billingPlanDescription,
          billingPlanProvider: source.billingPlanProvider,
          billingPlanStripeProductId: null,
          billingPlanActive: 1,
          billingPlanPublishedAt: null,
        },
        { client: trx }
      )

      const sourcePrices = await BillingPlanPrice.query({ client: trx })
        .where('billing_plan_id', planId)
        .orderBy('billing_plan_price_effective_from', 'asc')

      for (const p of sourcePrices) {
        await BillingPlanPrice.create(
          {
            billingPlanId: cloned.billingPlanId,
            billingPlanPriceAmount: p.billingPlanPriceAmount,
            billingPlanPriceCurrency: p.billingPlanPriceCurrency,
            billingPlanPriceTaxRate: p.billingPlanPriceTaxRate,
            billingPlanPriceTrialDays: p.billingPlanPriceTrialDays,
            billingPlanPriceEffectiveFrom: p.billingPlanPriceEffectiveFrom,
            billingPlanPriceStripePriceId: null,
            billingPlanPriceProvider: 'manual',
          },
          { client: trx }
        )
      }

      const sourceTiers = await BillingVolumeTier.query({ client: trx })
        .where('billing_plan_id', planId)

      for (const t of sourceTiers) {
        await BillingVolumeTier.create(
          {
            billingPlanId: cloned.billingPlanId,
            billingVolumeTierMinEmployees: t.billingVolumeTierMinEmployees,
            billingVolumeTierDiscountPercent: t.billingVolumeTierDiscountPercent,
          },
          { client: trx }
        )
      }

      return cloned
    })

    return newPlan
  }

  // ─── Precios (append-only) ────────────────────────────────────────────────

  async listPrices(planId: number): Promise<BillingPlanPrice[]> {
    await this.getPlan(planId)
    return BillingPlanPrice.query()
      .where('billing_plan_id', planId)
      .orderBy('billing_plan_price_effective_from', 'asc')
  }

  /**
   * Agrega una nueva versión de precio al plan (append-only).
   * Solo inserta — nunca actualiza ni elimina filas existentes.
   */
  async addPrice(planId: number, input: CreatePriceInput): Promise<BillingPlanPrice> {
    await this.getPlan(planId)

    const duplicate = await BillingPlanPrice.query()
      .where('billing_plan_id', planId)
      .where('billing_plan_price_effective_from', input.billingPlanPriceEffectiveFrom)
      .first()

    if (duplicate) {
      throw new BillingCatalogServiceError(
        `Ya existe un precio con effective_from ${input.billingPlanPriceEffectiveFrom}`,
        BILLING_CATALOG_ERROR_CODES.PRICE_EFFECTIVE_FROM_DUPLICATE,
        409,
        'PLT.CAT.PRICE_EFFECTIVE_FROM_DUPLICATE',
        'Ya existe una versión de precio con la misma fecha de vigencia.'
      )
    }

    return BillingPlanPrice.create({
      billingPlanId: planId,
      billingPlanPriceAmount: input.billingPlanPriceAmount,
      billingPlanPriceCurrency: input.billingPlanPriceCurrency ?? 'MXN',
      billingPlanPriceTaxRate: input.billingPlanPriceTaxRate ?? 0.16,
      billingPlanPriceTrialDays: input.billingPlanPriceTrialDays ?? 7,
      billingPlanPriceEffectiveFrom: input.billingPlanPriceEffectiveFrom,
      billingPlanPriceStripePriceId: input.billingPlanPriceStripePriceId ?? null,
      billingPlanPriceProvider: input.billingPlanPriceProvider ?? 'manual',
    })
  }

  // ─── Tramos de descuento ─────────────────────────────────────────────────

  async listTiers(planId: number): Promise<BillingVolumeTier[]> {
    await this.getPlan(planId)
    return BillingVolumeTier.query()
      .where('billing_plan_id', planId)
      .orderBy('billing_volume_tier_min_employees', 'asc')
  }

  async addTier(planId: number, input: CreateTierInput): Promise<BillingVolumeTier> {
    const plan = await this.getPlan(planId)

    if (plan.isPublished) {
      throw new BillingCatalogServiceError(
        `No se pueden agregar tramos a un plan publicado (plan ${planId})`,
        BILLING_CATALOG_ERROR_CODES.TIER_PLAN_PUBLISHED,
        422,
        'PLT.CAT.TIER_PLAN_PUBLISHED',
        'Los tramos de un plan publicado son inmutables. Clona el plan para modificarlos.'
      )
    }

    if (
      input.billingVolumeTierMinEmployees < 1 ||
      input.billingVolumeTierDiscountPercent < 0 ||
      input.billingVolumeTierDiscountPercent > 100
    ) {
      throw new BillingCatalogServiceError(
        'Tramo inválido: min_employees ≥ 1, discount_percent ∈ [0, 100]',
        BILLING_CATALOG_ERROR_CODES.TIER_INVALID,
        422,
        'PLT.CAT.TIER_INVALID',
        'El mínimo de empleados debe ser ≥ 1 y el descuento entre 0 y 100.'
      )
    }

    const duplicate = await BillingVolumeTier.query()
      .where('billing_plan_id', planId)
      .where('billing_volume_tier_min_employees', input.billingVolumeTierMinEmployees)
      .first()

    if (duplicate) {
      throw new BillingCatalogServiceError(
        `Ya existe un tramo con min_employees ${input.billingVolumeTierMinEmployees}`,
        BILLING_CATALOG_ERROR_CODES.TIER_DUPLICATE,
        409,
        'PLT.CAT.TIER_DUPLICATE',
        'Ya existe un tramo con el mismo mínimo de empleados en este plan.'
      )
    }

    return BillingVolumeTier.create({
      billingPlanId: planId,
      billingVolumeTierMinEmployees: input.billingVolumeTierMinEmployees,
      billingVolumeTierDiscountPercent: input.billingVolumeTierDiscountPercent,
    })
  }

  async updateTier(
    planId: number,
    tierId: number,
    input: UpdateTierInput
  ): Promise<BillingVolumeTier> {
    const plan = await this.getPlan(planId)

    if (plan.isPublished) {
      throw new BillingCatalogServiceError(
        `No se pueden editar tramos de un plan publicado (plan ${planId})`,
        BILLING_CATALOG_ERROR_CODES.TIER_PLAN_PUBLISHED,
        422,
        'PLT.CAT.TIER_PLAN_PUBLISHED',
        'Los tramos de un plan publicado son inmutables. Clona el plan para modificarlos.'
      )
    }

    const tier = await BillingVolumeTier.query()
      .where('billing_volume_tier_id', tierId)
      .where('billing_plan_id', planId)
      .first()

    if (!tier) {
      throw new BillingCatalogServiceError(
        `Tramo ${tierId} no encontrado en plan ${planId}`,
        BILLING_CATALOG_ERROR_CODES.PLAN_NOT_FOUND,
        404,
        'PLT.CAT.TIER_NOT_FOUND',
        'El tramo solicitado no existe o fue eliminado.'
      )
    }

    if (
      input.billingVolumeTierDiscountPercent !== undefined &&
      (input.billingVolumeTierDiscountPercent < 0 || input.billingVolumeTierDiscountPercent > 100)
    ) {
      throw new BillingCatalogServiceError(
        'Descuento inválido: debe estar en [0, 100]',
        BILLING_CATALOG_ERROR_CODES.TIER_INVALID,
        422,
        'PLT.CAT.TIER_INVALID',
        'El porcentaje de descuento debe estar entre 0 y 100.'
      )
    }

    if (input.billingVolumeTierDiscountPercent !== undefined) {
      tier.billingVolumeTierDiscountPercent = input.billingVolumeTierDiscountPercent
    }

    await tier.save()
    return tier
  }

  async deleteTier(planId: number, tierId: number): Promise<void> {
    const plan = await this.getPlan(planId)

    if (plan.isPublished) {
      throw new BillingCatalogServiceError(
        `No se pueden eliminar tramos de un plan publicado (plan ${planId})`,
        BILLING_CATALOG_ERROR_CODES.TIER_PLAN_PUBLISHED,
        422,
        'PLT.CAT.TIER_PLAN_PUBLISHED',
        'Los tramos de un plan publicado son inmutables. Clona el plan para modificarlos.'
      )
    }

    const tier = await BillingVolumeTier.query()
      .where('billing_volume_tier_id', tierId)
      .where('billing_plan_id', planId)
      .first()

    if (!tier) {
      throw new BillingCatalogServiceError(
        `Tramo ${tierId} no encontrado en plan ${planId}`,
        BILLING_CATALOG_ERROR_CODES.PLAN_NOT_FOUND,
        404,
        'PLT.CAT.TIER_NOT_FOUND',
        'El tramo solicitado no existe o fue eliminado.'
      )
    }

    await (tier as unknown as { delete(): Promise<void> }).delete()
  }

  // ─── Precio resuelto (determinista) ──────────────────────────────────────

  /**
   * Calcula el precio bruto, descuento y totales para N empleados en una fecha dada.
   *
   * Algoritmo:
   *  1. Precio vigente = MAX(effective_from ≤ referenceDate).
   *  2. Descuento aplicable = tramo con MAX(min_employees ≤ employeeCount).
   *     Si no hay tramo que cubra el volumen, descuento = 0 %.
   *  3. Cálculo:
   *     subtotal = pricePerEmployee × employeeCount × (1 - discountPercent/100)
   *     tax      = subtotal × taxRate
   *     total    = subtotal + tax
   */
  async resolvePrice(
    planId: number,
    employeeCount: number,
    referenceDate?: string
  ): Promise<ResolvedPrice> {
    await this.getPlan(planId)

    const refDate = referenceDate ?? toBusinessDateString()

    const currentPrice = await BillingPlanPrice.query()
      .where('billing_plan_id', planId)
      .where('billing_plan_price_effective_from', '<=', refDate)
      .orderBy('billing_plan_price_effective_from', 'desc')
      .first()

    if (!currentPrice) {
      throw new BillingCatalogServiceError(
        `Plan ${planId} no tiene precio vigente para ${refDate}`,
        BILLING_CATALOG_ERROR_CODES.PLAN_NOT_FOUND,
        404,
        'PLT.CAT.PLAN_NOT_FOUND',
        `El plan no tiene un precio vigente para la fecha ${refDate}.`
      )
    }

    const applicableTier = await BillingVolumeTier.query()
      .where('billing_plan_id', planId)
      .where('billing_volume_tier_min_employees', '<=', employeeCount)
      .orderBy('billing_volume_tier_min_employees', 'desc')
      .first()

    const discountPercent = applicableTier?.billingVolumeTierDiscountPercent ?? 0
    const pricePerEmployee = Number(currentPrice.billingPlanPriceAmount)
    const taxRate = Number(currentPrice.billingPlanPriceTaxRate)

    const grossAmount = pricePerEmployee * employeeCount
    const discountAmount = round2(grossAmount * (discountPercent / 100))
    const subtotal = round2(grossAmount - discountAmount)
    const taxAmount = round2(subtotal * taxRate)
    const total = round2(subtotal + taxAmount)

    return {
      billingPlanId: planId,
      employeeCount,
      pricePerEmployee,
      currency: currentPrice.billingPlanPriceCurrency,
      discountPercent,
      discountAmount,
      subtotal,
      taxRate,
      taxAmount,
      total,
      effectiveFrom: currentPrice.billingPlanPriceEffectiveFrom,
      resolvedAt: refDate,
    }
  }
}

/** Redondeo a 2 decimales para cálculos monetarios. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}
