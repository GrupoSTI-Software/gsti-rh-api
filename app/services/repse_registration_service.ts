import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import RepseRegistration, { type RepseRegistrationStatus } from '#models/repse_registration'
import { REPSE_ERROR_CODES } from '../constants/repse_registration_error_codes.js'
import { RepseRegistrationError } from '../exceptions/repse_registration_error.js'
import {
  assertBusinessUnitInTenant,
  findRegistrationInTenantOrFail,
} from '../helpers/repse_tenant_scope.js'

export interface RepseRegistrationCreatePayload {
  businessUnitId: number
  folio: string
  registeredAt: string
  expiresAt: string
  status?: RepseRegistrationStatus
}

export type RepseRegistrationUpdatePayload = Partial<RepseRegistrationCreatePayload>

/**
 * Convierte un valor de fecha (Luxon `DateTime`, JS `Date` o string) a
 * `YYYY-MM-DD`. Devuelve `null` si el valor es nulo o no parseable.
 */
function toIsoDateString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (DateTime.isDateTime(value)) {
    return (value as DateTime).toISODate()
  }
  if (value instanceof Date) {
    return DateTime.fromJSDate(value).toISODate()
  }
  if (typeof value === 'string') {
    const direct = value.length >= 10 ? value.substring(0, 10) : value
    const parsed = DateTime.fromISO(value)
    return parsed.isValid ? parsed.toISODate() : direct
  }
  return null
}

/** Convierte timestamps a ISO completo. Acepta `DateTime`, `Date` o string. */
function toIsoDateTimeString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (DateTime.isDateTime(value)) {
    return (value as DateTime).toISO()
  }
  if (value instanceof Date) {
    return DateTime.fromJSDate(value).toISO()
  }
  if (typeof value === 'string') {
    return value
  }
  return null
}

/** Estructura final que se entrega al cliente HTTP. */
function serializeRepseRegistration(row: RepseRegistration) {
  return {
    repseRegistrationId: row.repseRegistrationId,
    businessUnitId: row.businessUnitId,
    folio: row.folio,
    registeredAt: toIsoDateString(row.registeredAt),
    expiresAt: toIsoDateString(row.expiresAt),
    status: row.status,
    repseRegistrationCreatedAt: toIsoDateTimeString(row.repseRegistrationCreatedAt),
    repseRegistrationUpdatedAt: toIsoDateTimeString(row.repseRegistrationUpdatedAt),
  }
}

/**
 * Servicio de dominio del catálogo Repse.
 *
 * - Aísla por empresa multitenant: cada operación valida que el
 *   `business_unit_id` solicitado pertenezca al conjunto activo del tenant
 *   (slugs declarados en `SYSTEM_BUSINESS`).
 * - Aplica las reglas de negocio: folio único por empresa (sólo entre
 *   registros activos) y `expiresAt > registeredAt`.
 */
export default class RepseRegistrationService {
  /**
   * Lista paginada de Repse de una empresa específica.
   * Orden: `repse_registration_registered_at DESC`.
   */
  async listByBusinessUnit(page: number, limit: number, businessUnitId: number) {
    const safeLimit = Math.min(Math.max(limit, 1), 500)
    const safePage = Math.max(page, 1)

    await assertBusinessUnitInTenant(businessUnitId)

    const paginator = await RepseRegistration.query()
      .whereNull('repse_registration_deleted_at')
      .where('business_unit_id', businessUnitId)
      .orderBy('repse_registration_registered_at', 'desc')
      .paginate(safePage, safeLimit)

    const meta = paginator.serialize().meta
    return {
      meta,
      data: paginator.all().map((row) => serializeRepseRegistration(row)),
    }
  }

  /**
   * Recupera un registro REPSE por id, validando que pertenezca al tenant
   * actual. Lanza 404 cuando no existe o vive en otra empresa.
   */
  async findById(repseRegistrationId: number) {
    const row = await findRegistrationInTenantOrFail(repseRegistrationId)
    return serializeRepseRegistration(row)
  }

  /**
   * Crea un registro REPSE para una empresa del tenant actual.
   * Valida tenant, coherencia de fechas y unicidad del folio.
   */
  async create(payload: RepseRegistrationCreatePayload) {
    await assertBusinessUnitInTenant(payload.businessUnitId)

    const registeredAt = this.parseDate(payload.registeredAt)
    const expiresAt = this.parseDate(payload.expiresAt)
    this.assertDateCoherence(registeredAt, expiresAt)

    const normalizedFolio = payload.folio.trim()
    await this.assertNoFolioDuplicate(payload.businessUnitId, normalizedFolio)

    const row = await db.transaction(async (trx) => {
      const created = new RepseRegistration()
      created.businessUnitId = payload.businessUnitId
      created.folio = normalizedFolio
      created.registeredAt = registeredAt
      created.expiresAt = expiresAt
      created.status = payload.status ?? 'active'
      created.useTransaction(trx)
      await created.save()
      return created
    })

    await row.refresh()
    return serializeRepseRegistration(row)
  }

