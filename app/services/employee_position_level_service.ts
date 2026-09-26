import PositionPositionLevel from '#models/position_position_level'
import {
  employeePositionLevelInactiveError,
  employeePositionLevelInvalidInputError,
  employeePositionLevelNotInPositionError,
} from '#helpers/employee_position_level_api_error'

type AssertAssignableParams = {
  /** Valor enviado en el payload; `null` = sin nivel (siempre válido, regla 1). */
  positionLevelConfigId: number | null
  /** `positionId` EFECTIVO del payload (post-fallback "Sin posición" en store). */
  effectivePositionId: number | null | undefined
  /** Scope del request (`ctx.businessUnitScope`); vacío → falla cerrado. */
  businessUnitScope: number[] | undefined
  /** Nivel ya persistido del empleado; `null` en store (la exención nunca aplica). */
  previousPositionLevelConfigId: number | null
  /** Puesto persistido del empleado; la exención exige que el payload no lo cambie. */
  currentPositionId?: number | null
}

/**
 * Fuente ÚNICA de la validación de pertenencia del nivel asignado al empleado
 * (USRH1785964117188, reglas 3, 6 y 7). La invocan `store` y `update` de
 * `employee_controller` ANTES de cualquier persistencia; no duplicar en otro
 * lugar ni confiar en la validación del BO.
 */
export default class EmployeePositionLevelService {
  /**
   * Orden fail-fast:
   * 1. `null` → válido (regla 1; la propiedad ausente en update ni siquiera llega aquí).
   * 2. Exención de conservación (regla 6): re-enviar exactamente el nivel ya
   *    persistido con el mismo puesto es no-op — sin re-validar vigencia ni
   *    activo, para que la edición de una ficha con nivel desactivado (o
   *    soft-deleted tras una reactivación) nunca reviente 422.
   * 3. Defensivo: no entero positivo → `ELVL.VAL.001` (Vine intercepta antes).
   * 4. Fail-closed: sin scope o sin puesto efectivo → `ELVL.CONF.001`.
   * 5. Pertenencia (query única): otro puesto, otro tenant o soft-deleted →
   *    `ELVL.CONF.001` indistinguible (no revela existencia ajena).
   * 6. Fila del puesto pero inactiva → `ELVL.CONF.002`.
   */
  async assertAssignable(params: AssertAssignableParams): Promise<void> {
    const {
      positionLevelConfigId,
      effectivePositionId,
      businessUnitScope,
      previousPositionLevelConfigId,
      currentPositionId,
    } = params

    if (positionLevelConfigId === null) {
      return
    }

    if (
      previousPositionLevelConfigId !== null &&
      positionLevelConfigId === previousPositionLevelConfigId &&
      currentPositionId !== null &&
      currentPositionId !== undefined &&
      Number(effectivePositionId) === Number(currentPositionId)
    ) {
      return
    }

    if (!Number.isInteger(positionLevelConfigId) || positionLevelConfigId < 1) {
      throw employeePositionLevelInvalidInputError()
    }

    if (!businessUnitScope?.length || !effectivePositionId) {
      throw employeePositionLevelNotInPositionError()
    }

    // `whereIn(business_unit_id)` explícito además del mixin (defensa en
    // profundidad, espejo de `findPositionInScope`): si mañana se invoca
    // desde un camino sin middleware de tenant, sigue cerrado.
    const row = await PositionPositionLevel.query()
      .where('position_position_level_id', positionLevelConfigId)
      .where('position_id', effectivePositionId)
      .whereNull('position_position_level_deleted_at')
      .whereIn('business_unit_id', businessUnitScope)
      .first()

    if (!row) {
      throw employeePositionLevelNotInPositionError()
    }

    if (!row.positionPositionLevelActive) {
      throw employeePositionLevelInactiveError()
    }
  }
}
