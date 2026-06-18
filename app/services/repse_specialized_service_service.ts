import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import RepseSpecializedService, {
  type RepseSpecializedServiceStatus,
} from '#models/repse_specialized_service'
import { REPSE_SPECIALIZED_SERVICE_ERROR_CODES } from '../constants/repse_specialized_service_error_codes.js'
import { RepseSpecializedServiceError } from '../exceptions/repse_specialized_service_error.js'
import {
  findRegistrationInTenantOrFail,
  getAllowedBusinessUnitIds,
} from '../helpers/repse_tenant_scope.js'

export interface RepseSpecializedServiceCreatePayload {
  repseRegistrationId: number
  name: string
  objectDescription: string
  status?: RepseSpecializedServiceStatus
}

export type RepseSpecializedServiceUpdatePayload =
  Partial<RepseSpecializedServiceCreatePayload>

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
function serializeRepseSpecializedService(row: RepseSpecializedService) {
  return {
    repseSpecializedServiceId: row.repseSpecializedServiceId,
    repseRegistrationId: row.repseRegistrationId,
    name: row.name,
    objectDescription: row.objectDescription,
    status: row.status,
    repseSpecializedServiceCreatedAt: toIsoDateTimeString(row.repseSpecializedServiceCreatedAt),
    repseSpecializedServiceUpdatedAt: toIsoDateTimeString(row.repseSpecializedServiceUpdatedAt),
  }
}

/**
 * Servicio de dominio del catálogo de servicios especializados REPSE.
 *
 * - Cada registro vive colgando de un `RepseRegistration` (parent) que a su
 *   vez pertenece a una `BusinessUnit`.
 * - Aísla por tenant heredando del padre: cada operación valida que el
 *   `repse_registration_id` involucrado pertenezca a una empresa autorizada
 *   por el slug declarado en `SYSTEM_BUSINESS` (vía
 *   `findRegistrationInTenantOrFail`).
 * - Las reglas no especificadas explícitamente por la HU se mantienen al
 *   mínimo: `name` obligatorio (3–150), `objectDescription` obligatorio,
 *   `status` opcional con default `active`.
 */
export default class RepseSpecializedServiceService {
  /**
   * Lista paginada de servicios especializados de un registro REPSE.
   * Orden: `repse_specialized_service_created_at DESC`.
   */
  async listByRepseRegistration(page: number, limit: number, repseRegistrationId: number) {
    const safeLimit = Math.min(Math.max(limit, 1), 500)
    const safePage = Math.max(page, 1)

    await findRegistrationInTenantOrFail(repseRegistrationId, 'registro-repse-no-encontrado')

    const paginator = await RepseSpecializedService.query()
      .whereNull('repse_specialized_service_deleted_at')
      .where('repse_registration_id', repseRegistrationId)
      .orderBy('repse_specialized_service_created_at', 'desc')
      .paginate(safePage, safeLimit)

    const meta = paginator.serialize().meta
    return {
      meta,
      data: paginator.all().map((row) => serializeRepseSpecializedService(row)),
    }
  }

  /**
   * Recupera un servicio especializado por id validando que su registro
   * REPSE padre pertenezca al tenant actual. Lanza 404 si no existe o si
   * vive en otro tenant.
   */
  async findById(repseSpecializedServiceId: number) {
    const row = await this.findServiceInTenantOrFail(repseSpecializedServiceId)
    return serializeRepseSpecializedService(row)
  }

  /**
   * Crea un servicio especializado bajo un registro REPSE existente del
   * tenant actual.
   *
   * Valida unicidad del `name` dentro de la empresa (`business_unit_id`):
   * dos empresas distintas pueden tener servicios con el mismo nombre,
   * pero dentro de la misma empresa no se permiten duplicados (ignora
   * mayúsculas, espacios sobrantes y filas soft-deleted).
   */
  async create(payload: RepseSpecializedServiceCreatePayload) {
    const parent = await findRegistrationInTenantOrFail(
      payload.repseRegistrationId,
      'registro-repse-no-encontrado'
    )

    const normalizedName = payload.name.trim()
    const normalizedDescription = payload.objectDescription.trim()

    await this.assertNoNameDuplicate(parent.businessUnitId, normalizedName)

    const row = await db.transaction(async (trx) => {
      const created = new RepseSpecializedService()
      created.repseRegistrationId = payload.repseRegistrationId
      created.name = normalizedName
      created.objectDescription = normalizedDescription
      created.status = payload.status ?? 'active'
      created.useTransaction(trx)
      await created.save()
      return created
    })

    await row.refresh()
    return serializeRepseSpecializedService(row)
  }