  /**
   * Actualiza un registro REPSE. Soporta edición parcial: los campos no
   * enviados conservan su valor actual; tanto la coherencia de fechas como
   * la unicidad del folio se evalúan sobre el estado fusionado.
   */
  async update(repseRegistrationId: number, payload: RepseRegistrationUpdatePayload) {
    const current = await findRegistrationInTenantOrFail(repseRegistrationId)

    const targetBusinessUnitId = payload.businessUnitId ?? current.businessUnitId
    if (payload.businessUnitId !== undefined && payload.businessUnitId !== current.businessUnitId) {
      await assertBusinessUnitInTenant(targetBusinessUnitId)
    }

    const registeredAt =
      payload.registeredAt !== undefined ? this.parseDate(payload.registeredAt) : current.registeredAt
    const expiresAt =
      payload.expiresAt !== undefined ? this.parseDate(payload.expiresAt) : current.expiresAt
    this.assertDateCoherence(registeredAt, expiresAt)

    const targetFolio = payload.folio !== undefined ? payload.folio.trim() : current.folio
    const folioChanged =
      targetFolio !== current.folio || targetBusinessUnitId !== current.businessUnitId
    if (folioChanged) {
      await this.assertNoFolioDuplicate(targetBusinessUnitId, targetFolio, repseRegistrationId)
    }

    const targetStatus = payload.status ?? current.status

    const updated = await db.transaction(async (trx) => {
      current.businessUnitId = targetBusinessUnitId
      current.folio = targetFolio
      current.registeredAt = registeredAt
      current.expiresAt = expiresAt
      current.status = targetStatus
      current.repseRegistrationUpdatedAt = DateTime.now()
      current.useTransaction(trx)
      await current.save()
      return current
    })

    await updated.refresh()
    return serializeRepseRegistration(updated)
  }

  /** Soft delete del registro REPSE. */
  async destroy(repseRegistrationId: number) {
    const row = await findRegistrationInTenantOrFail(repseRegistrationId)
    await row.delete()
    return serializeRepseRegistration(row)
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  /**
   * Verifica que no exista otro registro activo con el mismo folio para la
   * misma empresa. Es case-insensitive y normaliza espacios para evitar
   * duplicados disfrazados.
   */
  private async assertNoFolioDuplicate(
    businessUnitId: number,
    folio: string,
    excludeId?: number
  ) {
    const normalized = folio.trim().toLowerCase()
    let query = RepseRegistration.query()
      .where('business_unit_id', businessUnitId)
      .whereNull('repse_registration_deleted_at')
      .whereRaw('LOWER(TRIM(repse_registration_folio)) = ?', [normalized])

    if (excludeId !== undefined) {
      query = query.whereNot('repse_registration_id', excludeId)
    }

    const conflict = await query.first()
    if (conflict) {
      throw new RepseRegistrationError(
        'El folio REPSE ya está registrado para esta empresa.',
        REPSE_ERROR_CODES.FOLIO_DUPLICATE,
        409,
        'folio-repse-ya-registrado'
      )
    }
  }

  /** `expiresAt` debe ser estrictamente posterior a `registeredAt`. */
  private assertDateCoherence(registeredAt: DateTime, expiresAt: DateTime) {
    if (!registeredAt.isValid || !expiresAt.isValid) {
      throw new RepseRegistrationError(
        'Las fechas del registro REPSE son inválidas.',
        REPSE_ERROR_CODES.DATE_FORMAT_INVALID,
        400,
        'fechas-invalidas'
      )
    }
    if (expiresAt <= registeredAt) {
      throw new RepseRegistrationError(
        'La fecha de vencimiento debe ser posterior a la de registro.',
        REPSE_ERROR_CODES.DATE_RANGE_INVALID,
        400,
        'fechas-invalidas'
      )
    }
  }

  private parseDate(value: string | DateTime): DateTime {
    if (DateTime.isDateTime(value)) {
      return value as DateTime
    }
    const parsed = DateTime.fromISO(String(value))
    if (!parsed.isValid) {
      throw new RepseRegistrationError(
        'Las fechas del registro REPSE son inválidas.',
        REPSE_ERROR_CODES.DATE_FORMAT_INVALID,
        400,
        'fechas-invalidas'
      )
    }
    return parsed
  }
}

export { serializeRepseRegistration }
