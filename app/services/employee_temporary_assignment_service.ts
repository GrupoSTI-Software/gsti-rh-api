import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import Employee from '#models/employee'
import BranchOffice from '#models/branch_office'
import EmployeeTemporaryAssignment from '#models/employee_temporary_assignment'
import ShiftException from '#models/shift_exception'
import ExceptionType from '#models/exception_type'
import BranchOfficeShiftQuota from '#models/branch_office_shift_quota'

interface ShiftOverride {
  startTime: string
  endTime: string
}

interface CreateTemporaryAssignmentPayload {
  targetBranchId: number
  startDate: string
  days: number
  reason?: string | null
  destinationShiftId?: number | null
  shiftOverride?: ShiftOverride
}

interface UpdateTemporaryAssignmentPayload {
  startDate?: string
  days?: number
  reason?: string | null
  destinationShiftId?: number | null
}

interface CancelTemporaryAssignmentPayload {
  cancelDate: string
}

interface ConflictingDay {
  date: string
  reason: string
}

interface ListTemporaryAssignmentPayload {
  from?: string
  to?: string
}

/** Slugs de los tipos de excepción que bloquean el préstamo */
const BLOCKING_EXCEPTION_SLUGS = ['vacation', 'incapacidad', 'permiso', 'work-disability']
const ZONE = 'UTC-6'
const MAX_TEMPORARY_ASSIGNMENT_DAYS = 365
type AssignmentStatus = 'borrador' | 'vigente' | 'vencido' | 'cancelado'

