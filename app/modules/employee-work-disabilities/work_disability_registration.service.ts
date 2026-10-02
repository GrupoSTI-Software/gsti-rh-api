import db from '@adonisjs/lucid/services/db'
import { cuid } from '@adonisjs/core/helpers'
import type { HttpContext } from '@adonisjs/core/http'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import InsuranceCoverageType from '#models/insurance_coverage_type'
import WorkDisability from '#models/work_disability'
import WorkDisabilityPeriod from '#models/work_disability_period'
import WorkDisabilityType from '#models/work_disability_type'
import { WORK_DISABILITY_ERROR_CODES } from '#constants/work_disability_error_codes'
import { assertDayWithinRoleScope } from '#modules/role-scope/day_scope_guard'
import UploadService from '#services/upload_service'
import WorkDisabilityPeriodService from '#services/work_disability_period_service'
import type { WorkDisabilityPeriodAddShiftExceptionInterface } from '../../interfaces/work_disability_period_add_shift_exception_interface.js'
import {
  EXTENSION_PERIOD_TYPE_SLUGS,
  INITIAL_PERIOD_TYPE_SLUG,
  isWorkDisabilityFolioValid,
  workDisabilityEndDate,
} from './work_disability_rules.js'

/** Rechazo con el triplete título/detalle/key del estándar. */
export interface WorkDisabilityRejection {
  status: number
  body: { type: 'warning' | 'error'; title: string; detail: string; key: string; code: string }
}

export type WorkDisabilityRegistrationResult =
  | { ok: true; workDisabilityId: number; workDisabilityPeriodId: number }
  | { ok: false; rejection: WorkDisabilityRejection }

interface PeriodInput {
  folio: string | null
  startDate: string
  days: number
  document: MultipartFile
}

export interface RegisterWorkDisabilityInput extends PeriodInput {
  ctx: HttpContext
  employeeId: number
  insuranceCoverageTypeId: number
}

export interface RegisterExtensionInput extends PeriodInput {
  ctx: HttpContext
  workDisability: WorkDisability
  workDisabilityTypeId: number
}

const reject = (
  status: number,
  title: string,
  detail: string,
  key: string,
  code: string
): WorkDisabilityRegistrationResult => ({
  ok: false,
  rejection: { status, body: { type: 'warning', title, detail, key, code } },
})

/**
 * Alta de incapacidades desde la ficha del empleado.
 *
 * Registrar crea en una sola transacción la incapacidad y su periodo inicial:
 * antes eran dos llamadas y una falla en el periodo dejaba una incapacidad
 * vacía. Ampliar agrega un periodo a una incapacidad existente.
 *
 * La primera nota de seguimiento no viaja aquí: es dato de salud y los datos
 * sensibles se guardan por JSON (`/work-disability-notes`), donde el middleware
 * neutraliza ecos de máscara; este alta es multipart por el documento.
 *
 * En los dos casos, al quedar guardado el periodo se generan sus excepciones
 * de turno y se recalcula el calendario, igual que en el alta de periodos.
 */
export default class WorkDisabilityRegistrationService {
  async register(input: RegisterWorkDisabilityInput): Promise<WorkDisabilityRegistrationResult> {
    const coverage = await InsuranceCoverageType.query()
      .where('insurance_coverage_type_id', input.insuranceCoverageTypeId)
      .first()
    const initialType = await WorkDisabilityType.query()
      .whereNull('work_disability_type_deleted_at')
      .where('work_disability_type_slug', INITIAL_PERIOD_TYPE_SLUG)
      .first()
    if (!coverage || !initialType) {
      return reject(
        422,
        'Cobertura no disponible',
        'El tipo de cobertura elegido no existe.',
        'cobertura-invalida',
        WORK_DISABILITY_ERROR_CODES.INVALID_CATALOG
      )
    }

    const checked = await this.checkPeriod(input, input.employeeId, coverage.insuranceCoverageTypeSlug)
    if (checked) return checked

    const endDate = workDisabilityEndDate(input.startDate, input.days)
    const file = await this.upload(input.document)
    const actorUserId = input.ctx.auth.user?.userId ?? null

    const { disability, period } = await db.transaction(async (trx) => {
      const newDisability = new WorkDisability()
      newDisability.useTransaction(trx)
      newDisability.employeeId = input.employeeId
      newDisability.insuranceCoverageTypeId = coverage.insuranceCoverageTypeId
      newDisability.workDisabilityUuid = cuid()
      await newDisability.save()

      const newPeriod = new WorkDisabilityPeriod()
      newPeriod.useTransaction(trx)
      // Se copia de la incapacidad: el hook la buscaría fuera de la transacción.
      newPeriod.businessUnitId = newDisability.businessUnitId
      newPeriod.workDisabilityId = newDisability.workDisabilityId
      newPeriod.workDisabilityTypeId = initialType.workDisabilityTypeId
      newPeriod.workDisabilityPeriodStartDate = input.startDate
      newPeriod.workDisabilityPeriodEndDate = endDate
      newPeriod.workDisabilityPeriodTicketFolio = input.folio ?? ''
      newPeriod.workDisabilityPeriodFile = file
      newPeriod.workDisabilityPeriodRegisteredByUserId = actorUserId
      await newPeriod.save()

      return { disability: newDisability, period: newPeriod }
    })

    await this.applyToAttendance(input.ctx, period, input.employeeId)
    return { ok: true, workDisabilityId: disability.workDisabilityId, workDisabilityPeriodId: period.workDisabilityPeriodId }
  }

