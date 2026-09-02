import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import DiscountCode, { type DiscountCodeKind } from '#models/discount_code'
import BillingPlan from '#models/billing_plan'
import BillingCatalogService from '#services/billing_catalog_service'
import { DISCOUNT_CODE_ERROR_CODES } from '#constants/discount_code_error_codes'
import { DiscountCodeServiceError } from '#exceptions/discount_code_service_error'
import {
  isBusinessCalendarDateBefore,
  toBusinessDateString,
  toCalendarIsoDate,
} from '#utils/business_date'

// ---------------------------------------------------------------------------
// Tipos de entrada / salida
// ---------------------------------------------------------------------------

export interface CreateDiscountCodeInput {
  discountCodeCode: string
  discountCodeName: string
  discountCodeKind: DiscountCodeKind
  discountCodeValue: number
  discountCodeValidFrom?: string | null
  discountCodeValidTo?: string | null
  discountCodeMaxRedemptions?: number | null
  discountCodeBenefitPeriods?: number | null
}

export interface UpdateDiscountCodeInput {
  discountCodeName?: string
  discountCodeValue?: number
  discountCodeValidFrom?: string | null
  discountCodeValidTo?: string | null
  discountCodeMaxRedemptions?: number | null
  discountCodeBenefitPeriods?: number | null
}

/**
 * Criterios de `GET /api/platform/billing/discount-codes` (USRH1787714804397).
 * Todos opcionales; se combinan con AND sobre la consulta.
 */
export interface ListDiscountCodesFilters {
  search?: string
  kind?: DiscountCodeKind
  active?: number
  page?: number
  limit?: number
}

export interface ListDiscountCodesResult {
  data: DiscountCode[]
  meta: { total: number; page: number; limit: number; lastPage: number }
}

/** Parámetros de `GET /discount-codes/:discountCodeText/quote` (USRH1787714804400). */
export interface QuoteWithDiscountCodeInput {
  discountCodeText: string
  billingPlanId: number
  employeeCount: number
}

/** Un lado de la comparación (con o sin código) de la cotización. */
export interface DiscountCodeQuotePriceBlock {
  pricePerEmployee: number
  discountPercent: number
  discountAmount: number
  subtotal: number
  taxRate: number
  taxAmount: number
  total: number
}

export interface DiscountCodeQuote {
  discountCodeCode: string
  discountCodeKind: DiscountCodeKind
  billingPlanId: number
  employeeCount: number
  currency: string
  trialDays: number
  effectiveFrom: string
  /** Precio ya con el descuento por volumen, SIN el código. */
  undiscounted: DiscountCodeQuotePriceBlock
  /** Precio con el código aplicado, acumulado después del descuento por volumen. */
  discounted: DiscountCodeQuotePriceBlock & { codeDiscountAmount: number }
  /**
   * `false` cuando el descuento del código deja el subtotal en cero (regla
   * del subtotal no negativo): la contratación no tendría cargo, así que no
   * se puede formalizar el contrato en esos términos.
   */
  isContractable: boolean
}

/** Código de error MySQL para violación de índice UNIQUE (defensa en profundidad). */
const ER_DUP_ENTRY = 'ER_DUP_ENTRY'

/**
 * Lógica de negocio del catálogo de códigos de descuento de la plataforma
 * Valanserh (USRH1787714804397).
 *
 * Invariantes garantizados por el servicio:
 *  - El texto de un código es único de por vida: ni la comparación distingue
 *    mayúsculas de minúsculas, ni el estado (activo, apagado, retirado)
 *    libera el valor para reutilizarse.
 *  - El texto es inmutable tras crearse (lo refuerza además el modelo).
 *  - `discountCodeRedeemedCount` nace en 0 y este servicio nunca lo escribe;
 *    lo mueve el canje (USRH1787714804401).
 */
export default class DiscountCodeService {
  private readonly catalog = new BillingCatalogService()

  /**
   * Listado paginado con filtros. Sin criterios, se comporta como el
   * catálogo completo (sin retirados), orden `discount_code_id asc`.
   */
  async listDiscountCodes(
    filters: ListDiscountCodesFilters = {}
  ): Promise<ListDiscountCodesResult> {
    const page = filters.page ?? 1
    const limit = Math.min(filters.limit ?? 20, 100)

    const query = DiscountCode.query()
      .whereNull('discount_code_deleted_at')
      .orderBy('discount_code_id', 'asc')

    if (filters.search) {
      const term = `%${filters.search.toUpperCase()}%`
      query.where((builder) => {
        builder
          .whereRaw('UPPER(discount_code_code) LIKE ?', [term])
          .orWhereRaw('UPPER(discount_code_name) LIKE ?', [term])
      })
    }

    if (filters.kind !== undefined) {
      query.where('discount_code_kind', filters.kind)
    }

    if (filters.active !== undefined) {
      query.where('discount_code_active', filters.active)
    }

    const paginated = await query.paginate(page, limit)
    const json = paginated.toJSON()

    return {
      data: json.data as DiscountCode[],
      meta: {
        total: json.meta.total,
        page: json.meta.currentPage,
        limit: json.meta.perPage,
        lastPage: json.meta.lastPage,
      },
    }
  }

