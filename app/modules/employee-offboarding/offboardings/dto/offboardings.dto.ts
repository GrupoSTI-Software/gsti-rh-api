import type EmployeeOffboarding from '#models/employee_offboarding'
import type EmployeeOffboardingItem from '#models/employee_offboarding_item'
import { toCalendarIsoDate, isBusinessCalendarDateBefore } from '#utils/business_date'
import { EMPLOYEE_OFFBOARDING_ITEM_STATUS } from '../offboardings.constants.js'

/**
 * Pendiente del expediente tal como viaja al cliente (spec §10). Las
 * banderas `requiresEvidence`/`allowsAmount` se resuelven del concepto con
 * `withTrashed()` (§7 D8); `false` para pendientes derivados de un activo.
 */
export interface EmployeeOffboardingItemDto {
  employeeOffboardingItemId: number
  offboardingConceptId: number | null
  employeeSupplyId: number | null
  employeeOffboardingItemName: string
  employeeOffboardingItemStatus: string
  employeeOffboardingItemAmount: number | null
  employeeOffboardingItemNote: string | null
  requiresEvidence: boolean
  allowsAmount: boolean
  isOverdue: boolean
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
 * Construye el DTO del pendiente. `hoyIso` es el "hoy" resuelto UNA vez por
 * request con `toBusinessDateString()` (regla 9); `referenceDate` es la
 * fecha real de baja si existe, si no la tentativa.
 */
export function toItemDto(
  item: EmployeeOffboardingItem,
  referenceDate: string | null,
  hoyIso: string
): EmployeeOffboardingItemDto {
  const amount = item.employeeOffboardingItemAmount
  return {
    employeeOffboardingItemId: item.employeeOffboardingItemId,
    offboardingConceptId: item.offboardingConceptId,
    employeeSupplyId: item.employeeSupplyId,
    employeeOffboardingItemName: item.employeeOffboardingItemName,
    employeeOffboardingItemStatus: item.employeeOffboardingItemStatus,
    employeeOffboardingItemAmount: amount === null || amount === undefined ? null : Number(amount),
    employeeOffboardingItemNote: item.employeeOffboardingItemNote ?? null,
    requiresEvidence: Boolean(item.concept?.offboardingConceptRequiresEvidence ?? false),
    allowsAmount: Boolean(item.concept?.offboardingConceptAllowsAmount ?? false),
    isOverdue:
      item.employeeOffboardingItemStatus === EMPLOYEE_OFFBOARDING_ITEM_STATUS.PENDING &&
      referenceDate !== null &&
      isBusinessCalendarDateBefore(referenceDate, hoyIso),
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
  }
): EmployeeOffboardingDto {
  const plannedDate = toCalendarIsoDate(offboarding.employeeOffboardingPlannedDate)
  const terminatedDate = toCalendarIsoDate(params.employeeTerminatedDate)
  const referenceDate = terminatedDate ?? plannedDate ?? null

  const orderedItems = sortItems(offboarding.items ?? [])

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
    items: orderedItems.map((item) => toItemDto(item, referenceDate, params.hoyIso)),
  }
}
