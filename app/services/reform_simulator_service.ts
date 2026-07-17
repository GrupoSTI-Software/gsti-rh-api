import type { HttpContext } from '@adonisjs/core/http'
import type { I18n } from '@adonisjs/i18n'
import Employee from '#models/employee'
import type EmployeeShift from '#models/employee_shift'
import type Person from '#models/person'
import type Shift from '#models/shift'
import { DEFAULT_COUNTRY_CODE } from '#modules/working-time-rules/working_time_rule.constants'
import EffectiveService from '#modules/working-time-rules/effective/effective.service'
import type { EffectiveRuleSource } from '#modules/working-time-rules/effective/dto/effective.dto'
import {
  buildReformSimulationQueryDate,
  REFORM_SIMULATION_COMPARISON_YEARS,
  type ReformSimulationTargetYear,
} from '#constants/reform_simulator.constants'
import type {
  ReformSimulationComparisonYear,
  ReformSimulationEmployee,
  ReformSimulationEmployeeStatus,
  ReformSimulationResult,
  ReformSimulationRulesSource,
  ReformSimulationTotals,
} from '../interfaces/reform_simulator_interface.js'
import EmployeeTeleworkCalculator from '#services/employee_telework_calculator'
import { toBusinessDateString, toCalendarIsoDate } from '#utils/business_date'

interface YearCapSnapshot {
  year: number
  queryDate: string
  maxWeeklyHours: number | null
  rulesSource: EffectiveRuleSource | null
}

interface RosterProjectionRow {
  employeeId: number
  fullName: string
  shiftName: string | null
  weeklyScheduledHours: number | null
  hasSchedule: boolean
}

interface ReformSimulatorApiBody {
  type: string
  title: string
  message: string
  detail?: string
  key?: string
  details?: unknown
  data?: ReformSimulationResult
}

/**
 * Simula el roster activo de una empresa contra los topes legales de la reforma
 * 40h (2026–2030). Los topes salen exclusivamente de getRulesForDate.
 *
 * Flujo orquestado por `simulate()`:
 * - Paso 1: `loadActiveRoster` — consulta empleados activos y mapea cada uno con `mapEmployeeToRosterRow`.
 *   El turno vigente ignora asignaciones cuyo turno de catálogo esté eliminado.
 * - Paso 2: `resolveYearCaps` — obtiene el tope semanal de cada escalón (2026–2030) vía `getRulesForDate`.
 * - Paso 3: selecciona el `targetCap` del año objetivo; si no existe, lanza error.
 * - Paso 4: `buildComparison` — cuenta afectados por año con `countAffectedEmployees`.
 * - Paso 5: `buildEmployeeDetails` — clasifica cada empleado con `classifyEmployee`.
 * - Paso 6: `buildTotals` — agrega totales del escenario del año objetivo.
 * - Paso 7: arma y devuelve `ReformSimulationResult`.
 */
export default class WorkingTimeReformSimulator {
  private readonly effectiveService: EffectiveService

  constructor(effectiveService: EffectiveService = new EffectiveService()) {
    this.effectiveService = effectiveService
  }

  /**
   * Ejecuta la simulación completa para una empresa y un año objetivo de la reforma.
   *
   * Punto de entrada del servicio; orquesta los pasos 1–7 del flujo.
   *
   * Carga el roster activo, resuelve los topes legales de 2026–2030 vía
   * `getRulesForDate`, clasifica cada empleado contra el tope del año solicitado
   * y arma totales, comparativa multi-año y detalle por trabajador.
   *
   * @param businessUnitId - ID interno de la unidad de negocio (scope del middleware).
   * @param targetYear - Año del escenario a proyectar (2026–2030).
   * @returns Resultado estructurado listo para serializar en la respuesta HTTP.
   * @throws Error si no existe configuración de tope para el año objetivo.
   */
  async simulate(
    businessUnitId: number,
    targetYear: ReformSimulationTargetYear
  ): Promise<ReformSimulationResult> {
    // Paso 1: roster activo con turno vigente y horas semanales programadas
    const roster = await this.loadActiveRoster(businessUnitId)

    // Paso 2: topes legales de los cinco escalones (2026–2030)
    const yearCaps = await this.resolveYearCaps(businessUnitId)

    // Paso 3: tope del año objetivo
    const targetCap = yearCaps.find((cap) => cap.year === targetYear)

    if (!targetCap) {
      throw new Error(`No se encontró el tope configurado para el año objetivo ${targetYear}.`)
    }

    // Paso 4: comparativa multi-año de afectados
    const comparison = this.buildComparison(roster, yearCaps)

    // Paso 5: detalle y clasificación por empleado
    const employees = this.buildEmployeeDetails(roster, targetCap)

    // Paso 6: totales del escenario
    const totals = this.buildTotals(roster, employees, targetCap)

    // Paso 7: respuesta final
    return {
      targetYear,
      queryDate: targetCap.queryDate,
      maxWeeklyHours: targetCap.maxWeeklyHours,
      rulesSource: targetCap.rulesSource as ReformSimulationRulesSource,
      totals,
      comparison,
      employees,
    }
  }