  /** 404 tipado si no existe o está retirado del catálogo. */
  async getDiscountCode(discountCodeId: number): Promise<DiscountCode> {
    const discountCode = await DiscountCode.query()
      .where('discount_code_id', discountCodeId)
      .whereNull('discount_code_deleted_at')
      .first()

    if (!discountCode) {
      throw new DiscountCodeServiceError(
        `Código de descuento ${discountCodeId} no encontrado`,
        DISCOUNT_CODE_ERROR_CODES.NOT_FOUND,
        404,
        'codigo-no-encontrado',
        'El código de descuento no fue encontrado o fue retirado del catálogo.'
      )
    }

    return discountCode
  }

  async createDiscountCode(input: CreateDiscountCodeInput): Promise<DiscountCode> {
    this.assertValueCoherence(input.discountCodeKind, input.discountCodeValue)
    this.assertValidityRange(input.discountCodeValidFrom, input.discountCodeValidTo)

    const normalizedCode = input.discountCodeCode.trim().toUpperCase()

    try {
      return await DiscountCode.create({
        discountCodeCode: normalizedCode,
        discountCodeName: input.discountCodeName,
        discountCodeKind: input.discountCodeKind,
        discountCodeValue: input.discountCodeValue,
        discountCodeValidFrom: input.discountCodeValidFrom ?? null,
        discountCodeValidTo: input.discountCodeValidTo ?? null,
        discountCodeMaxRedemptions: input.discountCodeMaxRedemptions ?? null,
        discountCodeRedeemedCount: 0,
        discountCodeBenefitPeriods: input.discountCodeBenefitPeriods ?? null,
        discountCodeActive: 1,
      })
    } catch (error) {
      this.rethrowDuplicateDiscountCodeError(error, normalizedCode)
    }
  }

  /**
   * Edita todo salvo el texto (regla 4; el validador tampoco lo acepta). Las
   * aserciones de coherencia y vigencia se re-corren con el estado
   * resultante (mezcla de lo enviado y lo persistido), nunca solo con lo
   * enviado, para no dejar guardar una combinación inconsistente cuando el
   * cliente solo manda un campo.
   */
  async updateDiscountCode(
    discountCodeId: number,
    input: UpdateDiscountCodeInput
  ): Promise<DiscountCode> {
    const discountCode = await this.getDiscountCode(discountCodeId)

    const resultingValue = input.discountCodeValue ?? discountCode.discountCodeValue
    this.assertValueCoherence(discountCode.discountCodeKind, resultingValue)

    const resultingValidFrom =
      input.discountCodeValidFrom !== undefined
        ? input.discountCodeValidFrom
        : discountCode.discountCodeValidFrom
    const resultingValidTo =
      input.discountCodeValidTo !== undefined
        ? input.discountCodeValidTo
        : discountCode.discountCodeValidTo
    this.assertValidityRange(resultingValidFrom, resultingValidTo)

    if (input.discountCodeName !== undefined) {
      discountCode.discountCodeName = input.discountCodeName
    }
    discountCode.discountCodeValue = resultingValue
    if (input.discountCodeValidFrom !== undefined) {
      discountCode.discountCodeValidFrom = input.discountCodeValidFrom
    }
    if (input.discountCodeValidTo !== undefined) {
      discountCode.discountCodeValidTo = input.discountCodeValidTo
    }
    if (input.discountCodeMaxRedemptions !== undefined) {
      discountCode.discountCodeMaxRedemptions = input.discountCodeMaxRedemptions
    }
    if (input.discountCodeBenefitPeriods !== undefined) {
      discountCode.discountCodeBenefitPeriods = input.discountCodeBenefitPeriods
    }

    await discountCode.save()
    return discountCode
  }

  async activateDiscountCode(discountCodeId: number): Promise<DiscountCode> {
    const discountCode = await this.getDiscountCode(discountCodeId)

    if (discountCode.discountCodeActive === 1) {
      throw new DiscountCodeServiceError(
        `Código de descuento ${discountCodeId} ya está activo`,
        DISCOUNT_CODE_ERROR_CODES.ALREADY_ACTIVE,
        422,
        'codigo-ya-activo',
        'El código de descuento ya está activo.'
      )
    }

    discountCode.discountCodeActive = 1
    await discountCode.save()
    return discountCode
  }

