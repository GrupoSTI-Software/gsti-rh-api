import path from 'node:path'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import env from '#start/env'
import OnboardingError from '#exceptions/onboarding_error'
import ApiToken from '#models/api_token'
import Assist from '#models/assist'
import BusinessUnitUser from '#models/business_unit_user'
import Department from '#models/department'
import DepartmentPosition from '#models/department_position'
import Employee from '#models/employee'
import EmployeeAssistCalendar from '#models/employee_assist_calendar'
import EmployeeDevice from '#models/employee_device'
import EmployeeProceedingFile from '#models/employee_proceeding_file'
import EmployeeRecord from '#models/employee_record'
import EmployeeShift from '#models/employee_shift'
import EmployeeVacationArchive from '#models/employee_vacation_archive'
import EmployeeVacationArchiveContent from '#models/employee_vacation_archive_content'
import ExceptionRequest from '#models/exception_request'
import OnboardingSeededRecord from '#models/onboarding_seeded_record'
import OnboardingUserState from '#models/onboarding_user_state'
import Person from '#models/person'
import Position from '#models/position'
import ProceedingFile from '#models/proceeding_file'
import Shift from '#models/shift'
import ShiftException from '#models/shift_exception'
import ShiftExceptionEvidence from '#models/shift_exception_evidence'
import User from '#models/user'
import UserFcmToken from '#models/user_fcm_token'
import UserResponsibleEmployee from '#models/user_responsible_employee'
import UploadService from '#services/upload_service'
import Ws from '#services/ws'
import type { OnboardingSeededEntityType } from '#modules/onboarding/onboarding.constants'

/** Insumos planos del wipe (requisito de frontera: sin HttpContext ni TenantContext). */
export interface WipeDemoSeedInput {
  /** Estado a limpiar; en el flujo HTTP se resuelve desde auth.user.userId. */
  adminUserId?: number
  /** Alternativa directa para corridas internas (purga de abandonados). */
  onboardingUserStateId?: number
  /** BU del header en el flujo HTTP; omitido en corridas internas. */
  expectedBusinessUnitId?: number
  /** Ausente = NO fijar status terminal (modo purga, USRH1785438247062). */
  outcome?: 'completed' | 'dismissed'
}

/** Conteos por tabla del borrado (constancia de la corrida). */
export interface WipeCounts {
  assists: number
  employeeAssistCalendar: number
  shiftExceptions: number
  shiftExceptionEvidences: number
  exceptionRequests: number
  employeeRecords: number
  employeeProceedingFiles: number
  employeeVacationArchives: number
  employeeDevices: number
  userResponsibleEmployees: number
  apiTokens: number
  userFcmTokens: number
  businessUnitUsers: number
  employeeShifts: number
  users: number
  employees: number
  people: number
  departmentPositions: number
  positions: number
  departments: number
  shifts: number
}

export interface WipeResultDto {
  outcome: 'completed' | 'dismissed' | null
  alreadyWiped: boolean
  wiped: WipeCounts
}

/** Protocolo mínimo de una fila con soft delete para el fallback hard→soft. */
interface SoftDeletableRow {
  useTransaction(trx: TransactionClientContract): unknown
  forceDelete(): Promise<void>
  delete(): Promise<void>
}

/**
 * Borrado transaccional de los datos de práctica del onboarding
 * (USRH1785438246903): todo-o-nada, por IDs registrados en
 * `onboarding_seeded_records` más lo derivado del empleado/usuario demo,
 * validando el snapshot de BU. Un dato real colgado de un padre demo degrada
 * ese padre a soft-delete con constancia en log — la fila real jamás se toca.
 *
 * Primero se borra y después se cierra: el status terminal (outcome) solo se
 * fija cuando la limpieza completó; sin outcome (modo purga) el recorrido
 * queda tal cual. Idempotente: sin siembra activa responde alreadyWiped y
 * aplica el outcome pedido (FIN/OMITIR siempre pueden cerrar el onboarding).
 */
