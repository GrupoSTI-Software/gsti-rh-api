import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import BillingPlan from '#models/billing_plan'
import BillingPlanPrice from '#models/billing_plan_price'
import BillingVolumeTier from '#models/billing_volume_tier'
import type { DiscountCodeKind } from '#models/discount_code'
import { BILLING_CATALOG_ERROR_CODES } from '../constants/billing_catalog_error_codes.js'
import { BillingCatalogServiceError } from '../exceptions/billing_catalog_service_error.js'
import { toBusinessDateString, toCalendarIsoDate } from '../utils/business_date.js'

const ER_DUP_ENTRY = 'ER_DUP_ENTRY'

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

/**
 * Código de descuento ya validado (redimible) a aplicar sobre un `resolvePrice`
 * (USRH1787714804400). `discount_code_service.ts` es responsable de resolver
 * y validar el código antes de construir este valor; este servicio no
 * conoce `DiscountCode` como modelo, solo el par tipo/valor a aplicar.
 */
export interface AppliedDiscountCode {
  kind: DiscountCodeKind
  value: number
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
  /**
   * Campos presentes solo cuando se resuelve con un `AppliedDiscountCode`
   * (USRH1787714804400). `codeDiscountAmount` es el ahorro EFECTIVAMENTE
   * aplicado (nunca el nominal): si el descuento excede el subtotal, queda
   * topado a lo que realmente se pudo descontar (regla del subtotal no
   * negativo). Los `undiscounted*` reflejan qué habría costado con el
   * precio de lista y el mismo tramo por volumen, sin el código — para
   * poder congelar ambos lados de la comparación en una sola llamada.
   */
  codeDiscountAmount?: number
  codeKind?: DiscountCodeKind
  undiscountedPricePerEmployee?: number
  undiscountedSubtotal?: number
  undiscountedTaxAmount?: number
  undiscountedTotal?: number
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
   *
   * Cuando el plan es una copia (billingPlanParentId no nulo), la publicación
   * ejecuta además el relevo del plan padre dentro de la misma transacción:
   *  1. Desmarca y desactiva al padre en una sola sentencia.
   *  2. Descarta en borrador las copias hermanas del mismo padre.
   *  3. Publica el clon; si el padre era el plan público de la landing,
   *     el clon hereda la marca en ese mismo paso.
   *
   * El orden desmarcar → marcar es obligatorio: el índice único
   * `billing_plans_public_unique` se valida por sentencia y no al commit.
   * Invertirlo produce `ER_DUP_ENTRY`, que se traduce a `409
   * PLT.CAT.PUBLIC_PLAN_CONFLICT` en lugar de dejar pasar el mensaje crudo
   * de MySQL. (USRH1787619255298 · USRH1787619255300)
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

    try {
      await db.transaction(async (trx) => {
        // Si el plan es un clon, publicarlo desactiva atómicamente al plan origen.
        // Sus suscripciones e historial quedan intactos: solo deja de ser vendible.
        // Además se descartan las demás copias en borrador del mismo padre, para
        // garantizar una sola oferta viva por linaje aun con datos previos a las
        // restricciones de clonePlan (copias sin linaje, copias hermanas antiguas).
        if (plan.billingPlanParentId) {
          // Leer el estado del padre dentro de la trx para detectar si era el
          // plan público. Lectura previa explícita sobre el mismo cliente
          // transaccional; el UPDATE que sigue toma el lock exclusivo de la fila.
          const parent = await BillingPlan.query({ client: trx })
            .where('billing_plan_id', plan.billingPlanParentId)
            .first()
          const parentWasPublic = parent?.billingPlanIsPublic === 1

          // Paso 1 (USRH1787619255300): desmarcar y desactivar al padre en una
          // sola sentencia. Este UPDATE precede siempre al save() del clon, lo
          // que garantiza el orden desmarcar→marcar que exige el índice único.
          await BillingPlan.query({ client: trx })
            .where('billing_plan_id', plan.billingPlanParentId)
            .update({ billing_plan_active: 0, billing_plan_is_public: 0 })

          const siblingDrafts = await BillingPlan.query({ client: trx })
            .where('billing_plan_parent_id', plan.billingPlanParentId)
            .whereNull('billing_plan_published_at')
            .whereNot('billing_plan_id', planId)

          for (const sibling of siblingDrafts) {
            sibling.useTransaction(trx)
            await (sibling as unknown as { delete(): Promise<void> }).delete()
          }

          // Paso 2 (USRH1787619255300): si el padre era el plan público, la
          // marca viaja al clon en el mismo save() que lo publica.
          if (parentWasPublic) {
            plan.billingPlanIsPublic = 1
          }
        }

        plan.billingPlanPublishedAt = DateTime.utc()
        plan.useTransaction(trx)
        await plan.save()
      })
    } catch (error) {
      this.rethrowPublicPlanConflict(error)
    }

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