  /**
   * Actualización parcial. Los campos no enviados conservan su valor. Si se
   * envía un `repseRegistrationId` distinto, se revalida que el nuevo padre
   * pertenezca al tenant actual.
   *
   * Cuando cambia `name`, `repseRegistrationId` o ambos, se revalida la
   * unicidad del nombre dentro de la empresa destino (`business_unit_id`),
   * excluyendo al propio registro para no chocar consigo mismo.
   */
  async update(
    repseSpecializedServiceId: number,
    payload: RepseSpecializedServiceUpdatePayload
  ) {
    const current = await this.findServiceInTenantOrFail(repseSpecializedServiceId)

    const targetRegistrationId = payload.repseRegistrationId ?? current.repseRegistrationId
    const registrationChanged =
      payload.repseRegistrationId !== undefined &&
      payload.repseRegistrationId !== current.repseRegistrationId

    let targetBusinessUnitId: number
    if (registrationChanged) {
      const newParent = await findRegistrationInTenantOrFail(
        targetRegistrationId,
        'registro-repse-no-encontrado'
      )
      targetBusinessUnitId = newParent.businessUnitId
    } else {
      const currentParent = await findRegistrationInTenantOrFail(
        current.repseRegistrationId,
        'registro-repse-no-encontrado'
      )
      targetBusinessUnitId = currentParent.businessUnitId
    }

    const targetName = payload.name !== undefined ? payload.name.trim() : current.name
    const targetDescription =
      payload.objectDescription !== undefined
        ? payload.objectDescription.trim()
        : current.objectDescription
    const targetStatus = payload.status ?? current.status

    const nameChanged = targetName !== current.name
    if (nameChanged || registrationChanged) {
      await this.assertNoNameDuplicate(
        targetBusinessUnitId,
        targetName,
        repseSpecializedServiceId
      )
    }

    const updated = await db.transaction(async (trx) => {
      current.repseRegistrationId = targetRegistrationId
      current.name = targetName
      current.objectDescription = targetDescription
      current.status = targetStatus
      current.repseSpecializedServiceUpdatedAt = DateTime.now()
      current.useTransaction(trx)
      await current.save()
      return current
    })

    await updated.refresh()
    return serializeRepseSpecializedService(updated)
  }

