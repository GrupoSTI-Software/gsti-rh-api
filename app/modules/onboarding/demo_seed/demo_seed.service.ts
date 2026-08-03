import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import type { I18n } from '@adonisjs/i18n'
import OnboardingError from '#exceptions/onboarding_error'
import ApiToken from '#models/api_token'
import BusinessUnit from '#models/business_unit'
import type OnboardingSeededRecord from '#models/onboarding_seeded_record'
import type OnboardingUserState from '#models/onboarding_user_state'
import EmployeeService from '#services/employee_service'
import ShiftExceptionService from '#services/shift_exception_service'
import Ws from '#services/ws'
import StateService from '#modules/onboarding/state/state.service'
import DemoSeedRepositoryMysql from './demo_seed.repository.mysql.js'
import { generateDemoPassword } from './helpers/demo_password.js'
import type { DemoSeedRepository, SeededPackageEntities } from './demo_seed.repository.js'
import type { DemoCredentialsDto, DemoPackageDto, DemoSeedResultDto } from './dto/demo_seed.dto.js'

/**
 * Siembra de datos de práctica del onboarding (USRH1785438246847).
 *
 * Una sola siembra activa por administrador: pedirla de nuevo reutiliza el
 * paquete (idempotente); si ya se limpió (USRH1785438246903), prepara un juego
 * fresco. Todo lo creado queda registrado pieza por pieza con snapshot de BU
 * para que el borrado posterior sea exacto. La contraseña viaja en claro una
 * única vez y no es recuperable (solo regenerable).
 *
 * Aislamiento: userId SIEMPRE de auth.user.userId; la BU del scope del
 * middleware. Discrepancia de BU contra el snapshot = 409 sin escribir nada.
 */
export default class DemoSeedService {
  private readonly i18n: I18n
  private readonly repository: DemoSeedRepository

  constructor(i18n: I18n, repository?: DemoSeedRepository) {
    this.i18n = i18n
    this.repository = repository ?? new DemoSeedRepositoryMysql(i18n)
  }

  /** POST /me/demo-seed — siembra idempotente. */
  async seed(
    userId: number,
    businessUnitId: number
  ): Promise<{ result: DemoSeedResultDto; created: boolean }> {
    const outcome = await db.transaction(async (trx) => {
      const state = await this.repository.lockUserState(userId, trx)

      if (this.hasActiveSeed(state)) {
        const records = await this.repository.listSeededRecords(
          state.onboardingUserStateId,
          trx
        )
        this.assertSameBusinessUnit(records, businessUnitId)
        const entities = await this.repository.loadSeededPackage(records, trx)
        return {
          created: false,
          entities,
          seededAt: state.demoSeededAt,
          password: null as string | null,
        }
      }

      // Límite de empleados contratado: se avisa y no se crea nada a medias.
      const limitCheck = await new EmployeeService(this.i18n).verifyEmployeeLimit(businessUnitId)
      if (limitCheck.status !== 200) {
        throw new OnboardingError(
          'siembra-demo-limite-empleados',
          'Onboarding',
          'La empresa alcanzó su límite de empleados contratado; no es posible preparar los datos de práctica.'
        )
      }

      const businessUnit = await BusinessUnit.query({ client: trx })
        .where('business_unit_id', businessUnitId)
        .whereNull('business_unit_deleted_at')
        .firstOrFail()

      const password = generateDemoPassword()
      const demoEmail = await this.repository.buildUniqueDemoEmail(businessUnitId, trx)
      const entities = await this.repository.createSeededPackage(
        {
          onboardingUserStateId: state.onboardingUserStateId,
          adminUserId: userId,
          businessUnitId,
          businessUnitSlug: businessUnit.businessUnitSlug,
          demoEmail,
          demoPassword: password,
        },
        trx
      )

      // Transición server-side a in_progress sin pasar por PUT /me/intent:
      // el recorrido único opera con pasos comunes (flow e intent NULL).
      const now = DateTime.now()
      state.useTransaction(trx)
      state.merge({
        onboardingFlowId: null,
        onboardingUserStateIntentSlug: null,
        onboardingUserStateStatus: 'in_progress',
        startedAt: state.startedAt ?? now,
        demoSeededAt: now,
        demoCleanedAt: null,
      })
      await state.save()

      return { created: true, entities, seededAt: now, password: password as string | null }
    })

    if (outcome.created) {
      await this.refreshAssistCalendar(outcome.entities)
    }

    const onboarding = await new StateService().getOnboardingMe(userId)
    const seededAtIso = outcome.seededAt ? outcome.seededAt.toISO() : null

    return {
      created: outcome.created,
      result: {
        seededAt: seededAtIso,
        alreadySeeded: !outcome.created,
        package: this.buildPackageDto(outcome.entities),
        credentials: {
          email: outcome.entities.user.userEmail,
          password: outcome.password,
          passwordAvailable: outcome.password !== null,
          generatedAt: outcome.created ? seededAtIso : null,
        },
        onboarding,
      },
    }
  }

