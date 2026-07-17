import { DateTime } from 'luxon'
import ProveedorRepse from '#models/proveedor_repse'
import ProveedorRepseValidacion from '#models/proveedor_repse_validacion'
import { REPSE_PROVIDER_ERROR_CODES } from '#constants/repse_provider_error_codes'
import { RepseProviderError } from '#exceptions/repse_provider_error'
import { normalizeRfc } from '../../../shared/validators/rfc.validator.js'
import { blindIndex } from '#utils/blind_index'
import {
  assertBusinessUnitInTenant,
  findProveedorRepseInTenantOrFail,
  getAllowedBusinessUnitIds,
} from '../tenant_scope.js'
import {
  parseBusinessCalendarDate,
  toBusinessCalendarDate,
  todayInBusinessZone,
} from '../repse_provider_dates.js'
import ProvidersRepositoryMysql from './providers.repository.mysql.js'
import type { ProvidersRepository } from './providers.repository.js'
import type { ProveedorRepseDto, ProveedorRepseListDto, ProveedorRepseReviewStatus } from './dto/providers.dto.js'

export interface ProveedorRepseCreateInput {
  businessUnitId: number
  razonSocial: string
  rfc: string
  folio: string
  objetoRegistrado: string
  folioVencimiento: string
  periodicidadMeses?: number
}

export type ProveedorRepseUpdateInput = Partial<ProveedorRepseCreateInput>

/** Ventana (en días) para marcar una revisión como "próxima a vencer" en el indicador MVP. */
export const DUE_SOON_WINDOW_DAYS = 7

export default class ProvidersService {
  private readonly repository: ProvidersRepository

  constructor(repository: ProvidersRepository = new ProvidersRepositoryMysql()) {
    this.repository = repository
  }

  async listByTenant(page: number, limit: number, businessUnitId?: number): Promise<ProveedorRepseListDto> {
    const safeLimit = Math.min(Math.max(limit, 1), 500)
    const safePage = Math.max(page, 1)

    const targetBusinessUnitIds = await this.resolveTargetBusinessUnitIds(businessUnitId)

    const bundle = await this.repository.listPaginated(safePage, safeLimit, targetBusinessUnitIds)
    return {
      meta: bundle.meta,
      data: bundle.data.map((row) => this.serialize(row)),
    }
  }

  async findById(proveedorRepseId: number): Promise<ProveedorRepseDto> {
    const row = await findProveedorRepseInTenantOrFail(proveedorRepseId)
    return this.serialize(row)
  }

  async create(input: ProveedorRepseCreateInput): Promise<ProveedorRepseDto> {
    await assertBusinessUnitInTenant(input.businessUnitId)

    const normalizedRfc = this.parseRfc(input.rfc)
    const normalizedFolio = this.parseFolio(input.folio)
    const folioVencimiento = this.parseDate(input.folioVencimiento)
    this.assertFolioVencimientoNotExpired(folioVencimiento)
    const periodicidadMeses = this.parsePeriodicidad(input.periodicidadMeses)

    await this.assertNoFolioDuplicate(input.businessUnitId, normalizedFolio)

    const row = await this.repository.create({
      businessUnitId: input.businessUnitId,
      razonSocial: input.razonSocial.trim(),
      rfc: normalizedRfc,
      rfcHash: blindIndex(normalizedRfc),
      folio: normalizedFolio,
      objetoRegistrado: input.objetoRegistrado.trim(),
      folioVencimiento,
      periodicidadMeses,
    })

    return this.serialize(row)
  }