  /**
   * Paso 1 — Carga el roster activo de la empresa con el turno vigente de cada empleado.
   *
   * El turno vigente es el más reciente cuyo `employe_shifts_apply_since` sea
   * menor o igual a la fecha de negocio actual. Las horas semanales programadas
   * se derivan de `shiftActiveHours × días laborables del turno`.
   * Por cada empleado delega en `mapEmployeeToRosterRow` el cálculo de horas semanales.
   */
  private async loadActiveRoster(businessUnitId: number): Promise<RosterProjectionRow[]> {
    const employees = await Employee.query()
      .where('businessUnitId', businessUnitId)
      .preload('person')
      .preload('employeeShifts', (employeeShiftQuery) => {
        employeeShiftQuery.preload('shift', (shiftQuery) => {
          shiftQuery.whereNull('shift_deleted_at')
        })
      })
      .orderBy('employeeId', 'asc')

    return employees.map((employee) => this.mapEmployeeToRosterRow(employee))
  }

  /**
   * Paso 1 (detalle) — Mapea un empleado del modelo Lucid a una fila de proyección del roster.
   *
   * Si no tiene turno vigente o no se pueden resolver los días laborables,
   * marca `hasSchedule: false` y deja las horas semanales en `null`.
   * El turno vigente es el más reciente con `employe_shifts_apply_since <= hoy`.
   * Horas: `shiftActiveHours × días laborables` vía `EmployeeTeleworkCalculator`.
   */
  private mapEmployeeToRosterRow(employee: Employee): RosterProjectionRow {
    const currentShift = this.resolveVigentShift(employee)
    const workedDaysPerWeek = EmployeeTeleworkCalculator.resolveWorkingDaysPerWeek(currentShift)

    if (!currentShift || workedDaysPerWeek === null) {
      return {
        employeeId: employee.employeeId,
        fullName: this.buildFullName(employee.person),
        shiftName: null,
        weeklyScheduledHours: null,
        hasSchedule: false,
      }
    }

    return {
      employeeId: employee.employeeId,
      fullName: this.buildFullName(employee.person),
      shiftName: currentShift.shiftName,
      weeklyScheduledHours: this.roundOneDecimal(
        currentShift.shiftActiveHours * workedDaysPerWeek
      ),
      hasSchedule: true,
    }
  }

  /**
   * Resuelve el turno vigente del empleado a la fecha de negocio actual.
   *
   * Criterio (alineado con asistencias): asignación no borrada con
   * `employe_shifts_apply_since` más reciente <= hoy; desempate por `created_at` DESC.
   * Si el turno ligado a esa asignación está eliminado (`shift_deleted_at`) o sus
   * días de descanso no son calculables (p. ej. `shift_rest_days` legacy `"0"`),
   * se retrocede a la asignación vigente anterior con turno activo y horario resoluble.
   */
  private resolveVigentShift(employee: Employee): Shift | null {
    const today = toBusinessDateString()
    const vigentAssignment = [...employee.employeeShifts]
      .filter((assignment) => this.isSchedulableAssignment(assignment, today))
      .sort((left, right) => this.compareEmployeeShiftRecency(left, right))[0]

    return vigentAssignment?.shift ?? null
  }

  private isSchedulableAssignment(assignment: EmployeeShift, today: string): boolean {
    const applySince = toCalendarIsoDate(assignment.employeShiftsApplySince)
    if (applySince === null || applySince > today) {
      return false
    }
    if (!this.hasActiveShift(assignment.shift)) {
      return false
    }
    return EmployeeTeleworkCalculator.resolveWorkingDaysPerWeek(assignment.shift) !== null
  }

  private hasActiveShift(shift: Shift | null | undefined): shift is Shift {
    return shift !== null && shift !== undefined
  }

