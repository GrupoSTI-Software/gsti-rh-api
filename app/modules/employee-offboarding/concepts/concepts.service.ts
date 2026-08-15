import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type { I18n } from '@adonisjs/i18n'
import type OffboardingConcept from '#models/offboarding_concept'
import RoleService from '#services/role_service'
import EmployeeOffboardingServiceError from '#exceptions/employee_offboarding_service_error'
import { EMPLOYEE_OFFBOARDING_ERROR_CODES } from '#constants/employee_offboarding_error_codes'
import { normalizeForSearch } from '#utils/org_alias_normalize'
import {
  EMPLOYEE_OFFBOARDINGS_MODULE_SLUG,
  OFFBOARDING_BASE_CONCEPTS,
  OFFBOARDING_CONCEPT_SOURCE,
  type OffboardingConceptSource,
} from './concepts.constants.js'
import ConceptsRepositoryMysql from './concepts.repository.mysql.js'
import type { ConceptsRepository } from './concepts.repository.js'
import { toOffboardingConceptDto, type OffboardingConceptDto } from './dto/concepts.dto.js'

/** Acciones del módulo `employee-offboardings` sembradas por el seeder 0055. */
export type EmployeeOffboardingAction = 'read' | 'create' | 'update' | 'delete'

export interface OffboardingConceptCreateInput {
  offboardingConceptName: string
  offboardingConceptDescription?: string | null
  offboardingConceptRequiresEvidence?: boolean
  offboardingConceptAllowsAmount?: boolean
  /**
   * Solo para uso interno del módulo (la siembra y las historias hermanas):
   * el endpoint de creación NO acepta este campo — todo concepto creado por
   * el usuario nace 'manual' (CA-6).
   */
  offboardingConceptSource?: OffboardingConceptSource
}

export interface OffboardingConceptUpdateInput {
  offboardingConceptName: string
  offboardingConceptDescription?: string | null
  offboardingConceptRequiresEvidence?: boolean
  offboardingConceptAllowsAmount?: boolean
}

/**
 * Reglas de negocio del catálogo de conceptos de salida (USRH1786568279581).
 * Toda la lógica vive aquí: siembra perezosa serializada por empresa (reglas
 * 2 y 3), unicidad de nombre normalizado (regla 4), protección del concepto
 * derivado del inventario (regla 6), colocación al final de la lista (regla
 * 7), baja lógica (regla 8) y permiso del módulo (regla 9).
 */
export default class ConceptsService {
  private t: (key: string, params?: { [key: string]: string | number }) => string
  private readonly repository: ConceptsRepository

  constructor(i18n: I18n, repository: ConceptsRepository = new ConceptsRepositoryMysql()) {
    this.t = i18n.formatMessage.bind(i18n)
    this.repository = repository
  }

  /**
   * Regla 9 — permiso granular sobre el módulo `employee-offboardings`.
   * `root` y `owner` hacen bypass dentro de `RoleService.hasAccess`.
   */
  async assertCanAccess(roleId: number | null | undefined, action: EmployeeOffboardingAction) {
    const forbidden = () =>
      new EmployeeOffboardingServiceError({
        key: 'sin-permiso',
        errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.FORBIDDEN,
        httpStatus: 403,
        title: this.t('employee_offboarding_forbidden_title'),
        detail: this.t('employee_offboarding_forbidden_message'),
      })

    if (!roleId) {
      throw forbidden()
    }

    const roleService = new RoleService()
    const hasAccess = await roleService.hasAccess(
      roleId,
      EMPLOYEE_OFFBOARDINGS_MODULE_SLUG,
      action
    )
    if (!hasAccess) {
      throw forbidden()
    }
  }

  /**
   * Lista del catálogo de la empresa activa. Dispara la siembra perezosa en
   * la MISMA transacción (CA-1); si la unidad no se resuelve, no siembra y
   * devuelve lista vacía.
   */
  async list(businessUnitScope: number[]): Promise<OffboardingConceptDto[]> {
    const [businessUnitId] = businessUnitScope
    if (!businessUnitId) {
      return []
    }

    const concepts = await db.transaction(async (trx) => {
      await this.ensureSeeded(businessUnitId, trx)
      return await this.repository.listLiveOrdered(businessUnitId, trx)
    })

    return concepts.map((concept) => toOffboardingConceptDto(concept))
  }

