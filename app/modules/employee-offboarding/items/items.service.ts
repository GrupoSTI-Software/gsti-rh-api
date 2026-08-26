import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import type { I18n } from '@adonisjs/i18n'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type EmployeeOffboarding from '#models/employee_offboarding'
import type EmployeeOffboardingItem from '#models/employee_offboarding_item'
import type EmployeeSupplie from '#models/employee_supplie'
import RoleService from '#services/role_service'
import EmployeeOffboardingServiceError from '#exceptions/employee_offboarding_service_error'
import { EMPLOYEE_OFFBOARDING_ERROR_CODES } from '#constants/employee_offboarding_error_codes'
import { toBusinessDateString, toCalendarIsoDate } from '#utils/business_date'
import { EMPLOYEE_OFFBOARDINGS_MODULE_SLUG } from '../concepts/concepts.constants.js'
import {
  EMPLOYEE_OFFBOARDING_ITEM_STATUS,
  EMPLOYEE_OFFBOARDING_STATUS,
} from '../offboardings/offboardings.constants.js'
import {
  buildUserNamesMap,
  resolveSupplyDiagnostics,
  toItemDto,
  type EmployeeOffboardingItemDto,
} from '../offboardings/dto/offboardings.dto.js'
import {
  buildOffboardingSupplyRetirementReason,
  SUPPLY_OUTCOME,
  type SupplyOutcome,
} from './items.constants.js'
import ItemsRepositoryMysql from './items.repository.mysql.js'
import type { ItemsRepository } from './items.repository.js'

/** Acciones del módulo `employee-offboardings` que usa este slice. */
export type EmployeeOffboardingItemAction = 'read' | 'update'

/** Body de los endpoints de pendiente: ausente = no tocar; `null` = limpiar. */
export interface UpdateOffboardingItemInput {
  employeeOffboardingItemAmount?: number | null
  employeeOffboardingItemNote?: string | null
}

/**
 * Pendiente serializado con el código de diagnóstico del insumo: viaja en el
 * cuerpo de ÉXITO cuando el pendiente se cerró sin retirar nada (regla 10) —
 * nunca como error.
 */
export type EmployeeOffboardingItemOperationDto = EmployeeOffboardingItemDto & {
  supplyDiagnosticCode: string | null
}

/** Desenlace del insumo calculado por la operación (D-2). */
interface SupplyOperationOutcome {
  outcome: SupplyOutcome | null
  retirementDate: string | null
  retirementReason: string | null
}

/**
 * Reglas de negocio del cumplimiento de pendientes de salida
 * (USRH1786568279590): completar y revertir con autoría y fecha (reglas 1-3),
 * importe solo donde el concepto lo admite resuelto con `withTrashed()`
 * (reglas 4-6, D-6/D-7), retiro real del insumo dentro de la MISMA
 * transacción que marca el pendiente (reglas 8-9, D-1), regla única del
 * insumo no disponible (regla 10, D-2) y reversión que NUNCA des-retira
 * (regla 11, D-4). Todo opera igual con el colaborador dado de baja (regla
 * 12, D-10): el alcance se resuelve contra el `business_unit_id`
 * snapshoteado del expediente, nunca contra `employees`.
 */
export default class ItemsService {
  private t: (key: string, params?: { [key: string]: string | number }) => string
  private readonly repository: ItemsRepository

  constructor(i18n: I18n, repository: ItemsRepository = new ItemsRepositoryMysql()) {
    this.t = i18n.formatMessage.bind(i18n)
    this.repository = repository
  }