  private compareEmployeeShiftRecency(left: EmployeeShift, right: EmployeeShift): number {
    const leftApply = toCalendarIsoDate(left.employeShiftsApplySince) ?? ''
    const rightApply = toCalendarIsoDate(right.employeShiftsApplySince) ?? ''
    if (leftApply !== rightApply) {
      return rightApply.localeCompare(leftApply)
    }

    const leftCreated = left.employeShiftsCreatedAt?.toMillis() ?? 0
    const rightCreated = right.employeShiftsCreatedAt?.toMillis() ?? 0
    return rightCreated - leftCreated
  }

  /**
   * Paso 2 — Resuelve el tope semanal legal y la fuente de reglas para cada año de comparación.
   *
   * Consulta `getRulesForDate` con fecha `{año}-01-01` y país por defecto (MX).
   * Nunca usa valores cableados; si no hay regla efectiva, `maxWeeklyHours` queda en `null`.
   */
  private async resolveYearCaps(businessUnitId: number): Promise<YearCapSnapshot[]> {
    return Promise.all(
      REFORM_SIMULATION_COMPARISON_YEARS.map(async (year) => {
        const queryDate = buildReformSimulationQueryDate(year)
        const rules = await this.effectiveService.getRulesForDate(
          businessUnitId,
          queryDate,
          DEFAULT_COUNTRY_CODE
        )

        return {
          year,
          queryDate,
          maxWeeklyHours: rules.effective?.maxWeeklyHours ?? null,
          rulesSource: rules.source,
        }
      })
    )
  }

  /**
   * Paso 4 — Construye la comparativa de los cinco escalones (2026–2030) en una sola pasada.
   *
   * Para cada año devuelve el tope configurado y cuántos empleados con horario
   * excederían ese límite. Si el tope es `null`, `affected` también es `null`.
   * Delega el conteo en `countAffectedEmployees`.
   */
  private buildComparison(
    roster: RosterProjectionRow[],
    yearCaps: YearCapSnapshot[]
  ): ReformSimulationComparisonYear[] {
    return yearCaps.map((cap) => ({
      year: cap.year,
      maxWeeklyHours: cap.maxWeeklyHours,
      affected: this.countAffectedEmployees(roster, cap.maxWeeklyHours),
    }))
  }

  /**
   * Paso 5 — Genera el detalle por empleado para el año objetivo, ordenado por nombre (es) y luego por ID.
   *
   * Delega la clasificación de cada fila en `classifyEmployee`.
   */
  private buildEmployeeDetails(
    roster: RosterProjectionRow[],
    targetCap: YearCapSnapshot
  ): ReformSimulationEmployee[] {
    return roster
      .map((row) => this.classifyEmployee(row, targetCap))
      .sort((left, right) => {
        const nameCompare = left.fullName.localeCompare(right.fullName, 'es')
        if (nameCompare !== 0) {
          return nameCompare
        }
        return left.employeeId - right.employeeId
      })
  }

  /**
   * Paso 5 (detalle) — Clasifica un empleado del roster frente al tope del año objetivo.
   *
   * Estados posibles:
   * - `without_schedule`: sin turno vigente o sin días laborables resueltos.
   * - `compliant`: cumple el tope o no hay tope configurado.
   * - `affected`: horas programadas superan el tope legal.
   */
  private classifyEmployee(
    row: RosterProjectionRow,
    targetCap: YearCapSnapshot
  ): ReformSimulationEmployee {
    if (!row.hasSchedule || row.weeklyScheduledHours === null) {
      return {
        employeeId: row.employeeId,
        fullName: row.fullName,
        shiftName: null,
        weeklyScheduledHours: null,
        maxWeeklyHours: targetCap.maxWeeklyHours,
        excessHours: 0,
        status: 'without_schedule',
      }
    }

    if (targetCap.maxWeeklyHours === null) {
      return {
        employeeId: row.employeeId,
        fullName: row.fullName,
        shiftName: row.shiftName,
        weeklyScheduledHours: row.weeklyScheduledHours,
        maxWeeklyHours: null,
        excessHours: 0,
        status: 'compliant',
      }
    }

    const excessHours = this.roundOneDecimal(
      Math.max(0, row.weeklyScheduledHours - targetCap.maxWeeklyHours)
    )
    const status: ReformSimulationEmployeeStatus =
      row.weeklyScheduledHours > targetCap.maxWeeklyHours ? 'affected' : 'compliant'

    return {
      employeeId: row.employeeId,
      fullName: row.fullName,
      shiftName: row.shiftName,
      weeklyScheduledHours: row.weeklyScheduledHours,
      maxWeeklyHours: targetCap.maxWeeklyHours,
      excessHours,
      status,
    }
  }