  async deactivateDiscountCode(discountCodeId: number): Promise<DiscountCode> {
    const discountCode = await this.getDiscountCode(discountCodeId)

    if (discountCode.discountCodeActive === 0) {
      throw new DiscountCodeServiceError(
        `Código de descuento ${discountCodeId} ya está inactivo`,
        DISCOUNT_CODE_ERROR_CODES.ALREADY_INACTIVE,
        422,
        'codigo-ya-inactivo',
        'El código de descuento ya está inactivo.'
      )
    }

    discountCode.discountCodeActive = 0
    await discountCode.save()
    return discountCode
  }

  /**
   * Cotiza el costo de contratar `employeeCount` empleados en el plan
   * `billingPlanId`, con y sin el código de descuento `discountCodeText`
   * (USRH1787714804400). Operación de solo lectura: no reserva el código,
   * no descuenta su cupo y no crea ni modifica ninguna suscripción.
   *
   * Orden de validación (falla rápido, del dato más barato al más caro):
   *  1. El código existe y es redimible hoy (`assertRedeemableCode`).
   *  2. El plan existe, está publicado y activo (no se cotiza un borrador).
   *  3. El plan tiene un precio vigente para hoy.
   */
  async quoteWithDiscountCode(input: QuoteWithDiscountCodeInput): Promise<DiscountCodeQuote> {
    const referenceDate = toBusinessDateString()
    const discountCode = await this.assertRedeemableCode(input.discountCodeText, referenceDate)

    const plan = await BillingPlan.query()
      .where('billing_plan_id', input.billingPlanId)
      .first()

    if (!plan) {
      throw new DiscountCodeServiceError(
        `Plan ${input.billingPlanId} no encontrado`,
        DISCOUNT_CODE_ERROR_CODES.QUOTE_PLAN_NOT_FOUND,
        404,
        'plan-no-encontrado',
        'El plan solicitado no existe.'
      )
    }

    if (!plan.isPublished || plan.billingPlanActive !== 1) {
      throw new DiscountCodeServiceError(
        `Plan ${input.billingPlanId} no está publicado y vigente`,
        DISCOUNT_CODE_ERROR_CODES.QUOTE_PLAN_NOT_QUOTABLE,
        422,
        'plan-no-cotizable',
        'Solo se puede cotizar un plan publicado y vigente del catálogo. Un plan en borrador no se cotiza.'
      )
    }

    let undiscountedResolved
    let discountedResolved
    try {
      // Dos llamadas independientes, no una: el bloque `undiscounted` debe
      // ser exactamente lo que devuelve `resolvePrice` sin ningún código,
      // sin importar cómo evolucione el cálculo con código a futuro.
      undiscountedResolved = await this.catalog.resolvePrice(
        input.billingPlanId,
        input.employeeCount,
        referenceDate
      )
      discountedResolved = await this.catalog.resolvePrice(
        input.billingPlanId,
        input.employeeCount,
        referenceDate,
        { kind: discountCode.discountCodeKind, value: discountCode.discountCodeValue }
      )
    } catch {
      throw new DiscountCodeServiceError(
        `Plan ${input.billingPlanId} no tiene precio vigente para ${referenceDate}`,
        DISCOUNT_CODE_ERROR_CODES.QUOTE_NO_ACTIVE_PRICE,
        422,
        'sin-precio-vigente',
        'El plan no tiene un precio vigente en el catálogo para la fecha de hoy.'
      )
    }

    return {
      discountCodeCode: discountCode.discountCodeCode,
      discountCodeKind: discountCode.discountCodeKind,
      billingPlanId: input.billingPlanId,
      employeeCount: input.employeeCount,
      currency: undiscountedResolved.currency,
      trialDays: undiscountedResolved.trialDays,
      // El driver puede devolver la columna DATE como `Date` crudo: se
      // normaliza siempre a YYYY-MM-DD antes de exponerla en la API.
      effectiveFrom: toCalendarIsoDate(undiscountedResolved.effectiveFrom) ?? referenceDate,
      undiscounted: {
        pricePerEmployee: undiscountedResolved.pricePerEmployee,
        discountPercent: undiscountedResolved.discountPercent,
        discountAmount: undiscountedResolved.discountAmount,
        subtotal: undiscountedResolved.subtotal,
        taxRate: undiscountedResolved.taxRate,
        taxAmount: undiscountedResolved.taxAmount,
        total: undiscountedResolved.total,
      },
      discounted: {
        pricePerEmployee: discountedResolved.pricePerEmployee,
        discountPercent: discountedResolved.discountPercent,
        discountAmount: discountedResolved.discountAmount,
        subtotal: discountedResolved.subtotal,
        taxRate: discountedResolved.taxRate,
        taxAmount: discountedResolved.taxAmount,
        total: discountedResolved.total,
        codeDiscountAmount: discountedResolved.codeDiscountAmount ?? 0,
      },
      isContractable: discountedResolved.subtotal > 0,
    }
  }