  /**
   * Regla 13 — permiso granular sobre el módulo `employee-offboardings`.
   * `root` y `owner` hacen bypass dentro de `RoleService.hasAccess`.
   */
  async assertCanAccess(
    roleId: number | null | undefined,
    action: EmployeeOffboardingItemAction
  ) {
    const forbidden = () =>
      new EmployeeOffboardingServiceError({
        key: 'sin-permiso',
        errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.CASE_FORBIDDEN,
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
   * Actualiza importe y/o nota sin cambiar el estado (regla 7: se corrigen
   * esté el pendiente cumplido o no).
   */
  async updateItem(
    employeeOffboardingId: number,
    employeeOffboardingItemId: number,
    input: UpdateOffboardingItemInput,
    businessUnitScope: number[]
  ): Promise<EmployeeOffboardingItemOperationDto> {
    const { offboarding, item } = await db.transaction(async (trx) => {
      const context = await this.resolveContext(
        employeeOffboardingId,
        employeeOffboardingItemId,
        businessUnitScope,
        trx
      )
      await this.applyAmountAndNote(context.item, input, context.offboarding.businessUnitId, trx)
      await this.repository.saveItem(context.item, trx)
      return context
    })

    return await this.buildOperationDto(offboarding, item, businessUnitScope, null)
  }

  /**
   * Marca cumplido (§9.4): valida el importe, retira el insumo cuando está
   * disponible — todo o nada — y estampa autoría y fecha. La regla única del
   * insumo no disponible (D-2) completa el pendiente igual y devuelve el
   * diagnóstico; un fallo TÉCNICO de escritura sí revierte todo (500).
   */
  async completeItem(
    employeeOffboardingId: number,
    employeeOffboardingItemId: number,
    input: UpdateOffboardingItemInput,
    businessUnitScope: number[],
    completedByUserId: number | null
  ): Promise<EmployeeOffboardingItemOperationDto> {
    const { offboarding, item, operation } = await db.transaction(async (trx) => {
      const context = await this.resolveContext(
        employeeOffboardingId,
        employeeOffboardingItemId,
        businessUnitScope,
        trx
      )

      if (
        context.item.employeeOffboardingItemStatus === EMPLOYEE_OFFBOARDING_ITEM_STATUS.COMPLETED
      ) {
        throw this.alreadyCompletedError()
      }

      // El 422 de importe sale ANTES de tocar el inventario: no se persiste
      // ni el importe, ni la nota, ni el estado, ni el retiro (regla 4).
      await this.applyAmountAndNote(context.item, input, context.offboarding.businessUnitId, trx)

      const operationOutcome = await this.retireSupplyIfAvailable(
        context.item,
        context.offboarding,
        businessUnitScope,
        trx
      )

      context.item.employeeOffboardingItemStatus = EMPLOYEE_OFFBOARDING_ITEM_STATUS.COMPLETED
      context.item.employeeOffboardingItemCompletedAt = DateTime.now()
      context.item.employeeOffboardingItemCompletedByUserId = completedByUserId
      await this.repository.saveItem(context.item, trx)

      return { ...context, operation: operationOutcome }
    })

    return await this.buildOperationDto(offboarding, item, businessUnitScope, operation)
  }

  /**
   * Regresa a pendiente (regla 2): limpia autoría y fecha, conserva importe
   * y nota, y NUNCA toca `employee_supplies` (regla 11, D-4 — cerrada por
   * Wilvardo: entre el retiro y la reversión el equipo pudo reasignarse). El
   * diagnóstico del insumo viaja en la respuesta para que el backoffice
   * pinte el aviso.
   */
  async revertItem(
    employeeOffboardingId: number,
    employeeOffboardingItemId: number,
    businessUnitScope: number[]
  ): Promise<EmployeeOffboardingItemOperationDto> {
    const { offboarding, item } = await db.transaction(async (trx) => {
      const context = await this.resolveContext(
        employeeOffboardingId,
        employeeOffboardingItemId,
        businessUnitScope,
        trx
      )

      if (
        context.item.employeeOffboardingItemStatus !== EMPLOYEE_OFFBOARDING_ITEM_STATUS.COMPLETED
      ) {
        throw this.notCompletedError()
      }

      context.item.employeeOffboardingItemStatus = EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING
      context.item.employeeOffboardingItemCompletedAt = null
      context.item.employeeOffboardingItemCompletedByUserId = null
      await this.repository.saveItem(context.item, trx)

      return context
    })

    // Aviso del BO: un insumo ya retirado viaja como `already_retired`
    const operation = await this.diagnoseSupplyForRevert(item, businessUnitScope)
    return await this.buildOperationDto(offboarding, item, businessUnitScope, operation)
  }

  /**
   * Expediente por su BU snapshoteado + pendiente bloqueado; 404 uniforme.
   * Solo lo usan las TRES escrituras del slice, así que aquí vive la guarda
   * de expediente cerrado (regla 8 de USRH1786568279596): 409 sin persistir
   * nada. Las lecturas van por el slice `offboardings/` y no pasan por aquí.
   */
  private async resolveContext(
    employeeOffboardingId: number,
    employeeOffboardingItemId: number,
    businessUnitScope: number[],
    trx: TransactionClientContract
  ): Promise<{ offboarding: EmployeeOffboarding, item: EmployeeOffboardingItem }> {
    const offboarding = await this.repository.findOffboardingInScope(
      employeeOffboardingId,
      businessUnitScope,
      trx
    )
    if (!offboarding) {
      throw this.itemNotFoundError()
    }

    if (offboarding.employeeOffboardingStatus === EMPLOYEE_OFFBOARDING_STATUS.CLOSED) {
      throw this.caseClosedError()
    }

    const item = await this.repository.findItemForUpdate(
      employeeOffboardingId,
      employeeOffboardingItemId,
      trx
    )
    if (!item) {
      throw this.itemNotFoundError()
    }

    return { offboarding, item }
  }

  /**
   * Importe y nota: ausente = no tocar; `null` = limpiar. El importe solo se
   * acepta si el concepto lo admite, resuelto con `withTrashed()` (D-6) —
   * un pendiente derivado del inventario nunca lo admite. Redondeo a dos
   * decimales antes de persistir (D-8).
   */
  private async applyAmountAndNote(
    item: EmployeeOffboardingItem,
    input: UpdateOffboardingItemInput,
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<void> {
    const amount = input.employeeOffboardingItemAmount

    if (amount !== undefined) {
      if (amount !== null) {
        const allowsAmount = await this.conceptAllowsAmount(item, businessUnitId, trx)
        if (!allowsAmount) {
          throw this.amountNotAllowedError()
        }
      }
      item.employeeOffboardingItemAmount = amount === null ? null : Math.round(amount * 100) / 100
    }

    if (input.employeeOffboardingItemNote !== undefined) {
      item.employeeOffboardingItemNote = input.employeeOffboardingItemNote
    }
  }

  /** Lo que manda es lo que decía el concepto al generarse el pendiente (regla 5). */
  private async conceptAllowsAmount(
    item: EmployeeOffboardingItem,
    businessUnitId: number,
    trx: TransactionClientContract
  ): Promise<boolean> {
    if (!item.offboardingConceptId) {
      return false
    }
    const concept = await this.repository.findConceptWithTrashed(
      item.offboardingConceptId,
      businessUnitId,
      trx
    )
    return concept?.offboardingConceptAllowsAmount === true
  }

  /**
   * Retiro del insumo dentro de la MISMA transacción (D-1, D-2): bloqueo con
   * `forUpdate`, cuatro desenlaces y NUNCA se sobrescribe un retiro
   * anterior. El pendiente se completa en los cuatro casos.
   */
  private async retireSupplyIfAvailable(
    item: EmployeeOffboardingItem,
    offboarding: EmployeeOffboarding,
    businessUnitScope: number[],
    trx: TransactionClientContract
  ): Promise<SupplyOperationOutcome> {
    if (!item.employeeSupplyId) {
      return { outcome: SUPPLY_OUTCOME.NOT_APPLICABLE, retirementDate: null, retirementReason: null }
    }

    const supply = await this.repository.lockSupplyInScope(
      item.employeeSupplyId,
      businessUnitScope,
      trx
    )

    if (!supply || supply.deletedAt) {
      return { outcome: SUPPLY_OUTCOME.UNAVAILABLE, retirementDate: null, retirementReason: null }
    }

    if (supply.employeeSupplyStatus === 'retired') {
      return {
        outcome: SUPPLY_OUTCOME.ALREADY_RETIRED,
        retirementDate: supply.employeeSupplyRetirementDate?.toISO() ?? null,
        retirementReason: supply.employeeSupplyRetirementReason ?? null,
      }
    }

    supply.employeeSupplyStatus = 'retired'
    supply.employeeSupplyRetirementDate = DateTime.now()
    supply.employeeSupplyRetirementReason = buildOffboardingSupplyRetirementReason(
      offboarding.employeeOffboardingId
    )
    // Un fallo aquí revierte la transacción entera (500): error de
    // infraestructura, no estado de negocio.
    await this.repository.saveSupply(supply, trx)

    return {
      outcome: SUPPLY_OUTCOME.RETIRED,
      retirementDate: supply.employeeSupplyRetirementDate?.toISO() ?? null,
      retirementReason: supply.employeeSupplyRetirementReason,
    }
  }

  /** Diagnóstico de la reversión: informativo, sin ninguna escritura al inventario. */
  private async diagnoseSupplyForRevert(
    item: EmployeeOffboardingItem,
    businessUnitScope: number[]
  ): Promise<SupplyOperationOutcome> {
    if (!item.employeeSupplyId) {
      return { outcome: SUPPLY_OUTCOME.NOT_APPLICABLE, retirementDate: null, retirementReason: null }
    }

    const supply = await this.repository.findSupplyInScope(
      item.employeeSupplyId,
      businessUnitScope
    )

    if (!supply || supply.deletedAt) {
      return { outcome: SUPPLY_OUTCOME.UNAVAILABLE, retirementDate: null, retirementReason: null }
    }

    if (supply.employeeSupplyStatus === 'retired') {
      return {
        outcome: SUPPLY_OUTCOME.ALREADY_RETIRED,
        retirementDate: supply.employeeSupplyRetirementDate?.toISO() ?? null,
        retirementReason: supply.employeeSupplyRetirementReason ?? null,
      }
    }

    return { outcome: null, retirementDate: null, retirementReason: null }
  }

  /**
   * Serializa el pendiente tras la operación. `operation` (si viene) manda
   * sobre el diagnóstico de lectura — distingue `already_retired` de
   * `retired`; el diagnóstico de lectura se recalcula del inventario (D-3).
   */
  private async buildOperationDto(
    offboarding: EmployeeOffboarding,
    item: EmployeeOffboardingItem,
    businessUnitScope: number[],
    operation: SupplyOperationOutcome | null
  ): Promise<EmployeeOffboardingItemOperationDto> {
    if (item.offboardingConceptId) {
      const concept = await this.repository.findConceptWithTrashed(
        item.offboardingConceptId,
        offboarding.businessUnitId
      )
      if (concept) {
        item.$setRelated('concept', concept)
      }
    }

    const suppliesById = new Map<number, EmployeeSupplie>()
    if (item.employeeSupplyId) {
      const supply = await this.repository.findSupplyInScope(
        item.employeeSupplyId,
        businessUnitScope
      )
      if (supply) {
        suppliesById.set(item.employeeSupplyId, supply)
      }
    }

    const completedByUserId = item.employeeOffboardingItemCompletedByUserId
    const users = completedByUserId
      ? await this.repository.findUsersByIds([completedByUserId])
      : []

    const employee = await this.repository.findEmployeeWithTrashed(offboarding.employeeId)
    const referenceDate =
      toCalendarIsoDate(employee?.employeeTerminatedDate) ??
      toCalendarIsoDate(offboarding.employeeOffboardingPlannedDate) ??
      null

    const evidenceCountsByItemId = await this.repository.countLiveEvidencesByItemIds([
      item.employeeOffboardingItemId,
    ])

    const dto = toItemDto(item, {
      hoyIso: toBusinessDateString(),
      referenceDate,
      suppliesById,
      userNamesById: buildUserNamesMap(users),
      evidenceCountsByItemId,
      // R3 de USRH1786568279596: un cerrado no reporta vencidos; las
      // escrituras de este slice solo alcanzan expedientes abiertos (guarda)
      caseIsOpen: offboarding.employeeOffboardingStatus === EMPLOYEE_OFFBOARDING_STATUS.OPEN,
    })

    const diagnostics = operation
      ? {
          supplyOutcome: operation.outcome,
          supplyRetirementDate: operation.retirementDate,
          supplyRetirementReason: operation.retirementReason,
        }
      : resolveSupplyDiagnostics(item, suppliesById)

    const finalOutcome = diagnostics.supplyOutcome

    return {
      ...dto,
      ...diagnostics,
      supplyDiagnosticCode:
        finalOutcome === SUPPLY_OUTCOME.UNAVAILABLE
          ? EMPLOYEE_OFFBOARDING_ERROR_CODES.ITEM_SUPPLY_UNAVAILABLE
          : null,
    }
  }

  private itemNotFoundError() {
    return new EmployeeOffboardingServiceError({
      key: 'pendiente-no-encontrado',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.ITEM_NOT_FOUND,
      httpStatus: 404,
      title: this.t('employee_offboarding_item_not_found_title'),
      detail: this.t('employee_offboarding_item_not_found_message'),
    })
  }

  private alreadyCompletedError() {
    return new EmployeeOffboardingServiceError({
      key: 'pendiente-ya-cumplido',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.ITEM_ALREADY_COMPLETED,
      httpStatus: 409,
      title: this.t('employee_offboarding_item_already_completed_title'),
      detail: this.t('employee_offboarding_item_already_completed_message'),
    })
  }

  private notCompletedError() {
    return new EmployeeOffboardingServiceError({
      key: 'pendiente-no-cumplido',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.ITEM_NOT_COMPLETED,
      httpStatus: 409,
      title: this.t('employee_offboarding_item_not_completed_title'),
      detail: this.t('employee_offboarding_item_not_completed_message'),
    })
  }

  private amountNotAllowedError() {
    return new EmployeeOffboardingServiceError({
      key: 'importe-no-aplicable',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.ITEM_AMOUNT_NOT_ALLOWED,
      httpStatus: 422,
      title: this.t('employee_offboarding_item_amount_not_allowed_title'),
      detail: this.t('employee_offboarding_item_amount_not_allowed_message'),
    })
  }

  private caseClosedError() {
    return new EmployeeOffboardingServiceError({
      key: 'expediente-cerrado',
      errorCode: EMPLOYEE_OFFBOARDING_ERROR_CODES.CASE_CLOSED_READ_ONLY,
      httpStatus: 409,
      title: this.t('employee_offboarding_case_closed_read_only_title'),
      detail: this.t('employee_offboarding_case_closed_read_only_message'),
    })
  }
}
