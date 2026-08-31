import DiscountCode, { type DiscountCodeKind } from '#models/discount_code'
import { DISCOUNT_CODE_ERROR_CODES } from '#constants/discount_code_error_codes'
import { DiscountCodeServiceError } from '#exceptions/discount_code_service_error'
import { isBusinessCalendarDateBefore } from '#utils/business_date'

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