  async show(
    offboardingConceptId: number,
    businessUnitScope: number[]
  ): Promise<OffboardingConceptDto> {
    const concept = await this.repository.findLiveByIdInScope(
      offboardingConceptId,
      businessUnitScope
    )
    if (!concept) {
      throw this.notFoundError()
    }
    return toOffboardingConceptDto(concept)
  }

  /** Alta al final de la lista (regla 7) sobre filas bloqueadas (CA-7). */
  async create(
    input: OffboardingConceptCreateInput,
    businessUnitScope: number[]
  ): Promise<OffboardingConceptDto> {
    const [businessUnitId] = businessUnitScope
    await this.verifyBusinessUnit(businessUnitId, businessUnitScope)

    const source = input.offboardingConceptSource ?? OFFBOARDING_CONCEPT_SOURCE.MANUAL

    const created = await db.transaction(async (trx) => {
      const siblings = await this.repository.lockLiveByBusinessUnit(businessUnitId!, trx)
      this.assertNameAvailable(siblings, input.offboardingConceptName)
      if (source === OFFBOARDING_CONCEPT_SOURCE.EMPLOYEE_SUPPLIES) {
        this.assertDerivedSourceAvailable(siblings)
      }

      const maxOrder = siblings.reduce(
        (max, concept) => Math.max(max, concept.offboardingConceptOrder),
        0
      )

      return await this.repository.create(
        {
          businessUnitId: businessUnitId!,
          offboardingConceptName: input.offboardingConceptName.trim(),
          offboardingConceptDescription: input.offboardingConceptDescription ?? null,
          offboardingConceptSource: source,
          offboardingConceptRequiresEvidence: input.offboardingConceptRequiresEvidence ?? false,
          offboardingConceptAllowsAmount: input.offboardingConceptAllowsAmount ?? false,
          offboardingConceptOrder: maxOrder + 1,
        },
        trx
      )
    })

    return toOffboardingConceptDto(created)
  }

  /**
   * Actualiza nombre, descripción, exigencia de comprobante y admisión de
   * importe. El concepto derivado acepta nombre, descripción y comprobante,
   * pero nunca importe (regla 6, CA-5); su `source` no se toca — el campo ni
   * siquiera existe en el input.
   */
  async update(
    offboardingConceptId: number,
    input: OffboardingConceptUpdateInput,
    businessUnitScope: number[]
  ): Promise<OffboardingConceptDto> {
    const updated = await db.transaction(async (trx) => {
      const concept = await this.repository.lockLiveByIdInScope(
        offboardingConceptId,
        businessUnitScope,
        trx
      )
      if (!concept) {
        throw this.notFoundError()
      }

      const siblings = await this.repository.lockLiveByBusinessUnit(concept.businessUnitId, trx)
      this.assertNameAvailable(siblings, input.offboardingConceptName, offboardingConceptId)

      const isDerived =
        concept.offboardingConceptSource === OFFBOARDING_CONCEPT_SOURCE.EMPLOYEE_SUPPLIES
      if (isDerived && input.offboardingConceptAllowsAmount === true) {
        throw this.sourceLockedError()
      }

      return await this.repository.update(
        concept,
        {
          offboardingConceptName: input.offboardingConceptName.trim(),
          offboardingConceptDescription:
            input.offboardingConceptDescription !== undefined
              ? input.offboardingConceptDescription
              : (concept.offboardingConceptDescription ?? null),
          offboardingConceptRequiresEvidence:
            input.offboardingConceptRequiresEvidence ??
            Boolean(concept.offboardingConceptRequiresEvidence),
          offboardingConceptAllowsAmount: isDerived
            ? false
            : (input.offboardingConceptAllowsAmount ??
              Boolean(concept.offboardingConceptAllowsAmount)),
        },
        trx
      )
    })

    return toOffboardingConceptDto(updated)
  }