    await db.transaction(async (trx) => {
      plan.billingPlanActive = 0
      plan.billingPlanIsPublic = 0
      plan.useTransaction(trx)
      await plan.save()
    })
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
   *
   * Orden de validación: duplicado exacto → coherencia contra la vigente.
   * "Hoy" siempre lo decide el servidor (`toBusinessDateString`); el cliente
   * nunca lo envía ni puede influir en él.
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

    // Si el plan ya tiene una versión vigente (effective_from ≤ hoy), la
    // nueva no puede quedar por detrás: reescribiría hacia atrás el precio
    // de un periodo que ya transcurrió. Sin versión vigente (plan nuevo aún
    // sin publicar) se acepta fecha pasada, porque publishPlan exige
    // justamente un precio con effective_from ≤ hoy.
    const today = toBusinessDateString()
    const currentPrice = await BillingPlanPrice.query()
      .where('billing_plan_id', planId)
      .where('billing_plan_price_effective_from', '<=', today)
      .orderBy('billing_plan_price_effective_from', 'desc')
      .first()

    if (currentPrice && input.billingPlanPriceEffectiveFrom < today) {
      throw new BillingCatalogServiceError(
        `Vigencia ${input.billingPlanPriceEffectiveFrom} anterior a hoy con versión vigente en plan ${planId}`,
        BILLING_CATALOG_ERROR_CODES.PRICE_EFFECTIVE_FROM_IN_PAST,
        422,
        'PLT.CAT.PRICE_EFFECTIVE_FROM_IN_PAST',
        'La nueva versión de precio solo puede entrar en vigor a partir de hoy.'
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
   *
   * Con `appliedCode` (USRH1787714804400), el orden de acumulación es:
   *  0. `unit_price` sustituye `pricePerEmployee` ANTES del bruto (paso 1);
   *     el tramo por volumen (paso 2) se calcula sobre el bruto ya
   *     sustituido — mismo tramo, importe distinto al de lista.
   *  4. `percent`/`fixed_amount` se restan del subtotal YA con el tramo
   *     aplicado (nunca antes).
   *  5. El subtotal nunca es negativo: si el descuento excede el subtotal
   *     disponible, subtotal/impuesto/total quedan en cero y el ahorro
   *     reportado (`codeDiscountAmount`) es el efectivamente aplicado.
   *  6. El impuesto siempre se recalcula sobre el subtotal final; nunca se
   *     descuenta el impuesto en sí mismo.
   */
  async resolvePrice(
    planId: number,
    employeeCount: number,
    referenceDate?: string,
    appliedCode?: AppliedDiscountCode
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
    const listPricePerEmployee = Number(currentPrice.billingPlanPriceAmount)
    const taxRate = Number(currentPrice.billingPlanPriceTaxRate)

    // Paso 0 + 1 (regla del `unit_price`): el precio por empleado a usar en
    // el bruto es el del código si sustituye precio; si no, el de lista.
    const pricePerEmployee =
      appliedCode?.kind === 'unit_price' ? appliedCode.value : listPricePerEmployee

    const grossAmount = pricePerEmployee * employeeCount
    const discountAmount = round2(grossAmount * (discountPercent / 100))
    const subtotalAfterVolume = round2(grossAmount - discountAmount)

    let finalSubtotal = subtotalAfterVolume
    let codeDiscountAmount: number | undefined
    let undiscountedPricePerEmployee: number | undefined
    let undiscountedSubtotal: number | undefined
    let undiscountedTaxAmount: number | undefined
    let undiscountedTotal: number | undefined

    if (appliedCode) {
      // Bloque "sin código": siempre con el precio de lista y el mismo
      // tramo por volumen, sin importar si el código sustituye el precio.
      // Es el punto de comparación para medir el ahorro efectivo.
      const listGrossAmount = listPricePerEmployee * employeeCount
      const listDiscountAmount = round2(listGrossAmount * (discountPercent / 100))
      const listSubtotal = round2(listGrossAmount - listDiscountAmount)
      const listTaxAmount = round2(listSubtotal * taxRate)
      const listTotal = round2(listSubtotal + listTaxAmount)

      finalSubtotal = applyCodeDiscount(subtotalAfterVolume, appliedCode)

      undiscountedPricePerEmployee = listPricePerEmployee
      undiscountedSubtotal = listSubtotal
      undiscountedTaxAmount = listTaxAmount
      undiscountedTotal = listTotal
      // Ahorro EFECTIVAMENTE aplicado: nunca el nominal del código, sino la
      // diferencia real contra el subtotal de lista (regla del subtotal no
      // negativo — ya topado dentro de `finalSubtotal`).
      codeDiscountAmount = round2(listSubtotal - finalSubtotal)
    }

    const taxAmount = round2(finalSubtotal * taxRate)
    const total = round2(finalSubtotal + taxAmount)

    return {
      billingPlanId: planId,
      employeeCount,
      pricePerEmployee,
      currency: currentPrice.billingPlanPriceCurrency,
      discountPercent,
      discountAmount,
      subtotal: finalSubtotal,
      taxRate,
      taxAmount,
      total,
      trialDays: currentPrice.billingPlanPriceTrialDays,
      effectiveFrom: currentPrice.billingPlanPriceEffectiveFrom,
      resolvedAt: refDate,
      ...(appliedCode
        ? {
            codeDiscountAmount,
            codeKind: appliedCode.kind,
            undiscountedPricePerEmployee,
            undiscountedSubtotal,
            undiscountedTaxAmount,
            undiscountedTotal,
          }
        : {}),
    }
  }

  // ---------------------------------------------------------------------------
  // Plan público de la landing (USRH1787619255298)
  // ---------------------------------------------------------------------------

  /**
   * Señala un plan como el plan público de la landing.
   *
   * Primero desmarca al anterior (si lo hay) y después marca al nuevo, ambos
   * dentro de la misma transacción. El orden importa: el UNIQUE de MySQL se
   * valida por sentencia, no al commit; invertirlo causa ER_DUP_ENTRY.
   */
  async markPlanAsPublic(planId: number): Promise<BillingPlan> {
    const plan = await this.getPlan(planId)

    if (plan.billingPlanIsPublic === 1) {
      throw new BillingCatalogServiceError(
        `Plan ${planId} ya es el plan público`,
        BILLING_CATALOG_ERROR_CODES.PLAN_ALREADY_PUBLIC,
        422,
        'PLT.CAT.PLAN_ALREADY_PUBLIC',
        'Este plan ya es el plan público del sitio.'
      )
    }

    this.assertSellableForPublic(plan)

    try {
      await db.transaction(async (trx) => {
        await BillingPlan.query({ client: trx })
          .where('billing_plan_is_public', 1)
          .update({ billing_plan_is_public: 0 })

        plan.billingPlanIsPublic = 1
        plan.useTransaction(trx)
        await plan.save()
      })
    } catch (error) {
      this.rethrowPublicPlanConflict(error)
    }

    return plan
  }

  /**
   * Quita la señal de plan público. Deja el catálogo sin plan público;
   * no promueve otro automáticamente.
   */
  async unmarkPlanAsPublic(planId: number): Promise<BillingPlan> {
    const plan = await this.getPlan(planId)

    if (plan.billingPlanIsPublic !== 1) {
      throw new BillingCatalogServiceError(
        `Plan ${planId} no es el plan público`,
        BILLING_CATALOG_ERROR_CODES.PLAN_NOT_PUBLIC,
        422,
        'PLT.CAT.PLAN_NOT_PUBLIC',
        'Este plan no es el plan público del sitio.'
      )
    }

    plan.billingPlanIsPublic = 0
    await plan.save()
    return plan
  }

  /**
   * Verifica que el plan cumple los cuatro criterios de vendibilidad
   * necesarios para poder señalarlo como público:
   *   1. Publicado (`billingPlanPublishedAt` NOT NULL).
   *   2. Activo (`billingPlanActive === 1`).
   *   3. No borrado (garantizado por `getPlan` vía SoftDeletes → 404).
   *   4. Tiene un precio con vigencia igual o anterior a hoy.
   *
   * Replica el criterio de `billing_tenant_service.ts:429-452` sin cruzar
   * servicios. `getPlan` ya precarga `prices` ordenados por `effective_from asc`.
   */
  private assertSellableForPublic(plan: BillingPlan): void {
    if (!plan.isPublished) {
      throw new BillingCatalogServiceError(
        `Plan ${plan.billingPlanId} no está publicado`,
        BILLING_CATALOG_ERROR_CODES.PLAN_PUBLIC_REQUIRES_SELLABLE,
        422,
        'PLT.CAT.PLAN_PUBLIC_REQUIRES_SELLABLE',
        'Solo se puede destacar en el sitio un plan publicado, vigente y con precio activo.'
      )
    }
    if (plan.billingPlanActive !== 1) {
      throw new BillingCatalogServiceError(
        `Plan ${plan.billingPlanId} está retirado`,
        BILLING_CATALOG_ERROR_CODES.PLAN_PUBLIC_REQUIRES_SELLABLE,
        422,
        'PLT.CAT.PLAN_PUBLIC_REQUIRES_SELLABLE',
        'Solo se puede destacar en el sitio un plan publicado, vigente y con precio activo.'
      )
    }
    const today = toBusinessDateString()
    const hasCurrentPrice = plan.prices.some((p) => {
      const effectiveFrom = toCalendarIsoDate(p.billingPlanPriceEffectiveFrom)
      return effectiveFrom !== null && effectiveFrom <= today
    })
    if (!hasCurrentPrice) {
      throw new BillingCatalogServiceError(
        `Plan ${plan.billingPlanId} no tiene precio vigente`,
        BILLING_CATALOG_ERROR_CODES.PLAN_PUBLIC_REQUIRES_SELLABLE,
        422,
        'PLT.CAT.PLAN_PUBLIC_REQUIRES_SELLABLE',
        'Solo se puede destacar en el sitio un plan publicado, vigente y con precio activo.'
      )
    }
  }

  /**
   * Traduce `ER_DUP_ENTRY` sobre `billing_plans_public_unique` a un error
   * de dominio 409. Cualquier otro error se re-lanza sin modificar.
   */
  private rethrowPublicPlanConflict(error: unknown): never {
    const { code, sqlMessage } = error as { code?: string; sqlMessage?: string }
    if (code === ER_DUP_ENTRY && sqlMessage?.includes('billing_plans_public_unique')) {
      throw new BillingCatalogServiceError(
        'Carrera detectada al marcar el plan público',
        BILLING_CATALOG_ERROR_CODES.PUBLIC_PLAN_CONFLICT,
        409,
        'PLT.CAT.PUBLIC_PLAN_CONFLICT',
        'El plan público del sitio cambió mientras procesábamos la solicitud. Vuelve a intentarlo.'
      )
    }
    throw error
  }
}

/** Redondeo a 2 decimales para cálculos monetarios. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Aplica el descuento del código sobre el subtotal YA con el tramo por
 * volumen aplicado (USRH1787714804400, regla de acumulación después del
 * volumen). `unit_price` no resta nada aquí: su efecto ya ocurrió al
 * sustituir el precio por empleado antes del bruto. El resultado nunca es
 * negativo (regla del subtotal no negativo).
 */
function applyCodeDiscount(subtotalAfterVolume: number, appliedCode: AppliedDiscountCode): number {
  if (appliedCode.kind === 'percent') {
    const amount = round2(subtotalAfterVolume * (appliedCode.value / 100))
    return Math.max(0, round2(subtotalAfterVolume - amount))
  }
  if (appliedCode.kind === 'fixed_amount') {
    return Math.max(0, round2(subtotalAfterVolume - appliedCode.value))
  }
  return Math.max(0, subtotalAfterVolume)
}