  async update(
    proveedorRepseId: number,
    input: ProveedorRepseUpdateInput
  ): Promise<ProveedorRepseDto> {
    const current = await findProveedorRepseInTenantOrFail(proveedorRepseId)

    const targetBusinessUnitId = input.businessUnitId ?? current.businessUnitId
    if (input.businessUnitId !== undefined && input.businessUnitId !== current.businessUnitId) {
      await assertBusinessUnitInTenant(targetBusinessUnitId)
    }

    const targetFolio =
      input.folio !== undefined ? this.parseFolio(input.folio) : current.folio
    const folioChanged =
      targetFolio !== current.folio || targetBusinessUnitId !== current.businessUnitId
    if (folioChanged) {
      await this.assertNoFolioDuplicate(targetBusinessUnitId, targetFolio, proveedorRepseId)
    }

    const targetRfc = input.rfc !== undefined ? this.parseRfc(input.rfc) : current.rfc ?? undefined

    let targetFolioVencimiento: DateTime | undefined
    if (input.folioVencimiento !== undefined) {
      targetFolioVencimiento = this.parseDate(input.folioVencimiento)
      this.assertFolioVencimientoNotExpired(targetFolioVencimiento)
    }

    const targetPeriodicidadMeses =
      input.periodicidadMeses !== undefined ? this.parsePeriodicidad(input.periodicidadMeses) : undefined
    const periodicidadChanged =
      targetPeriodicidadMeses !== undefined && targetPeriodicidadMeses !== current.periodicidadMeses

    const row = await this.repository.update(proveedorRepseId, {
      businessUnitId: input.businessUnitId,
      razonSocial: input.razonSocial?.trim(),
      rfc: targetRfc,
      rfcHash: targetRfc !== undefined ? blindIndex(targetRfc) : undefined,
      folio: targetFolio,
      objetoRegistrado: input.objetoRegistrado?.trim(),
      folioVencimiento: targetFolioVencimiento,
      periodicidadMeses: targetPeriodicidadMeses,
    })

    if (periodicidadChanged) {
      const recalculated = await this.recalculateNextReviewAtForNewPeriodicidad(
        proveedorRepseId,
        row.periodicidadMeses
      )
      if (recalculated) {
        await this.repository.updateNextReviewAt(proveedorRepseId, recalculated)
        row.nextReviewAt = recalculated
      }
    }

    return this.serialize(row)
  }

