import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Employee from '#models/employee'
import BranchOffice from '#models/branch_office'
import EmployeeTemporaryAssignment from '#models/employee_temporary_assignment'
import ShiftException from '#models/shift_exception'
import ExceptionType from '#models/exception_type'

interface ShiftOverride {
  startTime: string
  endTime: string
}

interface CreateTemporaryAssignmentPayload {
  targetBranchId: number
  startDate: string
  days: number
  shiftOverride?: ShiftOverride
}

interface ConflictingDay {
  date: string
  reason: string
}

/**
 * Formato alineado con el BO (`TemporaryAssignmentActiveInterface`) para monitor de asistencia
 * y reportes: sucursal efectiva por día = destino si el día cae en [startDate, endDate] inclusive.
 */
export interface TemporaryAssignmentReportRow {
  id: number
  employeeId: number
  sourceBranchId: number
  targetBranchId: number
  /** YYYY-MM-DD, misma convención que `day` en employeeCalendar (zona operativa UTC-6). */
  startDate: string
  /** YYYY-MM-DD inclusive (último día del préstamo cuenta en sucursal destino). */
  endDate: string
  days: number
  targetBranch: Record<string, unknown> | null
  shiftOverride: { startTime: string; endTime: string } | null
}

/** Slugs de los tipos de excepción que bloquean el préstamo */
const BLOCKING_EXCEPTION_SLUGS = ['vacation', 'incapacidad', 'permiso', 'work-disability']

export default class EmployeeTemporaryAssignmentService {
  /**
   * Crea un préstamo temporal para el empleado dado.
   * Valida: sucursal distinta, rango de días válido, no solapamiento con otro préstamo,
   * no conflicto con vacaciones/incapacidad/permiso registrados.
   */
  static async create(employeeId: number, payload: CreateTemporaryAssignmentPayload) {
    const { targetBranchId, startDate: startDateStr, days, shiftOverride } = payload

    const start = DateTime.fromISO(startDateStr, { zone: 'UTC-6' }).startOf('day')
    if (!start.isValid) {
      return {
        status: 400,
        type: 'error',
        title: 'Datos inválidos',
        message: 'La fecha de inicio no es válida. Usa el formato YYYY-MM-DD.',
        key: 'body-invalido',
        data: null,
      }
    }

    if (days < 1) {
      return {
        status: 400,
        type: 'error',
        title: 'Datos inválidos',
        message: 'El número de días debe ser mínimo 1.',
        key: 'dias-invalidos',
        data: null,
      }
    }

    const end = start.plus({ days: days - 1 }).endOf('day')

    await Employee.query()
      .where('employee_id', employeeId)
      .whereNull('employee_deleted_at')
      .firstOrFail()

    const sourceBranch = await this.getActiveBranch(employeeId)
    if (!sourceBranch) {
      return {
        status: 422,
        type: 'error',
        title: 'Sin sucursal asignada',
        message: 'El empleado no tiene una sucursal activa asignada.',
        key: 'sin-sucursal-origen',
        data: null,
      }
    }

    if (sourceBranch.branchOfficeId === targetBranchId) {
      return {
        status: 422,
        type: 'error',
        title: 'Sucursal destino inválida',
        message: 'La sucursal destino debe ser distinta a la sucursal habitual del empleado.',
        key: 'sucursal-destino-igual-a-origen',
        data: null,
      }
    }

    const targetBranch = await BranchOffice.query()
      .where('branch_office_id', targetBranchId)
      .whereNull('branch_office_deleted_at')
      .first()
    if (!targetBranch) {
      return {
        status: 422,
        type: 'error',
        title: 'Sucursal destino no encontrada',
        message: 'La sucursal destino no existe o fue eliminada.',
        key: 'sucursal-destino-no-encontrada',
        data: null,
      }
    }

    const startFormatted = start.toFormat('yyyy-MM-dd')
    const endFormatted = end.toFormat('yyyy-MM-dd')

    return await db.transaction(async (trx) => {
      const overlap = await EmployeeTemporaryAssignment.query({ client: trx })
        .where('employee_id', employeeId)
        .where('start_date', '<=', endFormatted)
        .where('end_date', '>=', startFormatted)
        .first()

      if (overlap) {
        return {
          status: 409,
          type: 'warning',
          title: 'Préstamo solapado',
          message: `El empleado ya tiene un préstamo activo del ${overlap.startDate.toFormat('yyyy-MM-dd')} al ${overlap.endDate.toFormat('yyyy-MM-dd')} que se solapa con el rango solicitado.`,
          key: 'prestamo-solapado',
          data: null,
        }
      }

      const conflictingDays = await this.findConflictingExceptions(
        employeeId,
        startFormatted,
        endFormatted,
        trx
      )

      if (conflictingDays.length > 0) {
        const dayList = conflictingDays.map((d) => d.date).join(', ')
        return {
          status: 409,
          type: 'warning',
          title: 'Conflicto con ausencias registradas',
          message: `El empleado tiene vacaciones, incapacidad o permiso en los siguientes días que se solapan con el rango propuesto: ${dayList}.`,
          key: 'conflicto-vacaciones-incapacidad-permiso',
          data: { conflictingDays },
        }
      }

      const assignment = await EmployeeTemporaryAssignment.create(
        {
          employeeId,
          sourceBranchId: sourceBranch.branchOfficeId,
          targetBranchId,
          startDate: start,
          endDate: end.startOf('day'),
          days,
          shiftOverrideStart: shiftOverride?.startTime ?? null,
          shiftOverrideEnd: shiftOverride?.endTime ?? null,
        },
        { client: trx }
      )

      await assignment.load('sourceBranch')
      await assignment.load('targetBranch')

      return {
        status: 201,
        type: 'success',
        title: 'Préstamo temporal creado',
        message: 'El préstamo temporal fue registrado correctamente.',
        key: null,
        data: {
          id: assignment.employeeTemporaryAssignmentId,
          employeeId: assignment.employeeId,
          sourceBranchId: assignment.sourceBranchId,
          targetBranchId: assignment.targetBranchId,
          startDate: assignment.startDate.toFormat('yyyy-MM-dd'),
          endDate: assignment.endDate.toFormat('yyyy-MM-dd'),
          days: assignment.days,
          shiftOverrideAppliesOnDate: assignment.shiftOverrideStart
            ? assignment.startDate.toFormat('yyyy-MM-dd')
            : null,
          shiftOverride: assignment.shiftOverrideStart
            ? {
                startTime: assignment.shiftOverrideStart,
                endTime: assignment.shiftOverrideEnd,
              }
            : null,
          createdAt: assignment.employeeTemporaryAssignmentCreatedAt.toISO(),
        },
      }
    })
  }

