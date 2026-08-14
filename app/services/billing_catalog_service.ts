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
  billingVolumeTierMinEmployees?: number
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
  /** Días de prueba del precio vigente resuelto (para el preview del alta de suscripción). */
  trialDays: number
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

    if (input.billingPlanName !== undefined) {
      if (plan.isPublished) {
        throw new BillingCatalogServiceError(
          `No se puede renombrar el plan publicado ${planId}`,
          BILLING_CATALOG_ERROR_CODES.PLAN_NAME_IMMUTABLE,
          422,
          'PLT.CAT.PLAN_NAME_IMMUTABLE',
          'El nombre de un plan publicado es inmutable. Clona el plan para ofrecerlo con otro nombre.'
        )
      }
      plan.billingPlanName = input.billingPlanName
    }
    if (input.billingPlanDescription !== undefined)
      plan.billingPlanDescription = input.billingPlanDescription
    if (input.billingPlanStripeProductId !== undefined)
      plan.billingPlanStripeProductId = input.billingPlanStripeProductId

    // El estado de venta (billingPlanActive) no se edita por esta vía: tiene
    // endpoints dedicados (`/publish` y `/deactivate`). Solo se rechaza
    // explícitamente el intento de reactivar (0 → 1); cualquier otro valor
    // enviado aquí se ignora en silencio.
    if (input.billingPlanActive === 1 && plan.billingPlanActive === 0) {
      throw new BillingCatalogServiceError(
        `No se puede reactivar el plan ${planId}`,
        BILLING_CATALOG_ERROR_CODES.PLAN_REACTIVATION_FORBIDDEN,
        422,
        'PLT.CAT.PLAN_REACTIVATION_FORBIDDEN',
        'Un plan retirado no se puede reactivar. Para volver a ofrecerlo, clónalo y publica la copia.'
      )
    }

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

    await db.transaction(async (trx) => {
      // Si el plan es un clon, publicarlo desactiva atómicamente al plan origen.
      // Sus suscripciones e historial quedan intactos: solo deja de ser vendible.
      // Además se descartan las demás copias en borrador del mismo padre, para
      // garantizar una sola oferta viva por linaje aun con datos previos a las
      // restricciones de clonePlan (copias sin linaje, copias hermanas antiguas).
      if (plan.billingPlanParentId) {
        await BillingPlan.query({ client: trx })
          .where('billing_plan_id', plan.billingPlanParentId)
          .update({ billing_plan_active: 0 })

        const siblingDrafts = await BillingPlan.query({ client: trx })
          .where('billing_plan_parent_id', plan.billingPlanParentId)
          .whereNull('billing_plan_published_at')
          .whereNot('billing_plan_id', planId)

        for (const sibling of siblingDrafts) {
          sibling.useTransaction(trx)
          await (sibling as unknown as { delete(): Promise<void> }).delete()
        }
      }

      plan.billingPlanPublishedAt = DateTime.utc()
      plan.useTransaction(trx)
      await plan.save()
    })

    return plan
  }

  /**
   * Retira del catálogo un plan publicado y vigente. Irreversible: no existe
   * vía para reactivarlo (decisión de Wilvardo 2026-08-05). No toca
   * `billing_subscriptions` — el trato congelado de quien ya lo contrató
   * permanece intacto; el retiro solo afecta la venta futura.
   */
  async deactivatePlan(planId: number): Promise<BillingPlan> {
    const plan = await this.getPlan(planId)

    if (!plan.isPublished) {
      throw new BillingCatalogServiceError(
        `Plan ${planId} no está publicado, no se puede retirar`,
        BILLING_CATALOG_ERROR_CODES.PLAN_DEACTIVATE_REQUIRES_PUBLISHED,
        422,
        'PLT.CAT.PLAN_DEACTIVATE_REQUIRES_PUBLISHED',
        'Solo se puede retirar un plan publicado y vigente. Un plan en borrador se descarta, no se retira.'
      )
    }

    if (plan.billingPlanActive === 0) {
      throw new BillingCatalogServiceError(
        `Plan ${planId} ya está desactivado`,
        BILLING_CATALOG_ERROR_CODES.PLAN_ALREADY_DEACTIVATED,
        422,
        'PLT.CAT.PLAN_ALREADY_DEACTIVATED',
        'Este plan ya fue retirado del catálogo.'
      )
    }

    plan.billingPlanActive = 0
    await plan.save()
    return plan
  }

  /**
   * Clona un plan publicado como nuevo borrador.
   *
   * Reglas:
   *  - Solo se puede clonar un plan PUBLICADO (un borrador se edita directo).
   *  - No se puede clonar un plan DESACTIVADO (la cadena de ofertas parte del vigente).
   *  - No puede existir más de un clon en borrador vivo por plan origen a la vez.
   *  - Copia nombre, descripción, únicamente el precio VIGENTE (no el historial completo) y los tramos activos.
   *  - El clon queda con `billingPlanParentId` apuntando al origen (linaje).
   */
  async clonePlan(planId: number): Promise<BillingPlan> {
    const source = await this.getPlan(planId)

    if (!source.isPublished) {
      throw new BillingCatalogServiceError(
        `Plan ${planId} no está publicado, no se puede clonar`,
        BILLING_CATALOG_ERROR_CODES.CLONE_SOURCE_MUST_BE_PUBLISHED,
        422,
        'PLT.CAT.CLONE_SOURCE_MUST_BE_PUBLISHED',
        'Solo se puede clonar un plan publicado. Un plan en borrador se edita directamente.'
      )
    }

    if (source.billingPlanActive === 0) {
      throw new BillingCatalogServiceError(
        `Plan ${planId} está desactivado, no se puede clonar`,
        BILLING_CATALOG_ERROR_CODES.CLONE_SOURCE_DEACTIVATED,
        422,
        'PLT.CAT.CLONE_SOURCE_DEACTIVATED',
        'No se puede clonar un plan desactivado. La cadena de ofertas parte siempre del plan vigente publicado.'
      )
    }

    const existingDraftClone = await BillingPlan.query()
      .where('billing_plan_parent_id', planId)
      .whereNull('billing_plan_published_at')
      .first()

    if (existingDraftClone) {
      throw new BillingCatalogServiceError(
        `Plan ${planId} ya tiene un borrador clon vivo (plan ${existingDraftClone.billingPlanId})`,
        BILLING_CATALOG_ERROR_CODES.CLONE_DRAFT_EXISTS,
        409,
        'PLT.CAT.CLONE_DRAFT_EXISTS',
        'Ya existe un borrador de nueva oferta en curso para este plan. Publícalo o descártalo antes de clonar de nuevo.'
      )
    }

    const today = toBusinessDateString()
    const currentPrice = await BillingPlanPrice.query()
      .where('billing_plan_id', planId)
      .where('billing_plan_price_effective_from', '<=', today)
      .orderBy('billing_plan_price_effective_from', 'desc')
      .first()

    const newPlan = await db.transaction(async (trx) => {
      const cloned = await BillingPlan.create(
        {
          billingPlanName: `${source.billingPlanName} (copia)`,
          billingPlanDescription: source.billingPlanDescription,
          billingPlanProvider: source.billingPlanProvider,
          billingPlanStripeProductId: null,
          billingPlanActive: 1,
          billingPlanPublishedAt: null,
          billingPlanParentId: source.billingPlanId,
        },
        { client: trx }
      )

      if (currentPrice) {
        await BillingPlanPrice.create(
          {
            billingPlanId: cloned.billingPlanId,
            billingPlanPriceAmount: currentPrice.billingPlanPriceAmount,
            billingPlanPriceCurrency: currentPrice.billingPlanPriceCurrency,
            billingPlanPriceTaxRate: currentPrice.billingPlanPriceTaxRate,
            billingPlanPriceTrialDays: currentPrice.billingPlanPriceTrialDays,
            billingPlanPriceEffectiveFrom: currentPrice.billingPlanPriceEffectiveFrom,
            billingPlanPriceStripePriceId: null,
            billingPlanPriceProvider: 'manual',
          },
          { client: trx }
        )
      }

      const sourceTiers = await BillingVolumeTier.query({ client: trx }).where(
        'billing_plan_id',
        planId
      )

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

    await this.assertMinEmployeesAvailable(planId, input.billingVolumeTierMinEmployees)

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
        BILLING_CATALOG_ERROR_CODES.TIER_NOT_FOUND,
        404,
        'PLT.CAT.TIER_NOT_FOUND',
        'El tramo solicitado no existe o fue eliminado.'
      )
    }

    if (
      input.billingVolumeTierMinEmployees === undefined &&
      input.billingVolumeTierDiscountPercent === undefined
    ) {
      throw new BillingCatalogServiceError(
        'Debes enviar al menos un campo a actualizar del tramo',
        BILLING_CATALOG_ERROR_CODES.TIER_INVALID,
        422,
        'PLT.CAT.TIER_INVALID',
        'Envía el mínimo de empleados y/o el porcentaje de descuento a actualizar.'
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

    if (input.billingVolumeTierMinEmployees !== undefined) {
      if (input.billingVolumeTierMinEmployees < 1) {
        throw new BillingCatalogServiceError(
          'Tramo inválido: min_employees ≥ 1',
          BILLING_CATALOG_ERROR_CODES.TIER_INVALID,
          422,
          'PLT.CAT.TIER_INVALID',
          'El mínimo de empleados debe ser ≥ 1.'
        )
      }

      if (input.billingVolumeTierMinEmployees !== tier.billingVolumeTierMinEmployees) {
        await this.assertMinEmployeesAvailable(planId, input.billingVolumeTierMinEmployees, tierId)
        tier.billingVolumeTierMinEmployees = input.billingVolumeTierMinEmployees
      }
    }

    if (input.billingVolumeTierDiscountPercent !== undefined) {
      tier.billingVolumeTierDiscountPercent = input.billingVolumeTierDiscountPercent
    }

    await tier.save()
    return tier
  }

  /**
   * Verifica que `minEmployees` no esté reservado por otro tramo del mismo
   * plan, considerando también los tramos eliminados lógicamente: la
   * restricción UNIQUE de la base de datos (`billing_plan_id`,
   * `billing_volume_tier_min_employees`) no distingue soft-delete, así que
   * la validación previa debe verlos para dar un mensaje claro en vez de un
   * error de base de datos sin traducir.
   */
  private async assertMinEmployeesAvailable(
    planId: number,
    minEmployees: number,
    excludeTierId?: number
  ): Promise<void> {
    const query = BillingVolumeTier.query()
      .withTrashed()
      .where('billing_plan_id', planId)
      .where('billing_volume_tier_min_employees', minEmployees)

    if (excludeTierId !== undefined) {
      query.whereNot('billing_volume_tier_id', excludeTierId)
    }

    const duplicate = await query.first()

    if (duplicate) {
      throw new BillingCatalogServiceError(
        `Ya existe un tramo con min_employees ${minEmployees} en plan ${planId}`,
        BILLING_CATALOG_ERROR_CODES.TIER_DUPLICATE,
        409,
        'PLT.CAT.TIER_DUPLICATE',
        'Ya existe un tramo con el mismo mínimo de empleados en este plan (incluye tramos eliminados).'
      )
    }
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
        BILLING_CATALOG_ERROR_CODES.TIER_NOT_FOUND,
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
      trialDays: currentPrice.billingPlanPriceTrialDays,
      effectiveFrom: currentPrice.billingPlanPriceEffectiveFrom,
      resolvedAt: refDate,
    }
  }
}

/** Redondeo a 2 decimales para cálculos monetarios. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}