  /**
   * Reordenamiento del catálogo completo, adelantado de USRH1786568279584
   * (drag & drop de las tarjetas). La lista debe cubrir exactamente todos
   * los conceptos vivos de la empresa — ids ajenos, duplicados o lista
   * incompleta responden 422 `orden-invalido`; se renumera 1..n dentro de
   * una transacción sobre filas bloqueadas (molde
   * `PositionLevelService.reorder`).
   */
  async reorder(
    orderedOffboardingConceptIds: number[],
    businessUnitScope: number[]
  ): Promise<OffboardingConceptDto[]> {
    const [businessUnitId] = businessUnitScope
    await this.verifyBusinessUnit(businessUnitId, businessUnitScope)

    const uniqueIds = new Set(orderedOffboardingConceptIds)
    if (uniqueIds.size !== orderedOffboardingConceptIds.length) {
      throw this.reorderInvalidError()
    }

    const ordered = await db.transaction(async (trx) => {
      const current = await this.repository.lockLiveByBusinessUnit(businessUnitId!, trx)
      const currentIds = new Set(current.map((concept) => concept.offboardingConceptId))
      const coversAll =
        current.length === orderedOffboardingConceptIds.length &&
        orderedOffboardingConceptIds.every((id) => currentIds.has(id))

      if (!coversAll) {
        throw this.reorderInvalidError()
      }

      const byId = new Map(current.map((concept) => [concept.offboardingConceptId, concept]))
      for (const [index, id] of orderedOffboardingConceptIds.entries()) {
        await this.repository.updateOrder(byId.get(id)!, index + 1, trx)
      }

      return orderedOffboardingConceptIds.map((id) => byId.get(id)!)
    })

    return ordered.map((concept) => toOffboardingConceptDto(concept))
  }

  /**
   * Baja lógica (regla 8): libera el nombre y conserva el registro. El
   * concepto derivado no se elimina (regla 6). Los supervivientes conservan
   * su orden; la renumeración sin huecos llega con USRH1786568279584.
   */
  async delete(
    offboardingConceptId: number,
    businessUnitScope: number[]
  ): Promise<OffboardingConceptDto> {
    const deleted = await db.transaction(async (trx) => {
      const concept = await this.repository.lockLiveByIdInScope(
        offboardingConceptId,
        businessUnitScope,
        trx
      )
      if (!concept) {
        throw this.notFoundError()
      }

      if (concept.offboardingConceptSource === OFFBOARDING_CONCEPT_SOURCE.EMPLOYEE_SUPPLIES) {
        throw this.sourceLockedError()
      }

      await this.repository.softDelete(concept, trx)
      return concept
    })

    return toOffboardingConceptDto(deleted)
  }

  /**
   * Siembra perezosa del conjunto base (reglas 2 y 3, CA-1/CA-2/CA-3):
   * 1. Bloquea la fila de `business_units` de la empresa (`forUpdate`) — la
   *    fila siempre existe, así que el bloqueo es determinista y serializa a
   *    las requests concurrentes; nunca un gap lock sobre rango vacío.
   * 2. Cuenta los conceptos de la empresa INCLUYENDO eliminados: mayor que
   *    cero = salir sin sembrar (respeta el catálogo vaciado a propósito).
   * 3. Con conteo cero inserta el conjunto base con orden 1..n en el mismo trx.
   * 4. Si la unidad no se resuelve, no siembra (el listado sale vacío).
   * La idempotencia la sostiene la guarda de conteo, no un firstOrCreate.
   */
  private async ensureSeeded(businessUnitId: number, trx: TransactionClientContract) {
    const businessUnit = await this.repository.lockBusinessUnit(businessUnitId, trx)
    if (!businessUnit) {
      return
    }

    const total = await this.repository.countIncludingDeleted(businessUnitId, trx)
    if (total > 0) {
      return
    }

    await this.repository.createMany(
      OFFBOARDING_BASE_CONCEPTS.map((concept, index) => ({
        businessUnitId,
        offboardingConceptName: concept.name,
        offboardingConceptDescription: null,
        offboardingConceptSource: concept.source,
        offboardingConceptRequiresEvidence: concept.requiresEvidence,
        offboardingConceptAllowsAmount: concept.allowsAmount,
        offboardingConceptOrder: index + 1,
      })),
      trx
    )
  }

