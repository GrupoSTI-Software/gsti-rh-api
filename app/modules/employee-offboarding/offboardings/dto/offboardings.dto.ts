import type EmployeeOffboarding from '#models/employee_offboarding'
import type EmployeeOffboardingItem from '#models/employee_offboarding_item'
import type EmployeeSupplie from '#models/employee_supplie'
import type User from '#models/user'
import { toCalendarIsoDate, isBusinessCalendarDateBefore } from '#utils/business_date'
import { EMPLOYEE_OFFBOARDING_ITEM_STATUS } from '../offboardings.constants.js'
import { SUPPLY_OUTCOME, type SupplyOutcome } from '../../items/items.constants.js'

/**
 * Pendiente del expediente tal como viaja al cliente (spec §10 de
 * USRH1786568279587, extendido de forma ADITIVA por USRH1786568279590 con la
 * autoría del cumplimiento y el diagnóstico de solo lectura del insumo).
 * Las banderas `requiresEvidence`/`allowsAmount` se resuelven del concepto
 * con `withTrashed()` (§7 D8); `false` para pendientes derivados de un activo.
 */
export interface EmployeeOffboardingItemDto {
  employeeOffboardingItemId: number
  offboardingConceptId: number | null
  employeeSupplyId: number | null
  employeeOffboardingItemName: string
  employeeOffboardingItemStatus: string
  employeeOffboardingItemAmount: number | null
  employeeOffboardingItemNote: string | null
  employeeOffboardingItemCompletedAt: string | null
  employeeOffboardingItemCompletedByUserId: number | null
  /** Nombre visible de quien marcó el cumplimiento; null si no hay autoría. */
  employeeOffboardingItemCompletedByUserName: string | null
  requiresEvidence: boolean
  allowsAmount: boolean
  isOverdue: boolean
  /**
   * Diagnóstico del insumo (D-3 de USRH1786568279590): derivado en cada
   * lectura del inventario, nunca persistido. `null` = insumo vivo aún
   * asignado (sin desenlace todavía).
   */
  supplyOutcome: SupplyOutcome | null
  supplyRetirementDate: string | null
  supplyRetirementReason: string | null
}

/** Expediente de salida con sus pendientes y la marca de vencido (spec §10). */
export interface EmployeeOffboardingDto {
  employeeOffboardingId: number
  employeeId: number
  businessUnitId: number
  employeeOffboardingPlannedDate: string | null
  employeeOffboardingStatus: string
  employeeOffboardingOrigin: string
  employeeOffboardingNotes: string | null
  referenceDate: string | null
  employeeDeleted: boolean
  items: EmployeeOffboardingItemDto[]
}

/** Contexto de lectura para armar los DTO de pendientes. */
export interface ItemDtoContext {
  /** "Hoy" resuelto UNA vez por request con `toBusinessDateString()` (regla 9). */
  hoyIso: string
  /** Fecha de referencia del expediente: baja real si existe, si no la tentativa. */
  referenceDate: string | null
  /** Insumos del expediente resueltos con `withTrashed()` en el alcance, por id. */
  suppliesById: Map<number, EmployeeSupplie>
  /** Nombre visible por id de usuario, para la autoría del cumplimiento. */
  userNamesById: Map<number, string>
}

/** Mapa insumo-por-id para el diagnóstico de lectura. */
export function buildSuppliesMap(supplies: EmployeeSupplie[]): Map<number, EmployeeSupplie> {
  return new Map(supplies.map((supply) => [supply.employeeSupplyId, supply]))
}

/**
 * Mapa nombre-visible-por-id-de-usuario para la autoría del cumplimiento:
 * nombre de la persona cuando existe, correo del usuario como respaldo.
 */
export function buildUserNamesMap(users: User[]): Map<number, string> {
  return new Map(
    users.map((user) => {
      const person = user.person
      const fullName = [person?.personFirstname, person?.personLastname]
        .filter((part) => typeof part === 'string' && part.trim().length > 0)
        .join(' ')
        .trim()
      return [user.userId, fullName.length > 0 ? fullName : user.userEmail]
    })
  )
}

/**
 * Ordena los pendientes por el lugar del concepto en el catálogo
 * (`offboarding_concept_order`) y luego por id; los derivados de activo
 * (sin concepto) van al final, en su orden de creación.
 */
export function sortItems(items: EmployeeOffboardingItem[]): EmployeeOffboardingItem[] {
  return [...items].sort((a, b) => {
    const orderA = a.concept?.offboardingConceptOrder ?? Number.MAX_SAFE_INTEGER
    const orderB = b.concept?.offboardingConceptOrder ?? Number.MAX_SAFE_INTEGER
    if (orderA !== orderB) return orderA - orderB
    return a.employeeOffboardingItemId - b.employeeOffboardingItemId
  })
}