  /** Soft delete del servicio especializado. */
  async destroy(repseSpecializedServiceId: number) {
    return db.transaction(async (trx) => {
      const allowed = await getAllowedBusinessUnitIds()
      if (allowed.length === 0) {
        throw new RepseSpecializedServiceError(
          'El servicio especializado no existe o no pertenece al tenant actual.',
          REPSE_SPECIALIZED_SERVICE_ERROR_CODES.SVC_NOT_FOUND,
          404,
          'servicio-especializado-no-encontrado'
        )
      }

      const row = await RepseSpecializedService.query({ client: trx })
        .where('repse_specialized_service_id', repseSpecializedServiceId)
        .whereNull('repse_specialized_service_deleted_at')
        .whereHas('repseRegistration', (parentQuery) => {
          parentQuery
            .whereNull('repse_registration_deleted_at')
            .whereIn('business_unit_id', allowed)
        })
        .forUpdate()
        .first()

      if (!row) {
        throw new RepseSpecializedServiceError(
          'El servicio especializado no existe o no pertenece al tenant actual.',
          REPSE_SPECIALIZED_SERVICE_ERROR_CODES.SVC_NOT_FOUND,
          404,
          'servicio-especializado-no-encontrado'
        )
      }

      const blocking = await trx
        .from('contrato_servicio_repse')
        .join(
          'contratos_servicios_especializados',
          'contrato_servicio_repse.contrato_servicio_especializado_id',
          'contratos_servicios_especializados.contrato_servicio_especializado_id'
        )
        .where(
          'contrato_servicio_repse.repse_specialized_service_id',
          repseSpecializedServiceId
        )
        .whereNull('contratos_servicios_especializados.contrato_servicio_especializado_deleted_at')
        .select('contratos_servicios_especializados.contrato_servicio_especializado_id')
        .forUpdate()
        .limit(1)

      if (blocking.length > 0) {
        throw new RepseSpecializedServiceError(
          'No se puede eliminar el servicio mientras esté vinculado a contratos activos.',
          REPSE_SPECIALIZED_SERVICE_ERROR_CODES.LINKED_ACTIVE_CONTRATOS,
          409,
          'servicio-con-contratos-activos'
        )
      }

      const snapshot = serializeRepseSpecializedService(row)
      row.useTransaction(trx)
      await row.delete()
      return snapshot
    })
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  /**
   * Recupera un servicio especializado no borrado lógicamente cuyo registro
   * REPSE padre pertenezca al tenant actual.
   *
   * Hacemos un JOIN con `repse_registrations` para garantizar que el padre
   * sigue vivo (no soft-deleted) y que vive bajo una `business_unit_id`
   * autorizada por el tenant.
   */
  private async findServiceInTenantOrFail(repseSpecializedServiceId: number) {
    const allowed = await getAllowedBusinessUnitIds()
    if (allowed.length === 0) {
      throw new RepseSpecializedServiceError(
        'El servicio especializado no existe o no pertenece al tenant actual.',
        REPSE_SPECIALIZED_SERVICE_ERROR_CODES.SVC_NOT_FOUND,
        404,
        'servicio-especializado-no-encontrado'
      )
    }

    const row = await RepseSpecializedService.query()
      .where('repse_specialized_service_id', repseSpecializedServiceId)
      .whereNull('repse_specialized_service_deleted_at')
      .whereHas('repseRegistration', (parentQuery) => {
        parentQuery
          .whereNull('repse_registration_deleted_at')
          .whereIn('business_unit_id', allowed)
      })
      .first()

    if (!row) {
      throw new RepseSpecializedServiceError(
        'El servicio especializado no existe o no pertenece al tenant actual.',
        REPSE_SPECIALIZED_SERVICE_ERROR_CODES.SVC_NOT_FOUND,
        404,
        'servicio-especializado-no-encontrado'
      )
    }
    return row
  }

  /**
   * Verifica que no exista otro servicio especializado activo con el mismo
   * nombre dentro de la misma empresa (`business_unit_id`).
   *
   * - Comparación case-insensitive y con `trim()` para evitar duplicados
   *   disfrazados ("Guardia de seguridad" vs "guardia de seguridad ").
   * - Excluye filas soft-deleted (`repse_specialized_service_deleted_at IS
   *   NULL`) y servicios cuyo padre esté soft-deleted, para permitir reuso
   *   del nombre tras eliminar lógicamente.
   * - `excludeId` se usa en `update()` para no chocar con uno mismo.
   *
   * Empresas distintas (`business_unit_id` distinto) pueden tener servicios
   * con el mismo nombre; la regla acota la unicidad al ámbito de la empresa,
   * no al registro REPSE individual.
   */
  private async assertNoNameDuplicate(
    businessUnitId: number,
    name: string,
    excludeId?: number
  ) {
    const normalized = name.trim().toLowerCase()
    let query = RepseSpecializedService.query()
      .whereNull('repse_specialized_service_deleted_at')
      .whereRaw('LOWER(TRIM(repse_specialized_service_name)) = ?', [normalized])
      .whereHas('repseRegistration', (parentQuery) => {
        parentQuery
          .whereNull('repse_registration_deleted_at')
          .where('business_unit_id', businessUnitId)
      })

    if (excludeId !== undefined) {
      query = query.whereNot('repse_specialized_service_id', excludeId)
    }

    const conflict = await query.first()
    if (conflict) {
      throw new RepseSpecializedServiceError(
        'Ya existe un servicio especializado con ese nombre para esta empresa.',
        REPSE_SPECIALIZED_SERVICE_ERROR_CODES.NAME_DUPLICATE,
        409,
        'nombre-servicio-especializado-ya-registrado'
      )
    }
  }
}

export { serializeRepseSpecializedService }
