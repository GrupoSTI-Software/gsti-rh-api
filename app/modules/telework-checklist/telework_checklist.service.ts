import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import i18nManager from '@adonisjs/i18n/services/main'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import TeleworkComplianceSettingService from '#services/telework_compliance_setting_service'
import type TeleworkChecklistItem from '#models/telework_checklist_item'
import { EMPLOYEE_WORK_SCHEDULE } from '#constants/employee_work_schedule'
import {
  TELEWORK_CHECKLIST_ANSWER_RESULT,
  TELEWORK_CHECKLIST_APPLICATION_STATUS,
  TELEWORK_CHECKLIST_OVERALL_RESULT,
  effectiveStatus,
} from '#constants/telework_checklist'
import type { TeleworkChecklistInvalidationReason } from '#constants/telework_checklist'
import TeleworkChecklistError from './telework_checklist.error.js'
import type { TeleworkChecklistErrorKey } from './telework_checklist.error.js'
import TeleworkChecklistRepositoryMysql from './telework_checklist.repository.mysql.js'
import type {
  TeleworkChecklistApplicationInsert,
  TeleworkChecklistApplicationRecord,
  TeleworkChecklistAnswerRecord,
  TeleworkChecklistRepository,
} from './telework_checklist.repository.js'
import type {
  AnswerInput,
  ApplicationDetailDto,
  ApplicationSummaryDto,
  EmployeeApplicationsDto,
  TeleworkChecklistRegistrationInput,
} from './dto/telework_checklist.dto.js'
import type { TeleworkChecklistCreateInput } from './validators/telework_checklist_create.validator.js'

/** Zona de negocio para fechas de calendario (NOM-037). */
const BUSINESS_ZONE = 'America/Mexico_City'
/** Código de MySQL para el choque del `UNIQUE uq_twca_current_employee`. */
const ER_DUP_ENTRY = 'ER_DUP_ENTRY'

/**
 * Servicio de la lista de verificación de teletrabajo (VLRH-H1790812613870).
 *
 * Núcleo: registra la visita de la CSH (`registerVisit`) con vigencia única por
 * empleado (snapshot de la periodicidad de la empresa), consulta el catálogo y
 * el historial (`listItems`, `listByEmployee`, `getCurrentByEmployee`), el
 * detalle (`detail`) y el contrato de invalidación (`invalidateCurrent`). La
 * periodicidad sale SIEMPRE de `TeleworkComplianceSettingService.getEffective`
 * (nunca un `?? 12` en el consumidor). El adaptador filtra `business_unit_id`
 * explícito para que todo esto funcione también fuera de HTTP (cron de
 * VLRH-H1791306081115); este servicio no depende de `TenantContext`.
 */
export default class TeleworkChecklistService {
  private readonly complianceSettingService: Pick<
    TeleworkComplianceSettingService,
    'getEffective'
  >

  private readonly repository: TeleworkChecklistRepository

  constructor(
    complianceSettingService: Pick<TeleworkComplianceSettingService, 'getEffective'> = new TeleworkComplianceSettingService(),
    repository: TeleworkChecklistRepository = new TeleworkChecklistRepositoryMysql()
  ) {
    this.complianceSettingService = complianceSettingService
    this.repository = repository
  }

  /** Catálogo global de puntos activos, en su orden de presentación. */
  async listItems(): Promise<TeleworkChecklistItem[]> {
    return this.repository.listActiveItems()
  }

  /**
   * Historial de un colaborador de la empresa. El colaborador debe existir y
   * estar vivo en la empresa (si no, `colaborador-no-encontrado`); no se le
   * aplica gating de lectura (el historial pasado no se oculta — Review Focus 1).
   * `current` es la vigente **efectiva** (o `null` si no hay o ya venció) y
   * `history` incluye a la vigente con su estado efectivo.
   */
  async listByEmployee(businessUnitId: number, employeeId: number): Promise<EmployeeApplicationsDto> {
    this.assertScopeResolved(businessUnitId)

    const schedule = await this.repository.findEmployeeWorkSchedule(businessUnitId, employeeId)
    if (!schedule) {
      throw new TeleworkChecklistError('colaborador-no-encontrado')
    }

    const records = await this.repository.listByEmployee(businessUnitId, employeeId)
    const today = this.today()
    const history = records.map((record) => this.toSummaryDto(record, today))
    const currentRecord = records.find(
      (record) => record.status === TELEWORK_CHECKLIST_APPLICATION_STATUS.CURRENT
    )
    const current =
      currentRecord && this.isCurrentEffective(currentRecord, today)
        ? this.toSummaryDto(currentRecord, today)
        : null

    return { employeeId, current, history }
  }