export default class DemoWipeService {
  async wipeDemoSeed(input: WipeDemoSeedInput): Promise<WipeResultDto> {
    const counts = this.emptyCounts()
    const pendingS3Keys: string[] = []
    let demoUserEmail: string | null = null

    const alreadyWiped = await db.transaction(async (trx) => {
      const state = await this.lockState(input, trx)
      const records = await OnboardingSeededRecord.query({ client: trx })
        .where('onboarding_user_state_id', state.onboardingUserStateId)
        .orderBy('onboarding_seeded_record_id')

      // Doble condición fail-closed: con BU esperada distinta al snapshot no
      // se borra absolutamente nada.
      if (records.length > 0 && input.expectedBusinessUnitId !== undefined) {
        const snapshotBusinessUnitId = records[0].businessUnitId
        if (snapshotBusinessUnitId !== input.expectedBusinessUnitId) {
          throw new OnboardingError(
            'siembra-demo-unidad-invalida',
            'Onboarding',
            'La siembra de práctica pertenece a otra unidad de negocio.'
          )
        }
      }

      const hasActiveSeed = !!state.demoSeededAt && !state.demoCleanedAt
      if (!hasActiveSeed && records.length === 0) {
        // Nada que borrar: cerrar el recorrido si así se pidió.
        await this.markState(state, input.outcome, false, trx)
        return true
      }

      const ids = this.groupIdsByType(records)
      const demoUserId = ids.get('user')?.[0] ?? null
      const demoEmployeeId = ids.get('employee')?.[0] ?? null

      // ── Rama USER demo ────────────────────────────────────────────────────
      if (demoUserId) {
        counts.apiTokens += await this.hardDeleteCount(
          ApiToken.query({ client: trx }).where('tokenable_id', demoUserId).delete()
        )
        counts.userFcmTokens += await this.hardDeleteCount(
          UserFcmToken.query({ client: trx }).where('user_id', demoUserId).delete()
        )
        counts.businessUnitUsers += await this.hardDeleteCount(
          BusinessUnitUser.query({ client: trx }).where('user_id', demoUserId).delete()
        )
        const demoUser = await User.query({ client: trx })
          .withTrashed()
          .where('user_id', demoUserId)
          .first()
        if (demoUser) {
          demoUserEmail = demoUser.userEmail
          counts.users += await this.forceDeleteWithFallback(demoUser, `user ${demoUserId}`, trx)
        }
      }

      // ── Rama EMPLEADO demo (IDs registrados + derivados por pertenencia) ──
      if (demoEmployeeId) {
        const demoEmployee = await Employee.query({ client: trx })
          .withTrashed()
          .where('employee_id', demoEmployeeId)
          .first()
        const employeeCode = demoEmployee ? String(demoEmployee.employeeCode ?? '') : ''

        const trackedAssistIds = ids.get('assist') ?? []
        if (demoEmployee?.businessUnitId) {
          counts.assists += await this.hardDeleteCount(
            Assist.query({ client: trx })
              .where('business_unit_id', demoEmployee.businessUnitId)
              .where((query) => {
                query.whereIn('assist_id', trackedAssistIds.length > 0 ? trackedAssistIds : [0])
                if (employeeCode) {
                  // Backstop por pertenencia: cubre checadas reales hechas desde
                  // la app durante el tour (no llevan el alias simulado).
                  query.orWhere('assist_emp_code', employeeCode)
                }
              })
              .delete()
          )
        }

        counts.employeeAssistCalendar += await this.hardDeleteCount(
          EmployeeAssistCalendar.query({ client: trx })
            .where('employee_id', demoEmployeeId)
            .delete()
        )

        // Archivo de vacaciones (si el tour lo generó): pivote → contenidos → archivos.
        const archives = await EmployeeVacationArchive.query({ client: trx })
          .withTrashed()
          .where('employee_id', demoEmployeeId)
        if (archives.length > 0) {
          const archiveIds = archives.map((archive) => archive.employeeVacationArchiveId)
          const contents = await EmployeeVacationArchiveContent.query({ client: trx })
            .withTrashed()
            .whereIn('employee_vacation_archive_id', archiveIds)
          const contentIds = contents.map((content) => content.employeeVacationArchiveContentId)
          for (const content of contents) {
            if (content.employeeVacationArchiveContentFile) {
              pendingS3Keys.push(content.employeeVacationArchiveContentFile)
            }
          }
          if (contentIds.length > 0) {
            await trx
              .from('employee_vacation_archive_content_shift_exceptions')
              .whereIn('employee_vacation_archive_content_id', contentIds)
              .delete()
            await EmployeeVacationArchiveContent.query({ client: trx })
              .whereIn('employee_vacation_archive_content_id', contentIds)
              .delete()
          }
          counts.employeeVacationArchives += await this.hardDeleteCount(
            EmployeeVacationArchive.query({ client: trx })
              .whereIn('employee_vacation_archive_id', archiveIds)
              .delete()
          )
        }

        // Excepciones del empleado demo (las sembradas y las creadas en el tour).
        const demoExceptions = await ShiftException.query({ client: trx })
          .withTrashed()
          .where('employee_id', demoEmployeeId)
          .select('shift_exception_id')
        const demoExceptionIds = demoExceptions.map((exception) => exception.shiftExceptionId)
        if (demoExceptionIds.length > 0) {
          await trx
            .from('employee_vacation_archive_content_shift_exceptions')
            .whereIn('shift_exception_id', demoExceptionIds)
            .delete()
          counts.shiftExceptionEvidences += await this.hardDeleteCount(
            ShiftExceptionEvidence.query({ client: trx })
              .whereIn('shift_exception_id', demoExceptionIds)
              .delete()
          )
        }
        counts.shiftExceptions += await this.hardDeleteCount(
          ShiftException.query({ client: trx }).where('employee_id', demoEmployeeId).delete()
        )
        counts.exceptionRequests += await this.hardDeleteCount(
          ExceptionRequest.query({ client: trx }).where('employee_id', demoEmployeeId).delete()
        )

        // Documentos de expediente subidos durante el tour (S3 post-commit).
        const employeeProceedingFiles = await EmployeeProceedingFile.query({ client: trx })
          .withTrashed()
          .where('employee_id', demoEmployeeId)
        const proceedingFileIds = employeeProceedingFiles.map(
          (record) => record.proceedingFileId
        )
        counts.employeeProceedingFiles += await this.hardDeleteCount(
          EmployeeProceedingFile.query({ client: trx })
            .where('employee_id', demoEmployeeId)
            .delete()
        )
        if (proceedingFileIds.length > 0) {
          const proceedingFiles = await ProceedingFile.query({ client: trx })
            .withTrashed()
            .whereIn('proceeding_file_id', proceedingFileIds)
          for (const file of proceedingFiles) {
            if (file.proceedingFilePath) {
              const fileName = decodeURIComponent(path.basename(file.proceedingFilePath))
              pendingS3Keys.push(`${env.get('AWS_ROOT_PATH')}/proceeding-files/${fileName}`)
            }
          }
          counts.employeeProceedingFiles += await this.hardDeleteCount(
            ProceedingFile.query({ client: trx })
              .whereIn('proceeding_file_id', proceedingFileIds)
              .delete()
          )
        }

        counts.employeeRecords += await this.hardDeleteCount(
          EmployeeRecord.query({ client: trx }).where('employee_id', demoEmployeeId).delete()
        )
        // Vínculo del celular: sin esto, el teléfono del admin queda bloqueado
        // para ligarse a un empleado real después.
        counts.employeeDevices += await this.hardDeleteCount(
          EmployeeDevice.query({ client: trx }).where('employee_id', demoEmployeeId).delete()
        )
        // Responsables del empleado demo (el admin que sembró, y cualquier
        // asignación hecha durante el tour).
        counts.userResponsibleEmployees += await this.hardDeleteCount(
          UserResponsibleEmployee.query({ client: trx })
            .where('employee_id', demoEmployeeId)
            .delete()
        )
        counts.employeeShifts += await this.hardDeleteCount(
          EmployeeShift.query({ client: trx }).where('employee_id', demoEmployeeId).delete()
        )

        if (demoEmployee) {
          counts.employees += await this.forceDeleteWithFallback(
            demoEmployee,
            `employee ${demoEmployeeId}`,
            trx
          )
        }
      }

      // ── Persona y estructura demo ─────────────────────────────────────────
      const personId = ids.get('person')?.[0] ?? null
      if (personId) {
        const person = await Person.query({ client: trx })
          .withTrashed()
          .where('person_id', personId)
          .first()
        if (person) {
          counts.people += await this.forceDeleteWithFallback(person, `person ${personId}`, trx)
        }
      }

      const departmentPositionId = ids.get('department_position')?.[0] ?? null
      if (departmentPositionId) {
        const departmentPosition = await DepartmentPosition.query({ client: trx })
          .withTrashed()
          .where('department_position_id', departmentPositionId)
          .first()
        if (departmentPosition) {
          counts.departmentPositions += await this.forceDeleteWithFallback(
            departmentPosition,
            `department_position ${departmentPositionId}`,
            trx
          )
        }
      }

      const positionId = ids.get('position')?.[0] ?? null
      if (positionId) {
        const position = await Position.query({ client: trx })
          .withTrashed()
          .where('position_id', positionId)
          .first()
        if (position) {
          counts.positions += await this.forceDeleteWithFallback(
            position,
            `position ${positionId}`,
            trx
          )
        }
      }

      const departmentId = ids.get('department')?.[0] ?? null
      if (departmentId) {
        const department = await Department.query({ client: trx })
          .withTrashed()
          .where('department_id', departmentId)
          .first()
        if (department) {
          counts.departments += await this.forceDeleteWithFallback(
            department,
            `department ${departmentId}`,
            trx
          )
        }
      }

      // Turno: sin mixin SoftDeletes — hard solo si ningún otro empleado lo usa.
      const shiftId = ids.get('shift')?.[0] ?? null
      if (shiftId) {
        const otherAssignments = await EmployeeShift.query({ client: trx })
          .where('shift_id', shiftId)
          .first()
        if (!otherAssignments) {
          counts.shifts += await this.hardDeleteCount(
            Shift.query({ client: trx }).where('shift_id', shiftId).delete()
          )
        } else {
          const shiftRow = await Shift.query({ client: trx }).where('shift_id', shiftId).first()
          if (shiftRow) {
            shiftRow.useTransaction(trx)
            shiftRow.shiftDeletedAt = DateTime.now()
            await shiftRow.save()
            counts.shifts += 1
          }
          logger.warn(
            `DemoWipeService: el turno demo ${shiftId} tiene asignaciones reales; fallback a soft-delete manual`
          )
        }
      }

      // Tracking consumido y estado marcado — SIEMPRE después del borrado.
      await OnboardingSeededRecord.query({ client: trx })
        .where('onboarding_user_state_id', state.onboardingUserStateId)
        .delete()
      await this.markState(state, input.outcome, true, trx)
      return false
    })

    // Efectos externos post-commit: logout WS y objetos S3 acumulados.
    if (demoUserEmail !== null) {
      const logoutEvent = `user-forze-logout:${demoUserEmail}`
      if (Ws.io) {
        Ws.io.emit(logoutEvent, {})
      }
    }
    if (pendingS3Keys.length > 0) {
      const uploadService = new UploadService()
      for (const key of pendingS3Keys) {
        try {
          await uploadService.deleteFile(key)
        } catch (error) {
          // Nunca al revés: el dato ya no es visible; el objeto huérfano queda
          // logueado para limpieza posterior.
          logger.error(
            `DemoWipeService: objeto S3 huérfano tras el wipe (${key}): ${error instanceof Error ? error.message : 'desconocido'}`
          )
        }
      }
    }

    return { outcome: input.outcome ?? null, alreadyWiped, wiped: counts }
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  private async lockState(
    input: WipeDemoSeedInput,
    trx: TransactionClientContract
  ): Promise<OnboardingUserState> {
    if (input.onboardingUserStateId) {
      const state = await OnboardingUserState.query({ client: trx })
        .where('onboarding_user_state_id', input.onboardingUserStateId)
        .forUpdate()
        .first()
      if (!state) {
        throw new OnboardingError(
          'siembra-demo-no-encontrada',
          'Onboarding',
          'No existe el estado de onboarding indicado.'
        )
      }
      return state
    }

    if (!input.adminUserId) {
      throw new OnboardingError(
        'siembra-demo-no-encontrada',
        'Onboarding',
        'Se requiere el usuario o el estado de onboarding a limpiar.'
      )
    }

    await OnboardingUserState.firstOrCreate(
      { userId: input.adminUserId },
      {
        onboardingFlowId: null,
        onboardingUserStateIntentSlug: null,
        onboardingUserStateStatus: 'pending',
        startedAt: null,
        completedAt: null,
      },
      { client: trx }
    )
    return OnboardingUserState.query({ client: trx })
      .where('user_id', input.adminUserId)
      .forUpdate()
      .firstOrFail()
  }

  /**
   * Marca la limpieza y, solo si viene outcome, cierra el recorrido (espejo de
   * la semántica de StateService.setStatus). En modo purga (sin outcome) el
   * status queda tal cual: la purga nunca decide por el usuario.
   */
  private async markState(
    state: OnboardingUserState,
    outcome: 'completed' | 'dismissed' | undefined,
    wipedNow: boolean,
    trx: TransactionClientContract
  ): Promise<void> {
    state.useTransaction(trx)
    if (wipedNow) {
      state.demoCleanedAt = DateTime.now()
    }
    if (outcome) {
      state.onboardingUserStateStatus = outcome
      if (outcome === 'completed') {
        state.completedAt = DateTime.now()
      }
    }
    if (state.$isDirty) {
      await state.save()
    }
  }

  private groupIdsByType(
    records: OnboardingSeededRecord[]
  ): Map<OnboardingSeededEntityType, number[]> {
    const map = new Map<OnboardingSeededEntityType, number[]>()
    for (const record of records) {
      const list = map.get(record.onboardingSeededRecordEntityType) ?? []
      list.push(record.onboardingSeededRecordEntityId)
      map.set(record.onboardingSeededRecordEntityType, list)
    }
    return map
  }

  /** Normaliza el retorno de query().delete() (hard) a un conteo. */
  private async hardDeleteCount(deletion: Promise<unknown>): Promise<number> {
    const result = await deletion
    if (Array.isArray(result)) {
      return Number(result[0] ?? 0)
    }
    return Number(result ?? 0)
  }

  /**
   * Hard delete con fallback a soft (regla 3): si una FK residual de un dato
   * REAL bloquea el borrado en duro, el padre demo cae a soft-delete con
   * constancia en log y el resto del wipe continúa. La fila real jamás se toca.
   */
  private async forceDeleteWithFallback(
    row: SoftDeletableRow,
    label: string,
    trx: TransactionClientContract
  ): Promise<number> {
    row.useTransaction(trx)
    try {
      await row.forceDelete()
      return 1
    } catch (error) {
      logger.warn(
        `DemoWipeService: no fue posible borrar en duro ${label} (dato real colgado); fallback a soft-delete. ${error instanceof Error ? error.message : ''}`
      )
      await row.delete()
      return 1
    }
  }

  private emptyCounts(): WipeCounts {
    return {
      assists: 0,
      employeeAssistCalendar: 0,
      shiftExceptions: 0,
      shiftExceptionEvidences: 0,
      exceptionRequests: 0,
      employeeRecords: 0,
      employeeProceedingFiles: 0,
      employeeVacationArchives: 0,
      employeeDevices: 0,
      userResponsibleEmployees: 0,
      apiTokens: 0,
      userFcmTokens: 0,
      businessUnitUsers: 0,
      employeeShifts: 0,
      users: 0,
      employees: 0,
      people: 0,
      departmentPositions: 0,
      positions: 0,
      departments: 0,
      shifts: 0,
    }
  }
}