  /**
   * La empresa debe existir, no estar eliminada y pertenecer al alcance
   * (defensa en profundidad; molde `PositionLevelService.verifyBusinessUnit`).
   */
  private async verifyBusinessUnit(
    businessUnitId: number | undefined,
    businessUnitScope: number[]
  ): Promise<void> {
    const refInvalid = () =>
      new EmployeeOffboardingServiceError({
        key: 'referencia-invalida',
        errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.REF_INVALID,
        httpStatus: 422,
        title: this.t('employee_offboarding_ref_invalid_title'),
        detail: this.t('employee_offboarding_ref_invalid_message'),
      })

    if (!businessUnitId || !businessUnitScope.includes(businessUnitId)) {
      throw refInvalid()
    }

    const businessUnit = await this.repository.findLiveBusinessUnit(businessUnitId)
    if (!businessUnit) {
      throw refInvalid()
    }
  }

  /**
   * Regla 4 — nombre único por empresa excluyendo eliminados, comparado con
   * `normalizeForSearch` para que "Finiquito" y "finiquito" colisionen. Se
   * invoca sobre filas ya bloqueadas (`forUpdate`) dentro de la transacción.
   */
  private assertNameAvailable(
    siblings: OffboardingConcept[],
    name: string,
    excludeId?: number
  ): void {
    const normalized = normalizeForSearch(name)
    const taken = siblings.some(
      (concept) =>
        concept.offboardingConceptId !== excludeId &&
        normalizeForSearch(concept.offboardingConceptName) === normalized
    )

    if (taken) {
      throw new EmployeeOffboardingServiceError({
        key: 'concepto-nombre-duplicado',
        errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.NAME_TAKEN,
        httpStatus: 409,
        title: this.t('employee_offboarding_name_taken_title'),
        detail: this.t('employee_offboarding_name_taken_message'),
      })
    }
  }

  /** Regla 6 — a lo más un concepto derivado del inventario vivo por empresa (CA-6). */
  private assertDerivedSourceAvailable(siblings: OffboardingConcept[]): void {
    const taken = siblings.some(
      (concept) =>
        concept.offboardingConceptSource === OFFBOARDING_CONCEPT_SOURCE.EMPLOYEE_SUPPLIES
    )

    if (taken) {
      throw new EmployeeOffboardingServiceError({
        key: 'concepto-derivado-duplicado',
        errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.SOURCE_DUPLICATED,
        httpStatus: 409,
        title: this.t('employee_offboarding_source_duplicated_title'),
        detail: this.t('employee_offboarding_source_duplicated_message'),
      })
    }
  }

  private notFoundError() {
    return new EmployeeOffboardingServiceError({
      key: 'concepto-no-encontrado',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.NOT_FOUND,
      httpStatus: 404,
      title: this.t('employee_offboarding_not_found_title'),
      detail: this.t('employee_offboarding_not_found_message'),
    })
  }

  private sourceLockedError() {
    return new EmployeeOffboardingServiceError({
      key: 'concepto-derivado-protegido',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.SOURCE_LOCKED,
      httpStatus: 422,
      title: this.t('employee_offboarding_source_locked_title'),
      detail: this.t('employee_offboarding_source_locked_message'),
    })
  }

  private reorderInvalidError() {
    return new EmployeeOffboardingServiceError({
      key: 'orden-invalido',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.REORDER_INVALID,
      httpStatus: 422,
      title: this.t('employee_offboarding_reorder_invalid_title'),
      detail: this.t('employee_offboarding_reorder_invalid_message'),
    })
  }
}