  /** POST /me/demo-seed/credentials — regenera la contraseña de práctica. */
  async regenerateCredentials(
    userId: number,
    businessUnitId: number
  ): Promise<DemoCredentialsDto> {
    const { user, password } = await db.transaction(async (trx) => {
      const state = await this.repository.lockUserState(userId, trx)
      if (!this.hasActiveSeed(state)) {
        throw this.seedNotFoundError()
      }

      const records = await this.repository.listSeededRecords(state.onboardingUserStateId, trx)
      this.assertSameBusinessUnit(records, businessUnitId)

      const seededUser = await this.repository.findSeededUser(records, trx)
      if (!seededUser) {
        throw this.seedNotFoundError()
      }

      // Nueva contraseña: el hook de withAuthFinder re-hashea (scrypt) al guardar.
      const newPassword = generateDemoPassword()
      seededUser.useTransaction(trx)
      seededUser.userPassword = newPassword
      await seededUser.save()

      // Revocación de sesiones vigentes (espejo del patrón de UserService.delete,
      // que no se invoca porque borraría al usuario): tokens fuera y logout WS.
      await ApiToken.query({ client: trx })
        .where('tokenable_id', seededUser.userId)
        .delete()

      return { user: seededUser, password: newPassword }
    })

    // El logout WS va después del commit (efecto externo).
    if (Ws.io) {
      Ws.io.emit(`user-forze-logout:${user.userEmail}`, {})
    }

    return {
      email: user.userEmail,
      password,
      passwordAvailable: true,
      generatedAt: DateTime.now().toISO(),
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers privados
  // ---------------------------------------------------------------------------

  private hasActiveSeed(state: OnboardingUserState): boolean {
    return !!state.demoSeededAt && !state.demoCleanedAt
  }

  private seedNotFoundError(): OnboardingError {
    return new OnboardingError(
      'siembra-demo-no-encontrada',
      'Onboarding',
      'No existe una siembra de práctica activa para este usuario.'
    )
  }

  /**
   * Doble condición de pertenencia (fail-closed): la siembra activa está
   * anclada a la BU de su snapshot; con otra BU no se escribe ni revela nada.
   */
  private assertSameBusinessUnit(
    records: OnboardingSeededRecord[],
    businessUnitId: number
  ): void {
    const snapshotBusinessUnitId = records[0]?.businessUnitId ?? null
    if (snapshotBusinessUnitId !== businessUnitId) {
      throw new OnboardingError(
        'siembra-demo-unidad-invalida',
        'Onboarding',
        'La siembra de práctica pertenece a otra unidad de negocio.'
      )
    }
  }

  /**
   * Recalcula el calendario de asistencia del empleado demo DESPUÉS del commit
   * (mejor esfuerzo): `SyncAssistsService.setDateCalendar` no acepta trx y sus
   * escrituras derivadas fallarían por FK dentro de la transacción. Si falla,
   * la siembra sigue íntegra (el calendario es dato derivado) y queda log.
   */
  private async refreshAssistCalendar(entities: SeededPackageEntities): Promise<void> {
    const lastVacationDate = entities.vacationDates[entities.vacationDates.length - 1]
    if (!lastVacationDate) {
      return
    }
    try {
      await new ShiftExceptionService(this.i18n).updateAssistCalendar(
        entities.employee.employeeId,
        new Date(`${lastVacationDate}T12:00:00`)
      )
    } catch (error) {
      logger.warn(
        `DemoSeedService: fallo al recalcular el calendario de asistencia del empleado demo ${entities.employee.employeeId}: ${error instanceof Error ? error.message : 'desconocido'}`
      )
    }
  }

  private buildPackageDto(entities: SeededPackageEntities): DemoPackageDto {
    return {
      department: {
        departmentId: entities.department.departmentId,
        departmentName: entities.department.departmentName,
      },
      position: {
        positionId: entities.position.positionId,
        positionName: entities.position.positionName,
      },
      employee: {
        employeeId: entities.employee.employeeId,
        employeeCode: String(entities.employee.employeeCode ?? ''),
        employeeSlug: entities.employee.employeeSlug ?? null,
        firstName: entities.employee.employeeFirstName,
        lastName: entities.employee.employeeLastName,
        secondLastName: entities.employee.employeeSecondLastName,
        hireDate: entities.employee.employeeHireDate
          ? entities.employee.employeeHireDate.toFormat('yyyy-LL-dd')
          : '',
      },
      shift: {
        shiftId: entities.shift.shiftId,
        shiftName: entities.shift.shiftName,
        shiftTimeStart: entities.shift.shiftTimeStart.slice(0, 5),
        shiftActiveHours: entities.shift.shiftActiveHours,
        shiftRestDays: entities.shift.shiftRestDays,
      },
      attendance: {
        dates: entities.attendanceDates,
        checkIn: entities.attendanceCheckIn,
        checkOut: entities.attendanceCheckOut,
      },
      vacations: { dates: entities.vacationDates },
    }
  }
}