/**
 * Diagnóstico de LECTURA del insumo (D-2/D-3 de USRH1786568279590): la fila
 * se resuelve con `withTrashed()`, así que el borrado lógico no la oculta
 * pero sí la marca como no disponible. Un insumo retirado devuelve la fecha
 * y el motivo originales; uno vivo aún asignado no tiene desenlace (`null`).
 */
export function resolveSupplyDiagnostics(
  item: Pick<EmployeeOffboardingItem, 'employeeSupplyId'>,
  suppliesById: Map<number, EmployeeSupplie>
): {
  supplyOutcome: SupplyOutcome | null
  supplyRetirementDate: string | null
  supplyRetirementReason: string | null
} {
  if (!item.employeeSupplyId) {
    return {
      supplyOutcome: SUPPLY_OUTCOME.NOT_APPLICABLE,
      supplyRetirementDate: null,
      supplyRetirementReason: null,
    }
  }

  const supply = suppliesById.get(item.employeeSupplyId)
  if (!supply || supply.deletedAt) {
    return {
      supplyOutcome: SUPPLY_OUTCOME.UNAVAILABLE,
      supplyRetirementDate: null,
      supplyRetirementReason: null,
    }
  }

  if (supply.employeeSupplyStatus === 'retired') {
    return {
      supplyOutcome: SUPPLY_OUTCOME.RETIRED,
      supplyRetirementDate: supply.employeeSupplyRetirementDate?.toISO() ?? null,
      supplyRetirementReason: supply.employeeSupplyRetirementReason ?? null,
    }
  }

  return { supplyOutcome: null, supplyRetirementDate: null, supplyRetirementReason: null }
}

/** Construye el DTO del pendiente con el contexto de lectura ya resuelto. */
export function toItemDto(
  item: EmployeeOffboardingItem,
  context: ItemDtoContext
): EmployeeOffboardingItemDto {
  const amount = item.employeeOffboardingItemAmount
  const completedByUserId = item.employeeOffboardingItemCompletedByUserId ?? null
  const diagnostics = resolveSupplyDiagnostics(item, context.suppliesById)
  return {
    employeeOffboardingItemId: item.employeeOffboardingItemId,
    offboardingConceptId: item.offboardingConceptId,
    employeeSupplyId: item.employeeSupplyId,
    employeeOffboardingItemName: item.employeeOffboardingItemName,
    employeeOffboardingItemStatus: item.employeeOffboardingItemStatus,
    employeeOffboardingItemAmount: amount === null || amount === undefined ? null : Number(amount),
    employeeOffboardingItemNote: item.employeeOffboardingItemNote ?? null,
    employeeOffboardingItemCompletedAt: item.employeeOffboardingItemCompletedAt?.toISO() ?? null,
    employeeOffboardingItemCompletedByUserId: completedByUserId,
    employeeOffboardingItemCompletedByUserName:
      completedByUserId !== null ? (context.userNamesById.get(completedByUserId) ?? null) : null,
    requiresEvidence: Boolean(item.concept?.offboardingConceptRequiresEvidence ?? false),
    allowsAmount: Boolean(item.concept?.offboardingConceptAllowsAmount ?? false),
    isOverdue:
      item.employeeOffboardingItemStatus === EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING &&
      context.referenceDate !== null &&
      isBusinessCalendarDateBefore(context.referenceDate, context.hoyIso),
    ...diagnostics,
  }
}

/**
 * Construye el DTO del expediente. Regla 9: la fecha de referencia es
 * `employeeTerminatedDate` si no es nula; si no, la fecha tentativa.
 */
export function toOffboardingDto(
  offboarding: EmployeeOffboarding,
  params: {
    employeeTerminatedDate: unknown
    employeeDeleted: boolean
    hoyIso: string
    suppliesById: Map<number, EmployeeSupplie>
    userNamesById: Map<number, string>
  }
): EmployeeOffboardingDto {
  const plannedDate = toCalendarIsoDate(offboarding.employeeOffboardingPlannedDate)
  const terminatedDate = toCalendarIsoDate(params.employeeTerminatedDate)
  const referenceDate = terminatedDate ?? plannedDate ?? null

  const orderedItems = sortItems(offboarding.items ?? [])
  const context: ItemDtoContext = {
    hoyIso: params.hoyIso,
    referenceDate,
    suppliesById: params.suppliesById,
    userNamesById: params.userNamesById,
  }

  return {
    employeeOffboardingId: offboarding.employeeOffboardingId,
    employeeId: offboarding.employeeId,
    businessUnitId: offboarding.businessUnitId,
    employeeOffboardingPlannedDate: plannedDate,
    employeeOffboardingStatus: offboarding.employeeOffboardingStatus,
    employeeOffboardingOrigin: offboarding.employeeOffboardingOrigin,
    employeeOffboardingNotes: offboarding.employeeOffboardingNotes ?? null,
    referenceDate,
    employeeDeleted: params.employeeDeleted,
    items: orderedItems.map((item) => toItemDto(item, context)),
  }
}