  /**
   * Resuelve un texto de código a un `DiscountCode` redimible HOY, o lanza
   * un error específico con la razón exacta por la que no lo es (regla:
   * nunca un mensaje genérico de "código inválido").
   *
   * Orden de chequeo: existe → activo → vigencia iniciada → vigencia no
   * vencida → cupo de canjes disponible.
   *
   * `trx` + `lockForUpdate` (USRH1787714804401 §4/Anexo C §2): cuando el
   * alta de suscripción canjea el código dentro de su propia transacción,
   * pasa `lockForUpdate = true` para tomar `SELECT … FOR UPDATE` sobre la
   * fila del código y bloquear a cualquier otra alta concurrente con el
   * mismo código hasta el commit. Sin `trx`, se comporta igual que antes
   * (usado por la cotización de solo lectura, que nunca bloquea nada).
   */
  async assertRedeemableCode(
    discountCodeText: string,
    referenceDate: string = toBusinessDateString(),
    trx?: TransactionClientContract,
    lockForUpdate: boolean = false
  ): Promise<DiscountCode> {
    const normalizedCode = discountCodeText.trim().toUpperCase()

    const query = DiscountCode.query(trx ? { client: trx } : {})
      .where('discount_code_code', normalizedCode)
      .whereNull('discount_code_deleted_at')

    if (lockForUpdate) {
      query.forUpdate()
    }

    const discountCode = await query.first()

    if (!discountCode) {
      throw new DiscountCodeServiceError(
        `Código de descuento ${normalizedCode} no encontrado`,
        DISCOUNT_CODE_ERROR_CODES.NOT_FOUND,
        404,
        'codigo-no-encontrado',
        'El código de descuento no existe o fue retirado del catálogo.'
      )
    }

    if (discountCode.discountCodeActive === 0) {
      throw new DiscountCodeServiceError(
        `Código de descuento ${normalizedCode} está inactivo`,
        DISCOUNT_CODE_ERROR_CODES.CODE_INACTIVE,
        422,
        'codigo-inactivo',
        'El código de descuento está apagado y no se puede canjear.'
      )
    }

    // El driver MySQL puede devolver columnas DATE como `Date` crudo en vez
    // de string: se normalizan siempre antes de comparar (mismo patrón que
    // `assertSellableForPublic` en billing_catalog_service.ts).
    const validFrom = toCalendarIsoDate(discountCode.discountCodeValidFrom)
    const validTo = toCalendarIsoDate(discountCode.discountCodeValidTo)

    if (validFrom && isBusinessCalendarDateBefore(referenceDate, validFrom)) {
      throw new DiscountCodeServiceError(
        `Código de descuento ${normalizedCode} aún no inicia su vigencia`,
        DISCOUNT_CODE_ERROR_CODES.CODE_NOT_YET_VALID,
        422,
        'codigo-aun-no-vigente',
        `El código de descuento entra en vigor hasta el ${validFrom}.`
      )
    }

    if (validTo && isBusinessCalendarDateBefore(validTo, referenceDate)) {
      throw new DiscountCodeServiceError(
        `Código de descuento ${normalizedCode} ya venció`,
        DISCOUNT_CODE_ERROR_CODES.CODE_EXPIRED,
        422,
        'codigo-vencido',
        `El código de descuento venció el ${validTo}.`
      )
    }

    if (
      discountCode.discountCodeMaxRedemptions !== null &&
      discountCode.discountCodeRedeemedCount >= discountCode.discountCodeMaxRedemptions
    ) {
      throw new DiscountCodeServiceError(
        `Código de descuento ${normalizedCode} agotó su cupo de canjes`,
        DISCOUNT_CODE_ERROR_CODES.CODE_EXHAUSTED,
        422,
        'codigo-agotado',
        'El código de descuento agotó su cupo máximo de canjes.'
      )
    }

    return discountCode
  }