  async extend(input: RegisterExtensionInput): Promise<WorkDisabilityRegistrationResult> {
    const type = await WorkDisabilityType.query()
      .whereNull('work_disability_type_deleted_at')
      .where('work_disability_type_id', input.workDisabilityTypeId)
      .whereIn('work_disability_type_slug', [...EXTENSION_PERIOD_TYPE_SLUGS])
      .first()
    if (!type) {
      return reject(
        422,
        'Tipo de periodo no válido',
        'Una ampliación es subsecuente, recaída o enlace.',
        'tipo-periodo-invalido',
        WORK_DISABILITY_ERROR_CODES.INVALID_CATALOG
      )
    }

    await input.workDisability.load('insuranceCoverageType')
    const coverageSlug = input.workDisability.insuranceCoverageType?.insuranceCoverageTypeSlug ?? ''
    const checked = await this.checkPeriod(input, input.workDisability.employeeId, coverageSlug)
    if (checked) return checked

    const file = await this.upload(input.document)
    const period = new WorkDisabilityPeriod()
    period.businessUnitId = input.workDisability.businessUnitId
    period.workDisabilityId = input.workDisability.workDisabilityId
    period.workDisabilityTypeId = type.workDisabilityTypeId
    period.workDisabilityPeriodStartDate = input.startDate
    period.workDisabilityPeriodEndDate = workDisabilityEndDate(input.startDate, input.days)
    period.workDisabilityPeriodTicketFolio = input.folio ?? ''
    period.workDisabilityPeriodFile = file
    period.workDisabilityPeriodRegisteredByUserId = input.ctx.auth.user?.userId ?? null
    await period.save()

    await this.applyToAttendance(input.ctx, period, input.workDisability.employeeId)
    return {
      ok: true,
      workDisabilityId: input.workDisability.workDisabilityId,
      workDisabilityPeriodId: period.workDisabilityPeriodId,
    }
  }

  /**
   * Reglas del periodo antes de guardar nada: alcance del rol, folio y que no
   * se empalme con otro periodo del colaborador.
   */
  private async checkPeriod(
    input: PeriodInput & { ctx: HttpContext },
    employeeId: number,
    coverageSlug: string
  ): Promise<WorkDisabilityRegistrationResult | null> {
    const scope = await assertDayWithinRoleScope({
      user: input.ctx.auth.user,
      employeeId,
      day: input.startDate,
      i18n: input.ctx.i18n,
    })
    if (scope) return { ok: false, rejection: scope }

    if (!isWorkDisabilityFolioValid(input.folio, coverageSlug)) {
      return reject(
        422,
        'Folio inválido',
        'El folio lleva dos letras y seis dígitos, como SB123456. Solo la incapacidad interna puede ir sin folio.',
        'folio-invalido',
        WORK_DISABILITY_ERROR_CODES.FOLIO_INVALID
      )
    }

    const endDate = workDisabilityEndDate(input.startDate, input.days)
    const overlap = await WorkDisabilityPeriod.query()
      .whereNull('work_disability_period_deleted_at')
      .where('work_disability_period_start_date', '<=', endDate)
      .where('work_disability_period_end_date', '>=', input.startDate)
      .whereHas('workDisability', (query) => {
        query.whereNull('work_disability_deleted_at').where('employee_id', employeeId)
      })
      .first()
    if (overlap) {
      return reject(
        422,
        'Fechas empalmadas',
        'Esas fechas se empalman con otro periodo de incapacidad del colaborador.',
        'periodo-empalmado',
        WORK_DISABILITY_ERROR_CODES.PERIOD_OVERLAP
      )
    }

    if (input.folio) {
      const sameFolio = await WorkDisabilityPeriod.query()
        .whereNull('work_disability_period_deleted_at')
        .where('work_disability_period_ticket_folio', input.folio)
        .whereHas('workDisability', (query) => {
          query.whereNull('work_disability_deleted_at')
        })
        .first()
      if (sameFolio) {
        return reject(
          422,
          'Folio repetido',
          'Ese folio ya está registrado en otro periodo de incapacidad.',
          'folio-repetido',
          WORK_DISABILITY_ERROR_CODES.FOLIO_DUPLICATED
        )
      }
    }
    return null
  }

  private async upload(document: MultipartFile): Promise<string> {
    return new UploadService().fileUpload(document, 'evidence-document', 'work-disability-files')
  }

  /** Excepciones de turno por cada día amparado y calendario recalculado. */
  private async applyToAttendance(
    ctx: HttpContext,
    period: WorkDisabilityPeriod,
    employeeId: number
  ): Promise<void> {
    const service = new WorkDisabilityPeriodService(ctx.i18n)
    await period.load('workDisability')
    await service.addShiftExceptions({
      workDisabilityPeriod: period,
      auth: ctx.auth,
      request: ctx.request,
    } as WorkDisabilityPeriodAddShiftExceptionInterface)
    await service.updateAssistCalendar(
      employeeId,
      new Date(period.workDisabilityPeriodStartDate),
      new Date(period.workDisabilityPeriodEndDate)
    )
  }
}