  /**
   * Devuelve el préstamo activo del empleado en la fecha indicada (o hoy si no se pasa).
   * Un préstamo es "activo" si la fecha dada está dentro de [startDate, endDate].
   */
  static async getActiveAssignment(
    employeeId: number,
    referenceDate?: DateTime
  ): Promise<EmployeeTemporaryAssignment | null> {
    const date = (referenceDate ?? DateTime.now().setZone('UTC-6')).toFormat('yyyy-MM-dd')
    return EmployeeTemporaryAssignment.query()
      .where('employee_id', employeeId)
      .where('start_date', '<=', date)
      .where('end_date', '>=', date)
      .preload('targetBranch')
      .first()
  }

  /**
   * Préstamos cuyo intervalo [startDate, endDate] intersecta el periodo del reporte/calendario.
   * Incluye préstamos consecutivos (B luego C). Orden determinista: start_date ASC, id ASC.
   * Usado por GET /api/v1/assists y employee-assist-calendars para el monitor de faltas por sucursal.
   */
  static async listIntersectingAssistPeriod(
    employeeId: number,
    periodStartYyyyMmDd: string,
    periodEndYyyyMmDd: string
  ): Promise<TemporaryAssignmentReportRow[]> {
    const rows = await EmployeeTemporaryAssignment.query()
      .where('employee_id', employeeId)
      .where('start_date', '<=', periodEndYyyyMmDd)
      .where('end_date', '>=', periodStartYyyyMmDd)
      .orderBy('start_date', 'asc')
      .orderBy('employee_temporary_assignment_id', 'asc')
      .preload('targetBranch')

    return rows.map((a) => this.toReportRow(a))
  }

  static toReportRow(assignment: EmployeeTemporaryAssignment): TemporaryAssignmentReportRow {
    const targetBranch = assignment.targetBranch
    return {
      id: assignment.employeeTemporaryAssignmentId,
      employeeId: assignment.employeeId,
      sourceBranchId: assignment.sourceBranchId,
      targetBranchId: assignment.targetBranchId,
      startDate: assignment.startDate.toFormat('yyyy-MM-dd'),
      endDate: assignment.endDate.toFormat('yyyy-MM-dd'),
      days: assignment.days,
      targetBranch: targetBranch ? (targetBranch.serialize() as Record<string, unknown>) : null,
      shiftOverride: assignment.shiftOverrideStart
        ? {
            startTime: assignment.shiftOverrideStart,
            endTime: assignment.shiftOverrideEnd ?? '',
          }
        : null,
    }
  }

  /**
   * Retorna la sucursal activa actual del empleado desde la tabla employee_branch_offices.
   */
  private static async getActiveBranch(employeeId: number): Promise<BranchOffice | null> {
    const { default: EmployeeBranchOffice } = await import('#models/employee_branch_office')
    const active = await EmployeeBranchOffice.query()
      .where('employee_id', employeeId)
      .where('employee_branch_office_active', 1)
      .preload('branchOffice')
      .first()
    return active?.branchOffice ?? null
  }

  /**
   * Busca excepciones de turno con tipo "vacación", "incapacidad" o "permiso"
   * que caigan dentro del rango [startDate, endDate].
   */
  private static async findConflictingExceptions(
    employeeId: number,
    startDate: string,
    endDate: string,
    trx: any
  ): Promise<ConflictingDay[]> {
    const blockingTypes = await ExceptionType.query({ client: trx })
      .whereIn('exception_type_slug', BLOCKING_EXCEPTION_SLUGS)
      .whereNull('exception_type_deleted_at')
      .select('exception_type_id', 'exception_type_type_name')

    if (blockingTypes.length === 0) return []

    const blockingIds = blockingTypes.map((t) => t.exceptionTypeId)

    const exceptions = await ShiftException.query({ client: trx })
      .where('employee_id', employeeId)
      .whereIn('exception_type_id', blockingIds)
      .whereNull('shift_exceptions_deleted_at')
      .whereBetween('shift_exceptions_date', [startDate, endDate])
      .preload('exceptionType')

    return exceptions.map((ex) => ({
      date:
        typeof ex.shiftExceptionsDate === 'string'
          ? ex.shiftExceptionsDate.substring(0, 10)
          : DateTime.fromJSDate(ex.shiftExceptionsDate as any)
              .setZone('UTC-6')
              .toFormat('yyyy-MM-dd'),
      reason: ex.exceptionType?.exceptionTypeTypeName ?? 'Ausencia registrada',
    }))
  }
}