  /**
   * Vigente efectiva del colaborador, o `null`. Sin 404: es el contrato de
   * consulta que consumen las HUs hermanas y el cron.
   */
  async getCurrentByEmployee(
    businessUnitId: number,
    employeeId: number
  ): Promise<ApplicationSummaryDto | null> {
    this.assertScopeResolved(businessUnitId)

    const record = await this.repository.findCurrentPersisted(businessUnitId, employeeId)
    if (!record) return null

    const today = this.today()
    if (!this.isCurrentEffective(record, today)) return null

    return this.toSummaryDto(record, today)
  }

  /** Detalle de una aplicación de la empresa; ajena o inexistente → `aplicacion-no-encontrada`. */
  async detail(businessUnitId: number, applicationId: number): Promise<ApplicationDetailDto> {
    this.assertScopeResolved(businessUnitId, 'aplicacion-no-encontrada')

    const record = await this.repository.findApplication(businessUnitId, applicationId)
    if (!record) {
      throw new TeleworkChecklistError('aplicacion-no-encontrada')
    }

    const answers = await this.repository.listAnswersWithItems(businessUnitId, applicationId)
    const summary = this.toSummaryDto(record, this.today())

    return {
      ...summary,
      employeeId: record.employeeId,
      teleworkLocationId: record.teleworkLocationId,
      inspectorName: record.inspectorName,
      notes: record.notes,
      answers: answers.map((answer) => this.toAnswerDto(answer)),
    }
  }

  /**
   * Registra la visita de la Comisión (el servidor fija `mode: 'visita_csh'`) y
   * devuelve el detalle de la aplicación creada.
   */
  async registerVisit(
    businessUnitId: number,
    input: TeleworkChecklistCreateInput,
    actorUserId: number
  ): Promise<ApplicationDetailDto> {
    const registrationInput: TeleworkChecklistRegistrationInput = {
      mode: 'visita_csh',
      appliedAt: this.toIsoDay(input.appliedAt),
      inspectorName: input.inspectorName ?? '',
      teleworkLocationId: input.teleworkLocationId ?? null,
      notes: input.notes ?? null,
      answers: input.answers.map((answer) => ({
        itemId: answer.itemId,
        result: answer.result,
        observation: answer.observation ?? null,
      })),
    }

    return this.#register(businessUnitId, input.employeeId, registrationInput, actorUserId)
  }

  /**
   * Invalida la vigente del colaborador con motivo y autor. Sin vigente →
   * `null` sin escribir; con una vigente persistida ya vencida → la materializa
   * como `vencida` y devuelve `null`. Sin endpoint: la llama otra HU (p. ej. la
   * de cambio de domicilio). Corre dentro del `trx` recibido cuando llega.
   */
  async invalidateCurrent(
    businessUnitId: number,
    employeeId: number,
    reason: TeleworkChecklistInvalidationReason,
    actorUserId: number,
    trx?: TransactionClientContract
  ): Promise<ApplicationSummaryDto | null> {
    this.assertScopeResolved(businessUnitId)

    const run = async (client: TransactionClientContract): Promise<ApplicationSummaryDto | null> => {
      await this.repository.lockEmployeeRow(businessUnitId, employeeId, client)

      const current = await this.repository.findCurrentPersisted(businessUnitId, employeeId, client)
      if (!current) return null

      const today = this.today()
      if (!this.isCurrentEffective(current, today)) {
        await this.repository.updateApplicationStatus(
          businessUnitId,
          current.applicationId,
          TELEWORK_CHECKLIST_APPLICATION_STATUS.EXPIRED,
          {},
          client
        )
        return null
      }

      const invalidatedAt = DateTime.now().toISO()
      await this.repository.updateApplicationStatus(
        businessUnitId,
        current.applicationId,
        TELEWORK_CHECKLIST_APPLICATION_STATUS.INVALIDATED,
        { invalidatedAt, invalidationReason: reason, invalidatedByUserId: actorUserId },
        client
      )

      return this.toSummaryDto(
        {
          ...current,
          status: TELEWORK_CHECKLIST_APPLICATION_STATUS.INVALIDATED,
          invalidatedAt,
          invalidationReason: reason,
        },
        today
      )
    }

    if (trx) return run(trx)
    return db.transaction(run)
  }