  /**
   * Paso 6 — Agrega los totales del escenario para el año objetivo.
   *
   * Cuenta empleados activos, afectados, sin horario y la suma de horas excedentes.
   * Si no hay tope configurado, `affected` y `totalExcessHours` se reportan en cero.
   */
  private buildTotals(
    roster: RosterProjectionRow[],
    employees: ReformSimulationEmployee[],
    targetCap: YearCapSnapshot
  ): ReformSimulationTotals {
    const withoutSchedule = roster.filter((row) => !row.hasSchedule).length
    const affectedEmployees = employees.filter((employee) => employee.status === 'affected')
    const totalExcessHours = this.roundOneDecimal(
      affectedEmployees.reduce((sum, employee) => sum + employee.excessHours, 0)
    )

    return {
      activeEmployees: roster.length,
      affected: targetCap.maxWeeklyHours === null ? 0 : affectedEmployees.length,
      withoutSchedule,
      totalExcessHours: targetCap.maxWeeklyHours === null ? 0 : totalExcessHours,
    }
  }

  /**
   * Paso 4 (detalle) — Cuenta empleados con horario cuyas horas semanales superan el tope dado.
   *
   * @returns `null` cuando no hay tope configurado para ese año.
   */
  private countAffectedEmployees(
    roster: RosterProjectionRow[],
    maxWeeklyHours: number | null
  ): number | null {
    if (maxWeeklyHours === null) {
      return null
    }

    return roster.filter(
      (row) =>
        row.hasSchedule &&
        row.weeklyScheduledHours !== null &&
        row.weeklyScheduledHours > maxWeeklyHours
    ).length
  }

  /** Concatena nombre, apellido paterno y materno de la persona vinculada al empleado. */
  private buildFullName(person: Person | null | undefined): string {
    if (!person) {
      return ''
    }

    return [person.personFirstname, person.personLastname, person.personSecondLastname]
      .filter(Boolean)
      .join(' ')
      .trim()
  }

  /** Redondea a un decimal para horas semanales y excedentes mostrados al cliente. */
  private roundOneDecimal(value: number): number {
    return Math.round(value * 10) / 10
  }

  respondSuccess(ctx: HttpContext, data: ReformSimulationResult) {
    return ctx.response.status(200).json(
      this.buildSuccessBody(ctx.i18n, data) satisfies ReformSimulatorApiBody
    )
  }

  respondForbidden(ctx: HttpContext) {
    return ctx.response.status(403).json(this.buildForbiddenBody(ctx.i18n))
  }

  respondValidationError(ctx: HttpContext, error: unknown) {
    const messages = (error as { messages?: unknown })?.messages
    return ctx.response.status(422).json(this.buildValidationErrorBody(ctx.i18n, error, messages))
  }

  respondSimulationFailed(ctx: HttpContext) {
    return ctx.response.status(500).json(this.buildSimulationFailedBody(ctx.i18n))
  }

  private buildSuccessBody(i18n: I18n, data: ReformSimulationResult): ReformSimulatorApiBody {
    return {
      type: 'success',
      title: i18n.formatMessage('reform_simulator.title'),
      message: i18n.formatMessage('reform_simulator.success_message'),
      data,
    }
  }

  private buildForbiddenBody(i18n: I18n): ReformSimulatorApiBody {
    const detail = i18n.formatMessage('reform_simulator.errors.sin-permiso.detail')
    return {
      type: 'error',
      title: i18n.formatMessage('reform_simulator.errors.sin-permiso.title'),
      message: detail,
      detail,
      key: 'sin-permiso',
    }
  }

  private buildValidationErrorBody(
    i18n: I18n,
    error: unknown,
    messages?: unknown
  ): ReformSimulatorApiBody {
    const vineMessages =
      error && typeof error === 'object' && (error as { code?: string }).code === 'E_VALIDATION_ERROR'
        ? (error as { messages?: Array<{ message: string }> }).messages
        : undefined
    const detail =
      vineMessages?.[0]?.message ??
      (error instanceof Error
        ? error.message
        : i18n.formatMessage('reform_simulator.errors.entrada-invalida.detail'))
    return {
      type: 'error',
      title: i18n.formatMessage('reform_simulator.errors.entrada-invalida.title'),
      message: detail,
      detail,
      key: 'entrada-invalida',
      details: messages,
    }
  }

  private buildSimulationFailedBody(i18n: I18n): ReformSimulatorApiBody {
    const detail = i18n.formatMessage('reform_simulator.errors.simulacion-no-resuelta.detail')
    return {
      type: 'error',
      title: i18n.formatMessage('reform_simulator.errors.simulacion-no-resuelta.title'),
      message: detail,
      detail,
      key: 'simulacion-no-resuelta',
    }
  }
}