  /**
   * Consume un canje del código dentro de la transacción del alta
   * (USRH1787714804401 §4/Anexo C §2). **Único escritor** de
   * `discount_code_redeemed_count` en todo el sistema: ninguna otra parte
   * lo mueve ni se captura a mano (regla 7).
   *
   * Segunda comprobación del límite, ahora en el propio `UPDATE`: aunque
   * `assertRedeemableCode(..., trx, true)` ya bloqueó la fila con
   * `FOR UPDATE` y validó el cupo, este `WHERE` condicional es la defensa
   * que de verdad impide que el UPDATE mueva el contador más allá del
   * límite si algo cambiara entre una lectura y otra. Si el UPDATE afecta
   * cero filas, el cupo ya se agotó y el alta se rechaza — el llamador es
   * responsable de hacer rollback de la transacción completa.
   */
  async consumeRedemptionWithin(
    discountCodeId: number,
    trx: TransactionClientContract
  ): Promise<void> {
    const affected = await DiscountCode.query({ client: trx })
      .where('discount_code_id', discountCodeId)
      .where((builder) => {
        builder
          .whereNull('discount_code_max_redemptions')
          .orWhereRaw('discount_code_redeemed_count < discount_code_max_redemptions')
      })
      .increment('discount_code_redeemed_count', 1)

    // `increment` regresa la cantidad afectada (number) o un array según el
    // driver; normalizamos para no fallar por una forma inesperada.
    const affectedRows = Array.isArray(affected)
      ? Number.parseInt(`${affected[0] ?? 0}`, 10) || 0
      : Number.parseInt(`${affected ?? 0}`, 10) || 0

    if (affectedRows < 1) {
      throw new DiscountCodeServiceError(
        `Código de descuento ${discountCodeId} agotó su cupo de canjes al consumirlo`,
        DISCOUNT_CODE_ERROR_CODES.CODE_EXHAUSTED,
        422,
        'codigo-agotado',
        'El código de descuento agotó su cupo máximo de canjes.'
      )
    }
  }

  /** Coherencia valor↔tipo (regla 6). */
  private assertValueCoherence(kind: DiscountCodeKind, value: number): void {
    if (kind === 'percent' && (value < 0 || value > 100)) {
      throw new DiscountCodeServiceError(
        `Valor ${value} fuera de rango para tipo percent`,
        DISCOUNT_CODE_ERROR_CODES.VALUE_OUT_OF_RANGE,
        422,
        'valor-fuera-de-rango',
        'Un descuento por porcentaje debe estar entre 0 y 100.'
      )
    }

    if (kind === 'fixed_amount' && value <= 0) {
      throw new DiscountCodeServiceError(
        `Valor ${value} fuera de rango para tipo fixed_amount`,
        DISCOUNT_CODE_ERROR_CODES.VALUE_OUT_OF_RANGE,
        422,
        'valor-fuera-de-rango',
        'Un descuento de monto fijo debe ser mayor que cero.'
      )
    }

    if (kind === 'unit_price' && value < 0) {
      throw new DiscountCodeServiceError(
        `Valor ${value} fuera de rango para tipo unit_price`,
        DISCOUNT_CODE_ERROR_CODES.VALUE_OUT_OF_RANGE,
        422,
        'valor-fuera-de-rango',
        'Un precio fijo por empleado debe ser mayor o igual a cero.'
      )
    }
  }

  /**
   * Vigencia con dos fechas opcionales (regla 7): si vienen ambas, la final
   * no puede ser anterior a la inicial. VineJS no ofrece una regla inclusiva
   * de comparación entre dos campos, por eso se valida aquí.
   */
  private assertValidityRange(validFrom?: string | null, validTo?: string | null): void {
    if (!validFrom || !validTo) {
      return
    }

    if (isBusinessCalendarDateBefore(validTo, validFrom)) {
      throw new DiscountCodeServiceError(
        `Vigencia inválida: ${validTo} es anterior a ${validFrom}`,
        DISCOUNT_CODE_ERROR_CODES.VALIDITY_RANGE_INVALID,
        422,
        'vigencia-invalida',
        'La fecha final de vigencia no puede ser anterior a la inicial.'
      )
    }
  }

  private rethrowDuplicateDiscountCodeError(error: unknown, code: string): never {
    const dbError = error as { code?: string; sqlMessage?: string }
    if (dbError?.code === ER_DUP_ENTRY && dbError.sqlMessage?.includes('uq_discount_code_code')) {
      throw new DiscountCodeServiceError(
        `Código de descuento ${code} ya existe`,
        DISCOUNT_CODE_ERROR_CODES.CODE_DUPLICATE,
        409,
        'codigo-ya-existe',
        `Ya existe un código de descuento con el texto ${code}. El texto de un código no se reutiliza.`
      )
    }

    throw error
  }
}