  /**
   * Núcleo del registro (§7 del plan). Orden de validación: colaborador vivo →
   * modalidad teletrabajadora → cobertura exacta de puntos activos → fecha no
   * futura → visitador presente (`visita_csh`) → lugar vivo → periodicidad →
   * transacción con `forUpdate` sobre el colaborador (serializa la carrera) y
   * `ER_DUP_ENTRY` → `aplicacion-concurrente`.
   */
  async #register(
    businessUnitId: number,
    employeeId: number,
    input: TeleworkChecklistRegistrationInput,
    actorUserId: number
  ): Promise<ApplicationDetailDto> {
    this.assertScopeResolved(businessUnitId)

    const schedule = await this.repository.findEmployeeWorkSchedule(businessUnitId, employeeId)
    if (!schedule) {
      throw new TeleworkChecklistError('colaborador-no-encontrado')
    }
    if (
      schedule !== EMPLOYEE_WORK_SCHEDULE.REMOTE &&
      schedule !== EMPLOYEE_WORK_SCHEDULE.HYBRID
    ) {
      throw new TeleworkChecklistError('solo-teletrabajadores')
    }

    const items = await this.repository.listActiveItems()
    this.assertAnswersCoverage(input.answers, items)

    const today = this.today()
    const appliedAt =
      input.mode === 'visita_csh' ? this.assertNotFuture(input.appliedAt, today) : (today.toISODate() ?? '')
    const inspectorName = input.mode === 'visita_csh' ? this.assertInspector(input.inspectorName) : null

    if (input.teleworkLocationId !== null) {
      const live = await this.repository.hasLiveTeleworkLocation(
        businessUnitId,
        employeeId,
        input.teleworkLocationId
      )
      if (!live) {
        throw new TeleworkChecklistError('lugar-de-teletrabajo-invalido')
      }
    }

    const { revalidationPeriodMonths } = await this.complianceSettingService.getEffective(businessUnitId)
    const expiresAt = this.addMonths(appliedAt, revalidationPeriodMonths)
    const overallResult = input.answers.some(
      (answer) => answer.result === TELEWORK_CHECKLIST_ANSWER_RESULT.NON_COMPLIANT
    )
      ? TELEWORK_CHECKLIST_OVERALL_RESULT.NOT_APPROVED
      : TELEWORK_CHECKLIST_OVERALL_RESULT.APPROVED

    const insertValues: TeleworkChecklistApplicationInsert = {
      businessUnitId,
      employeeId,
      teleworkLocationId: input.teleworkLocationId,
      mode: input.mode,
      overallResult,
      appliedAt,
      revalidationPeriodMonths,
      expiresAt,
      inspectorName,
      notes: input.notes,
      appliedByUserId: actorUserId,
    }

    let applicationId: number
    try {
      applicationId = await db.transaction(async (trx) => {
        await this.repository.lockEmployeeRow(businessUnitId, employeeId, trx)

        const current = await this.repository.findCurrentPersisted(businessUnitId, employeeId, trx)
        if (current) {
          const status = this.isCurrentEffective(current, today)
            ? TELEWORK_CHECKLIST_APPLICATION_STATUS.REPLACED
            : TELEWORK_CHECKLIST_APPLICATION_STATUS.EXPIRED
          await this.repository.updateApplicationStatus(
            businessUnitId,
            current.applicationId,
            status,
            {},
            trx
          )
        }

        const id = await this.repository.insertApplication(insertValues, trx)
        await this.repository.insertAnswers(
          id,
          businessUnitId,
          input.answers.map((answer) => ({
            itemId: answer.itemId,
            result: answer.result,
            observation: answer.observation ?? null,
          })),
          trx
        )
        return id
      })
    } catch (error) {
      if ((error as { code?: string })?.code === ER_DUP_ENTRY) {
        throw new TeleworkChecklistError('aplicacion-concurrente')
      }
      throw error
    }

    return this.detail(businessUnitId, applicationId)
  }

  /** Falla cerrado si el alcance de empresa no está resuelto (404 equivalente). */
  private assertScopeResolved(
    businessUnitId: number,
    key: TeleworkChecklistErrorKey = 'colaborador-no-encontrado'
  ): void {
    if (!Number.isInteger(businessUnitId) || businessUnitId <= 0) {
      throw new TeleworkChecklistError(key)
    }
  }

  /**
   * Cobertura exacta de los puntos activos: sin faltantes (`respuestas-incompletas`),
   * sin repetidos (`respuesta-duplicada`) ni desconocidos/inactivos
   * (`punto-no-reconocido`). El primer problema en ese orden gana.
   */
  private assertAnswersCoverage(answers: AnswerInput[], items: TeleworkChecklistItem[]): void {
    const answeredIds = answers.map((answer) => answer.itemId)
    const activeIds = new Set(items.map((item) => item.teleworkChecklistItemId))

    const missing = items.filter((item) => !answeredIds.includes(item.teleworkChecklistItemId))
    if (missing.length > 0) {
      throw new TeleworkChecklistError('respuestas-incompletas', undefined, {
        missingItemCodes: missing.map((item) => item.teleworkChecklistItemCode),
      })
    }

    const seen = new Set<number>()
    for (const answer of answers) {
      if (seen.has(answer.itemId)) {
        const item = items.find(
          (candidate) => candidate.teleworkChecklistItemId === answer.itemId
        )
        throw new TeleworkChecklistError('respuesta-duplicada', undefined, {
          itemCode: item?.teleworkChecklistItemCode,
        })
      }
      seen.add(answer.itemId)
    }

    const unknown = answers.find((answer) => !activeIds.has(answer.itemId))
    if (unknown) {
      throw new TeleworkChecklistError('punto-no-reconocido', undefined, { itemId: unknown.itemId })
    }
  }

  /** La fecha de aplicación no puede ser futura en CDMX; devuelve el `yyyy-MM-dd` canónico. */
  private assertNotFuture(appliedAt: string, today: DateTime): string {
    const parsed = DateTime.fromISO(appliedAt, { zone: BUSINESS_ZONE })
    if (!parsed.isValid || parsed.startOf('day') > today) {
      throw new TeleworkChecklistError('fecha-de-aplicacion-invalida')
    }
    return parsed.toISODate() ?? appliedAt
  }

  /** El visitador es obligatorio en una visita de la CSH. */
  private assertInspector(inspectorName: string): string {
    const trimmed = (inspectorName ?? '').trim()
    if (trimmed.length === 0) {
      throw new TeleworkChecklistError('visitador-requerido')
    }
    return trimmed
  }

  /** `appliedAt` + periodicidad de revalidación (luxon resuelve el fin de mes). */
  private addMonths(isoDay: string, months: number): string {
    const base = DateTime.fromISO(isoDay, { zone: BUSINESS_ZONE })
    return base.plus({ months }).toISODate() ?? isoDay
  }

  /** Hoy al inicio del día en CDMX (fuente del estado efectivo). */
  private today(): DateTime {
    return DateTime.now().setZone(BUSINESS_ZONE).startOf('day')
  }

  /** Fecha de calendario de la fila como `DateTime` al inicio del día CDMX. */
  private toDay(isoDay: string): DateTime {
    return DateTime.fromISO(isoDay, { zone: BUSINESS_ZONE }).startOf('day')
  }

  /** Estado efectivo de una fila: delega en la única fuente `effectiveStatus`. */
  private isCurrentEffective(record: TeleworkChecklistApplicationRecord, today: DateTime): boolean {
    return (
      effectiveStatus({ status: record.status, expiresAt: this.toDay(record.expiresAt) }, today) ===
      TELEWORK_CHECKLIST_APPLICATION_STATUS.CURRENT
    )
  }

  /** Registro persistido → resumen con estado efectivo. */
  private toSummaryDto(
    record: TeleworkChecklistApplicationRecord,
    today: DateTime
  ): ApplicationSummaryDto {
    return {
      applicationId: record.applicationId,
      mode: record.mode,
      status: effectiveStatus(
        { status: record.status, expiresAt: this.toDay(record.expiresAt) },
        today
      ),
      overallResult: record.overallResult,
      appliedAt: record.appliedAt,
      expiresAt: record.expiresAt,
      revalidationPeriodMonths: record.revalidationPeriodMonths,
      appliedByUserId: record.appliedByUserId,
      invalidatedAt: record.invalidatedAt,
      invalidationReason: record.invalidationReason,
    }
  }

  /** Respuesta leída → respuesta del detalle con la etiqueta del punto resuelta. */
  private toAnswerDto(answer: TeleworkChecklistAnswerRecord): ApplicationDetailDto['answers'][number] {
    return {
      itemId: answer.itemId,
      code: answer.code,
      label: this.resolveItemLabel(answer.labelKey),
      result: answer.result,
      observation: answer.observation,
    }
  }

  /**
   * Resuelve la etiqueta del punto desde su `labelKey` con la i18n del proceso
   * (locale por defecto). No depende de `HttpContext`: el detalle es superficie
   * HTTP, pero el servicio se mantiene utilizable fuera de una petición. La
   * clave como `fallback` evita un texto raro si aún no está cargada.
   */
  private resolveItemLabel(labelKey: string): string {
    return i18nManager.locale().formatMessage(labelKey, undefined, labelKey)
  }

  /** Columna `date` del validador (JS `Date`) como `yyyy-MM-dd`. */
  private toIsoDay(value: Date): string {
    return DateTime.fromJSDate(value).toISODate() ?? ''
  }
}