  async destroy(proveedorRepseId: number): Promise<ProveedorRepseDto> {
    const row = await findProveedorRepseInTenantOrFail(proveedorRepseId)
    await this.repository.softDelete(proveedorRepseId)
    return this.serialize(row)
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  private async resolveTargetBusinessUnitIds(businessUnitId?: number): Promise<number[]> {
    if (businessUnitId !== undefined) {
      await assertBusinessUnitInTenant(businessUnitId)
      return [businessUnitId]
    }
    return getAllowedBusinessUnitIds()
  }

  private async assertNoFolioDuplicate(
    businessUnitId: number,
    folio: string,
    excludeId?: number
  ) {
    const conflict = await this.repository.findActiveByFolio(businessUnitId, folio, excludeId)
    if (conflict) {
      throw new RepseProviderError(
        'El folio del proveedor REPSE ya está registrado para esta empresa.',
        REPSE_PROVIDER_ERROR_CODES.FOLIO_DUPLICATE,
        409,
        'folio-proveedor-repse-ya-registrado'
      )
    }
  }

  /**
   * Normaliza el RFC. El formato SAT ya se valida en la capa Vine
   * (`rfcSatField`, `validators/create_provider.validator.ts`); aquí solo se
   * garantiza la normalización usada para cifrar y calcular el blind index.
   */
  private parseRfc(value: string): string {
    return normalizeRfc(value)
  }

  private parseFolio(value: string): string {
    const trimmed = value.trim()
    if (trimmed.length === 0) {
      throw new RepseProviderError(
        'El folio del proveedor REPSE es obligatorio.',
        REPSE_PROVIDER_ERROR_CODES.VAL_INPUT,
        422,
        'entrada-invalida'
      )
    }
    return trimmed
  }

  /** Parsea `folioVencimiento` como fecha de calendario en la zona de negocio (ver `repse_provider_dates.ts`). */
  private parseDate(value: string | DateTime): DateTime {
    if (DateTime.isDateTime(value)) {
      return toBusinessCalendarDate(value)
    }
    const parsed = parseBusinessCalendarDate(String(value))
    if (!parsed.isValid) {
      throw new RepseProviderError(
        'La fecha de vencimiento del folio es inválida.',
        REPSE_PROVIDER_ERROR_CODES.DATE_INVALID,
        422,
        'fecha-invalida'
      )
    }
    return parsed
  }

  /**
   * El folio debe estar vigente al momento de registrarlo/actualizarlo: un
   * proveedor con folio ya vencido ante la STPS no debería poder catalogarse
   * (o mantenerse) como vigente. Regla explícita de la HU USRH1784259105646.
   */
  private assertFolioVencimientoNotExpired(folioVencimiento: DateTime) {
    if (folioVencimiento < todayInBusinessZone()) {
      throw new RepseProviderError(
        'La fecha de vencimiento del folio no puede ser anterior a hoy.',
        REPSE_PROVIDER_ERROR_CODES.DATE_INVALID,
        422,
        'folio-vencimiento-pasado'
      )
    }
  }

  /**
   * Al cambiar `periodicidadMeses` el `nextReviewAt` vigente quedaría
   * calculado con la periodicidad anterior. Se recalcula a partir de la
   * fecha de la última validación registrada (fuente de verdad), no por
   * aritmética sobre `nextReviewAt` (evita drift por meses de distinta
   * longitud). Si el proveedor no tiene ninguna validación, no hay nada que
   * recalcular (sigue en `pending_first_validation`).
   */
  private async recalculateNextReviewAtForNewPeriodicidad(
    proveedorRepseId: number,
    periodicidadMeses: number
  ): Promise<DateTime | null> {
    const lastValidation = await ProveedorRepseValidacion.query()
      .where('proveedor_repse_id', proveedorRepseId)
      .orderBy('proveedor_repse_validacion_fecha', 'desc')
      .orderBy('proveedor_repse_validacion_id', 'desc')
      .first()

    if (!lastValidation) return null
    return toBusinessCalendarDate(lastValidation.fecha).plus({ months: periodicidadMeses })
  }

  private parsePeriodicidad(value: number | undefined): number {
    if (value === undefined) return 1
    if (!Number.isInteger(value) || value < 1) {
      throw new RepseProviderError(
        'La periodicidad de validación debe ser un número entero de meses mayor o igual a 1.',
        REPSE_PROVIDER_ERROR_CODES.VAL_INPUT,
        422,
        'entrada-invalida'
      )
    }
    return value
  }

  /**
   * El folio vencido "en la realidad" (ante la STPS) es la señal más grave:
   * gana sobre el ciclo de validaciones internas aunque `nextReviewAt` todavía
   * no llegue a su fecha. Sin este chequeo, un proveedor con folio ya vencido
   * podía mostrarse como `on_track` mientras no le tocara su próxima revisión
   * periódica — contradice el propósito del indicador.
   */
  private resolveReviewStatus(
    nextReviewAt: DateTime | null,
    folioVencimiento: DateTime
  ): ProveedorRepseReviewStatus {
    const today = todayInBusinessZone()

    if (toBusinessCalendarDate(folioVencimiento) < today) {
      return 'overdue'
    }
    if (!nextReviewAt) {
      return 'pending_first_validation'
    }
    const target = toBusinessCalendarDate(nextReviewAt)
    if (target < today) {
      return 'overdue'
    }
    const daysUntilDue = target.diff(today, 'days').days
    if (daysUntilDue <= DUE_SOON_WINDOW_DAYS) {
      return 'due_soon'
    }
    return 'on_track'
  }

  private serialize(row: ProveedorRepse): ProveedorRepseDto {
    return {
      proveedorRepseId: row.proveedorRepseId,
      businessUnitId: row.businessUnitId,
      razonSocial: row.razonSocial,
      rfc: row.rfc ?? '',
      folio: row.folio,
      objetoRegistrado: row.objetoRegistrado,
      folioVencimiento: row.folioVencimiento.toISODate()!,
      periodicidadMeses: row.periodicidadMeses,
      nextReviewAt: row.nextReviewAt ? row.nextReviewAt.toISODate() : null,
      reviewStatus: this.resolveReviewStatus(row.nextReviewAt, row.folioVencimiento),
      proveedorRepseCreatedAt: row.createdAt ? row.createdAt.toISO() : null,
      proveedorRepseUpdatedAt: row.updatedAt ? row.updatedAt.toISO() : null,
    }
  }
}