export default class EmployeeTemporaryAssignmentService {
  /**
   * Crea un préstamo temporal para el empleado dado.
   * Valida: sucursal distinta, rango de días válido, no solapamiento con otro préstamo,
   * no conflicto con vacaciones/incapacidad/permiso registrados.
   */
  static async create(employeeId: number, payload: CreateTemporaryAssignmentPayload) {
    const {
      targetBranchId,
      startDate: startDateStr,
      days,
      shiftOverride,
      reason = null,
      destinationShiftId = null,
    } = payload

    const start = DateTime.fromISO(startDateStr, { zone: ZONE }).startOf('day')
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

    if (days < 1 || days > MAX_TEMPORARY_ASSIGNMENT_DAYS) {
      return {
        status: 400,
        type: 'error',
        title: 'Datos inválidos',
        message: `El número de días debe estar entre 1 y ${MAX_TEMPORARY_ASSIGNMENT_DAYS}.`,
        key: 'dias-invalidos',
        data: null,
      }
    }

    const end = start.plus({ days: days - 1 }).startOf('day')

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
      const activeAssignmentAtStart = await this.getActiveAssignment(employeeId, start)
      if (
        activeAssignmentAtStart &&
        activeAssignmentAtStart.targetBranchId !== sourceBranch.branchOfficeId
      ) {
        return {
          status: 409,
          type: 'warning',
          title: 'Préstamo activo vigente',
          message:
            'El empleado ya tiene un préstamo activo. Para regresarlo a su sucursal habitual primero cancela el préstamo vigente.',
          key: 'debe-cancelar-prestamo-activo',
          data: {
            activeAssignmentId: activeAssignmentAtStart.employeeTemporaryAssignmentId,
          },
        }
      }

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

    if (destinationShiftId !== null) {
      const destinationShiftIsConfigured = await this.hasDestinationShiftQuota(
        targetBranchId,
        destinationShiftId
      )
      if (!destinationShiftIsConfigured) {
        return {
          status: 422,
          type: 'error',
          title: 'Turno destino no configurado',
          message: 'El turno destino no está configurado para el sitio destino.',
          key: 'turno-destino-no-configurado',
          data: null,
        }
      }
    }

    return await db.transaction(async (trx) => {
      const overlapCandidates = await EmployeeTemporaryAssignment.query({ client: trx })
        .where('employee_id', employeeId)
        .where('start_date', '<=', endFormatted)
        .where('end_date', '>=', startFormatted)
        .orderBy('employee_temporary_assignment_id', 'desc')

      const overlap = overlapCandidates.find((candidate) =>
        this.assignmentOverlapsRange(candidate, start, end)
      )
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
          endDate: end,
          days,
          reason,
          destinationShiftId,
          shiftOverrideStart: shiftOverride?.startTime ?? null,
          shiftOverrideEnd: shiftOverride?.endTime ?? null,
        },
        { client: trx }
      )

      await assignment.load('sourceBranch')
      await assignment.load('targetBranch')
      await assignment.load('destinationShift')

      return {
        status: 201,
        type: 'success',
        title: 'Préstamo temporal creado',
        message: 'El préstamo temporal fue registrado correctamente.',
        key: null,
        data: this.serializeAssignment(assignment),
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
    const date = (referenceDate ?? DateTime.now().setZone(ZONE)).toFormat('yyyy-MM-dd')
    return EmployeeTemporaryAssignment.query()
      .where('employee_id', employeeId)
      .where('start_date', '<=', date)
      .where('end_date', '>=', date)
      .where((query) => {
        query.whereNull('cancelled_at').orWhere('cancelled_at', '>', date)
      })
      .preload('targetBranch')
      .preload('destinationShift')
      .orderBy('employee_temporary_assignment_id', 'desc')
      .first()
  }

  static async update(
    employeeId: number,
    id: number,
    payload: UpdateTemporaryAssignmentPayload
  ) {
    const assignment = await EmployeeTemporaryAssignment.query()
      .where('employee_temporary_assignment_id', id)
      .where('employee_id', employeeId)
      .first()

    if (!assignment) {
      return {
        status: 404,
        type: 'error',
        title: 'Préstamo no encontrado',
        message: 'No se encontró el préstamo temporal solicitado.',
        key: 'prestamo-no-encontrado',
        data: null,
      }
    }

    const today = DateTime.now().setZone(ZONE).startOf('day')
    if (assignment.endDate < today) {
      return {
        status: 409,
        type: 'warning',
        title: 'Préstamo no editable',
        message: 'No se puede editar un préstamo cuya vigencia ya transcurrió.',
        key: 'prestamo-no-editable',
        data: null,
      }
    }

    const start = payload.startDate
      ? DateTime.fromISO(payload.startDate, { zone: ZONE }).startOf('day')
      : assignment.startDate.startOf('day')
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

    const days = payload.days ?? assignment.days
    if (days < 1 || days > MAX_TEMPORARY_ASSIGNMENT_DAYS) {
      return {
        status: 400,
        type: 'error',
        title: 'Datos inválidos',
        message: `El número de días debe estar entre 1 y ${MAX_TEMPORARY_ASSIGNMENT_DAYS}.`,
        key: 'dias-invalidos',
        data: null,
      }
    }

    const end = start.plus({ days: days - 1 }).startOf('day')
    const destinationShiftId =
      payload.destinationShiftId !== undefined ? payload.destinationShiftId : assignment.destinationShiftId
    const reason = payload.reason !== undefined ? payload.reason : assignment.reason

    const sourceBranch = await BranchOffice.query()
      .where('branch_office_id', assignment.sourceBranchId)
      .whereNull('branch_office_deleted_at')
      .first()
    const targetBranch = await BranchOffice.query()
      .where('branch_office_id', assignment.targetBranchId)
      .whereNull('branch_office_deleted_at')
      .first()
    const employee = await Employee.query()
      .where('employee_id', employeeId)
      .whereNull('employee_deleted_at')
      .first()

    if (!employee || !sourceBranch || !targetBranch) {
      return {
        status: 409,
        type: 'warning',
        title: 'Préstamo no editable',
        message: 'No se puede editar un préstamo con empleado o sucursales en estado terminal.',
        key: 'prestamo-no-editable',
        data: null,
      }
    }

    if (destinationShiftId !== null) {
      const destinationShiftIsConfigured = await this.hasDestinationShiftQuota(
        assignment.targetBranchId,
        destinationShiftId
      )
      if (!destinationShiftIsConfigured) {
        return {
          status: 422,
          type: 'error',
          title: 'Turno destino no configurado',
          message: 'El turno destino no está configurado para el sitio destino.',
          key: 'turno-destino-no-configurado',
          data: null,
        }
      }
    }

    const startFormatted = start.toFormat('yyyy-MM-dd')
    const endFormatted = end.toFormat('yyyy-MM-dd')

    return await db.transaction(async (trx) => {
      const overlapCandidates = await EmployeeTemporaryAssignment.query({ client: trx })
        .where('employee_id', employeeId)
        .where('employee_temporary_assignment_id', '!=', id)
        .where('start_date', '<=', endFormatted)
        .where('end_date', '>=', startFormatted)
        .orderBy('employee_temporary_assignment_id', 'desc')

      const overlap = overlapCandidates.find((candidate) =>
        this.assignmentOverlapsRange(candidate, start, end)
      )
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

      assignment.useTransaction(trx)
      assignment.startDate = start
      assignment.endDate = end
      assignment.days = days
      assignment.reason = reason ?? null
      assignment.destinationShiftId = destinationShiftId ?? null
      await assignment.save()

      await assignment.load('sourceBranch')
      await assignment.load('targetBranch')
      await assignment.load('destinationShift')

      return {
        status: 200,
        type: 'success',
        title: 'Préstamo temporal actualizado',
        message: 'El préstamo temporal fue actualizado correctamente.',
        key: null,
        data: this.serializeAssignment(assignment),
      }
    })
  }

  static async cancel(
    employeeId: number,
    id: number,
    payload: CancelTemporaryAssignmentPayload
  ) {
    const assignment = await EmployeeTemporaryAssignment.query()
      .where('employee_temporary_assignment_id', id)
      .where('employee_id', employeeId)
      .first()

    if (!assignment) {
      return {
        status: 404,
        type: 'error',
        title: 'Préstamo no encontrado',
        message: 'No se encontró el préstamo temporal solicitado.',
        key: 'prestamo-no-encontrado',
        data: null,
      }
    }

    const cancelDate = DateTime.fromISO(payload.cancelDate, { zone: ZONE }).startOf('day')
    if (!cancelDate.isValid) {
      return {
        status: 400,
        type: 'error',
        title: 'Datos inválidos',
        message: 'La fecha de cancelación no es válida. Usa el formato YYYY-MM-DD.',
        key: 'fecha-cancelacion-invalida',
        data: null,
      }
    }

    const cancelDay = cancelDate.toISODate()
    const startDay = assignment.startDate.toISODate()
    const endDay = assignment.endDate.toISODate()

    if (!cancelDay || !startDay || !endDay) {
      return {
        status: 400,
        type: 'error',
        title: 'Datos inválidos',
        message: 'No fue posible validar la fecha de cancelación del préstamo.',
        key: 'fecha-cancelacion-invalida',
        data: null,
      }
    }

    if (cancelDay < startDay || cancelDay > endDay) {
      return {
        status: 400,
        type: 'error',
        title: 'Datos inválidos',
        message: 'La fecha de cancelación debe estar dentro de la vigencia del préstamo.',
        key: 'fecha-cancelacion-fuera-vigencia',
        data: null,
      }
    }

    if (!this.isAssignmentActiveAt(assignment, cancelDate)) {
      return {
        status: 409,
        type: 'warning',
        title: 'Préstamo no editable',
        message: 'El préstamo no está vigente para la fecha de cancelación indicada.',
        key: 'prestamo-no-editable',
        data: null,
      }
    }

    assignment.cancelledAt = cancelDate
    await assignment.save()

    return {
      status: 200,
      type: 'success',
      title: 'Préstamo temporal cancelado',
      message: 'El préstamo temporal fue cancelado correctamente.',
      key: null,
      data: {
        id: assignment.employeeTemporaryAssignmentId,
        cancelledAt: assignment.cancelledAt.toFormat('yyyy-MM-dd'),
        effectiveEndDate: this.getEffectiveEndDate(assignment),
      },
    }
  }

  static async list(employeeId: number, filters: ListTemporaryAssignmentPayload) {
    const query = EmployeeTemporaryAssignment.query()
      .where('employee_id', employeeId)
      .orderBy('start_date', 'desc')
      .preload('sourceBranch')
      .preload('targetBranch')
      .preload('destinationShift')

    if (filters.from) {
      query.where('end_date', '>=', filters.from)
    }
    if (filters.to) {
      query.where('start_date', '<=', filters.to)
    }

    const assignments = await query

    return {
      status: 200,
      type: 'success',
      title: 'Historial de préstamos',
      message: 'Historial de préstamos obtenido correctamente.',
      key: null,
      data: {
        assignments: assignments.map((assignment) => this.serializeAssignment(assignment)),
      },
    }
  }

  static async destroy(employeeId: number, id: number) {
    const assignment = await EmployeeTemporaryAssignment.query()
      .where('employee_temporary_assignment_id', id)
      .where('employee_id', employeeId)
      .first()

    if (!assignment) {
      return {
        status: 404,
        type: 'error',
        title: 'Préstamo no encontrado',
        message: 'No se encontró el préstamo temporal solicitado.',
        key: 'prestamo-no-encontrado',
        data: null,
      }
    }

    await assignment.delete()
    return {
      status: 200,
      type: 'success',
      title: 'Préstamo temporal eliminado',
      message: 'El préstamo temporal fue eliminado correctamente.',
      key: null,
      data: {
        id: assignment.employeeTemporaryAssignmentId,
        deletedAt: assignment.deletedAt?.toISO() ?? DateTime.now().setZone(ZONE).toISO(),
      },
    }
  }

  static async cancelActiveAssignmentsByEmployee(employeeId: number, eventDate: string) {
    const day = DateTime.fromISO(eventDate, { zone: ZONE }).startOf('day')
    if (!day.isValid) return

    await EmployeeTemporaryAssignment.query()
      .where('employee_id', employeeId)
      .where('start_date', '<=', day.toFormat('yyyy-MM-dd'))
      .where('end_date', '>=', day.toFormat('yyyy-MM-dd'))
      .where((query) => {
        query.whereNull('cancelled_at').orWhere('cancelled_at', '>', day.toFormat('yyyy-MM-dd'))
      })
      .update({ cancelled_at: day.toISODate() })
  }

  static async cancelActiveAssignmentsByBranch(branchOfficeId: number, eventDate: string) {
    const day = DateTime.fromISO(eventDate, { zone: ZONE }).startOf('day')
    if (!day.isValid) return

    await EmployeeTemporaryAssignment.query()
      .where((query) => {
        query.where('source_branch_id', branchOfficeId).orWhere('target_branch_id', branchOfficeId)
      })
      .where('start_date', '<=', day.toFormat('yyyy-MM-dd'))
      .where('end_date', '>=', day.toFormat('yyyy-MM-dd'))
      .where((query) => {
        query.whereNull('cancelled_at').orWhere('cancelled_at', '>', day.toFormat('yyyy-MM-dd'))
      })
      .update({ cancelled_at: day.toISODate() })
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
              .setZone(ZONE)
              .toFormat('yyyy-MM-dd'),
      reason: ex.exceptionType?.exceptionTypeTypeName ?? 'Ausencia registrada',
    }))
  }

  private static serializeAssignment(assignment: EmployeeTemporaryAssignment) {
    return {
      id: assignment.employeeTemporaryAssignmentId,
      employeeId: assignment.employeeId,
      sourceBranchId: assignment.sourceBranchId,
      targetBranchId: assignment.targetBranchId,
      startDate: assignment.startDate.toFormat('yyyy-MM-dd'),
      endDate: assignment.endDate.toFormat('yyyy-MM-dd'),
      effectiveEndDate: this.getEffectiveEndDate(assignment),
      days: assignment.days,
      reason: assignment.reason,
      destinationShiftId: assignment.destinationShiftId,
      destinationShift: assignment.destinationShift
        ? {
            shiftId: assignment.destinationShift.shiftId,
            shiftName: assignment.destinationShift.shiftName,
          }
        : null,
      status: this.resolveAssignmentStatus(assignment),
      cancelledAt: assignment.cancelledAt ? assignment.cancelledAt.toFormat('yyyy-MM-dd') : null,
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
      updatedAt: assignment.employeeTemporaryAssignmentUpdatedAt.toISO(),
    }
  }

  private static resolveAssignmentStatus(
    assignment: EmployeeTemporaryAssignment,
    referenceDate = DateTime.now().setZone(ZONE).startOf('day')
  ): AssignmentStatus {
    const referenceDay = referenceDate.toISODate()
    const startDay = assignment.startDate.toISODate()
    const endDay = assignment.endDate.toISODate()

    if (!referenceDay || !startDay || !endDay) {
      return 'vigente'
    }

    if (assignment.cancelledAt) {
      return 'cancelado'
    }
    if (referenceDay < startDay) {
      return 'borrador'
    }
    if (referenceDay > endDay) {
      return 'vencido'
    }
    return 'vigente'
  }

  private static getEffectiveEndDate(assignment: EmployeeTemporaryAssignment): string {
    const endDate = assignment.endDate.startOf('day')
    if (!assignment.cancelledAt) {
      return endDate.toFormat('yyyy-MM-dd')
    }

    const cancelledAt = assignment.cancelledAt.startOf('day')
    const effectiveEnd = cancelledAt.minus({ days: 1 })
    return (effectiveEnd < assignment.startDate.startOf('day') ? assignment.startDate.minus({ days: 1 }) : effectiveEnd).toFormat('yyyy-MM-dd')
  }

  private static isAssignmentActiveAt(
    assignment: EmployeeTemporaryAssignment,
    day: DateTime
  ): boolean {
    const currentDay = day.toISODate()
    const startDay = assignment.startDate.toISODate()
    const endDay = assignment.endDate.toISODate()

    if (!currentDay || !startDay || !endDay) {
      return false
    }

    if (currentDay < startDay || currentDay > endDay) {
      return false
    }

    const cancelledDay = assignment.cancelledAt?.toISODate()
    if (cancelledDay && currentDay >= cancelledDay) {
      return false
    }

    return true
  }

  private static assignmentOverlapsRange(
    assignment: EmployeeTemporaryAssignment,
    start: DateTime,
    end: DateTime
  ): boolean {
    const assignmentStart = assignment.startDate.startOf('day')
    const assignmentEffectiveEnd = assignment.cancelledAt
      ? DateTime.min(assignment.endDate.startOf('day'), assignment.cancelledAt.startOf('day').minus({ days: 1 }))
      : assignment.endDate.startOf('day')

    if (assignmentEffectiveEnd < assignmentStart) {
      return false
    }

    return assignmentStart <= end && assignmentEffectiveEnd >= start
  }

  private static async hasDestinationShiftQuota(
    branchOfficeId: number,
    destinationShiftId: number
  ): Promise<boolean> {
    const quota = await BranchOfficeShiftQuota.query()
      .where('branch_office_id', branchOfficeId)
      .where('shift_id', destinationShiftId)
      .preload('shift')
      .first()

    return Boolean(quota)
  }
}
