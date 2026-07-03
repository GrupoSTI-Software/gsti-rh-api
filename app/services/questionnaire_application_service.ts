import { DateTime } from 'luxon'
import type { I18n } from '@adonisjs/i18n'
import db from '@adonisjs/lucid/services/db'
import QuestionnaireApplicabilityService from '#services/questionnaire_applicability_service'
import RetentionGuardService from '#services/retention_guard_service'
import {
  INSTRUMENT_TO_QUESTIONNAIRE_CODE,
  QUESTIONNAIRE_APPLICATION_FOLIO_PREFIX,
  QUESTIONNAIRE_APPLICATION_OPEN_STATUSES,
} from '#constants/questionnaire_application'
import {
  QUESTIONNAIRE_APPLICATION_ERROR_CODES,
} from '#constants/questionnaire_application_error_codes'
import { QuestionnaireApplicationServiceError } from '#exceptions/questionnaire_application_service_error'
import type {
  CloseQuestionnaireApplicationInput,
  CreateQuestionnaireApplicationInput,
  QuestionnaireApplicationStateLogItem,
  QuestionnaireApplicationDetailResult,
  QuestionnaireApplicationListFilters,
  QuestionnaireApplicationListItem,
  QuestionnaireApplicationListResult,
  QuestionnaireApplicationCompletionStatus,
  QuestionnaireApplicationTargetListFilters,
  QuestionnaireApplicationTargetListItem,
} from '../interfaces/questionnaire_application_interface.js'
import type { QuestionnaireApplicationInstrument } from '#models/questionnaire_application'

type QuestionnaireApplicationRow = {
  questionnaireApplicationId: number | string
  folio: string
  branchOfficeId: number | string
  branchOfficeName: string
  businessUnitPublicId: string
  regulationQuestionnaireId: number | string
  applicableInstrument: QuestionnaireApplicationInstrument
  status: 'borrador' | 'en-curso' | 'cerrada'
  targetCount: number | string
  respondedCount: number | string
  launchedAt: string | Date | null
  closedAt: string | Date | null
}

type QuestionnaireApplicationTargetRow = {
  questionnaireApplicationTargetId: number | string
  employeeId: number | string
  employeeCode: number | string
  employeePayrollNum: string
  employeeFullName: string
  departmentName: string | null
  positionName: string | null
  status: 'pendiente' | 'respondido'
  responseStatus: 'borrador' | 'respondido' | null
  respondedAt: string | Date | null
}

type QuestionnaireApplicationStateLogRow = {
  questionnaireApplicationStateLogId: number | string
  fromStatus: 'borrador' | 'en-curso' | 'cerrada'
  toStatus: 'borrador' | 'en-curso' | 'cerrada'
  note: string
  actorUserId: number | string
  actorUserEmail: string
  actorUserFullName: string | null
  createdAt: string | Date
}

export default class QuestionnaireApplicationService {
  async launch(
    input: CreateQuestionnaireApplicationInput,
    allowedBusinessUnitIds: number[] = [],
    i18n?: I18n
  ): Promise<QuestionnaireApplicationDetailResult> {
    const branch = await this.findBranchInScopeOrFail(input.branchOfficeId, allowedBusinessUnitIds, i18n)

    const applicability = await QuestionnaireApplicabilityService.getByBranchOffice(
      input.branchOfficeId,
      i18n!
    )

    if (applicability.applicableInstrument === 'none') {
      throw new QuestionnaireApplicationServiceError(
        this.translate(
          i18n,
          'nom035.questionnaire_application.not_applicable',
          'La sucursal no cumple el umbral mínimo para lanzar cuestionario'
        ),
        QUESTIONNAIRE_APPLICATION_ERROR_CODES.NOT_APPLICABLE,
        422,
        'sucursal-no-aplicable'
      )
    }

    const hasOpenApplication = await db
      .from('questionnaire_applications')
      .where('branch_office_id', input.branchOfficeId)
      .whereIn('questionnaire_application_status', [...QUESTIONNAIRE_APPLICATION_OPEN_STATUSES])
      .whereNull('questionnaire_application_deleted_at')
      .first()

    if (hasOpenApplication) {
      throw new QuestionnaireApplicationServiceError(
        this.translate(
          i18n,
          'nom035.questionnaire_application.already_open',
          'Ya existe una aplicación abierta para la sucursal'
        ),
        QUESTIONNAIRE_APPLICATION_ERROR_CODES.ALREADY_OPEN,
        409,
        'aplicacion-abierta'
      )
    }

    const questionnaireCode = INSTRUMENT_TO_QUESTIONNAIRE_CODE[applicability.applicableInstrument]
    const regulationQuestionnaire = await db
      .from('regulation_questionnaires')
      .where('regulation_questionnaire_code', questionnaireCode)
      .whereNull('deleted_at')
      .first()

    if (!regulationQuestionnaire) {
      throw new QuestionnaireApplicationServiceError(
        this.translate(
          i18n,
          'nom035.questionnaire_application.questionnaire_not_found',
          'No se encontró el cuestionario regulatorio configurado para el instrumento'
        ),
        QUESTIONNAIRE_APPLICATION_ERROR_CODES.SYS_UNHANDLED,
        500
      )
    }

    const employeeIds = await QuestionnaireApplicabilityService.getActiveEmployeeIdsByBranch(
      input.branchOfficeId
    )
    const now = DateTime.utc().toSQL({ includeOffset: false })!
    const folio = await this.generateUniqueFolio(i18n)
    const [questionnaireApplicationId] = await db.transaction(async (trx) => {
      const insertResult = await trx.table('questionnaire_applications').insert({
        business_unit_id: branch.businessUnitId,
        branch_office_id: input.branchOfficeId,
        regulation_questionnaire_id: regulationQuestionnaire.regulation_questionnaire_id,
        questionnaire_application_folio: folio,
        questionnaire_application_instrument: applicability.applicableInstrument,
        questionnaire_application_status: 'en-curso',
        questionnaire_application_launched_at: now,
        questionnaire_application_closed_at: null,
        questionnaire_application_created_at: now,
        questionnaire_application_updated_at: now,
      })

      const applicationId = Number(insertResult[0])

      if (employeeIds.length > 0) {
        const targetRows = employeeIds.map((employeeId) => ({
          questionnaire_application_id: applicationId,
          employee_id: employeeId,
          questionnaire_application_target_status: 'pendiente',
          questionnaire_application_target_responded_at: null,
          questionnaire_application_target_created_at: now,
          questionnaire_application_target_updated_at: now,
        }))
        await trx.table('questionnaire_application_targets').insert(targetRows)
      }

      return [applicationId]
    })

    return this.getById(Number(questionnaireApplicationId), allowedBusinessUnitIds, i18n)
  }

  async listPaginated(
    filters: QuestionnaireApplicationListFilters,
    allowedBusinessUnitIds: number[] = []
  ): Promise<QuestionnaireApplicationListResult> {
    const safePage = Math.max(filters.page ?? 1, 1)
    const safeLimit = Math.min(Math.max(filters.limit ?? 20, 1), 100)
    const offset = (safePage - 1) * safeLimit

    const aggregateQuery = this.baseListAggregatedQuery(allowedBusinessUnitIds, filters)
    const totalRow = await db.from(aggregateQuery.clone().as('qa_aggregate')).count('* as total').first()
    const total = Number((totalRow as { total?: string | number } | undefined)?.total ?? 0)
    const lastPage = Math.max(Math.ceil(total / safeLimit), 1)

    const rows = (await aggregateQuery
      .clone()
      .orderBy('qa.questionnaire_application_launched_at', 'desc')
      .limit(safeLimit)
      .offset(offset)) as QuestionnaireApplicationRow[]

    return {
      meta: {
        total,
        perPage: safeLimit,
        currentPage: safePage,
        lastPage,
        firstPage: 1,
      },
      data: rows.map((row) => this.serializeListRow(row)),
    }
  }

  async getById(
    questionnaireApplicationId: number,
    allowedBusinessUnitIds: number[] = [],
    i18n?: I18n
  ): Promise<QuestionnaireApplicationDetailResult> {
    const row = (await this.baseListQuery(allowedBusinessUnitIds, {})
      .clone()
      .where('qa.questionnaire_application_id', questionnaireApplicationId)
      .select(
        'qa.questionnaire_application_id as questionnaireApplicationId',
        'qa.questionnaire_application_folio as folio',
        'qa.branch_office_id as branchOfficeId',
        'bo.branch_office_name as branchOfficeName',
        'bu.business_unit_public_id as businessUnitPublicId',
        'qa.regulation_questionnaire_id as regulationQuestionnaireId',
        'qa.questionnaire_application_instrument as applicableInstrument',
        'qa.questionnaire_application_status as status',
        'qa.questionnaire_application_launched_at as launchedAt',
        'qa.questionnaire_application_closed_at as closedAt',
        db.raw('COUNT(qat.questionnaire_application_target_id) as targetCount'),
        db.raw(
          "SUM(CASE WHEN qat.questionnaire_application_target_status = 'respondido' THEN 1 ELSE 0 END) as respondedCount"
        )
      )
      .groupBy(
        'qa.questionnaire_application_id',
        'qa.questionnaire_application_folio',
        'qa.branch_office_id',
        'bo.branch_office_name',
        'bu.business_unit_public_id',
        'qa.regulation_questionnaire_id',
        'qa.questionnaire_application_instrument',
        'qa.questionnaire_application_status',
        'qa.questionnaire_application_launched_at',
        'qa.questionnaire_application_closed_at'
      )
      .first()) as QuestionnaireApplicationRow | null

    if (!row) {
      throw new QuestionnaireApplicationServiceError(
        this.translate(
          i18n,
          'nom035.questionnaire_application.not_found',
          'La aplicación de cuestionario no existe o está fuera de alcance'
        ),
        QUESTIONNAIRE_APPLICATION_ERROR_CODES.NOT_FOUND,
        404,
        'aplicacion-no-encontrada'
      )
    }

    return this.serializeDetailRow(row)
  }

  async listTargets(
    questionnaireApplicationId: number,
    filters: QuestionnaireApplicationTargetListFilters,
    allowedBusinessUnitIds: number[] = [],
    i18n?: I18n
  ): Promise<QuestionnaireApplicationTargetListItem[]> {
    await this.getById(questionnaireApplicationId, allowedBusinessUnitIds, i18n)

    const employeeFullNameExpression =
      "TRIM(CONCAT(COALESCE(e.employee_first_name, ''), ' ', COALESCE(e.employee_last_name, ''), ' ', COALESCE(e.employee_second_last_name, '')))"

    const rows = (await db
      .from('questionnaire_application_targets as qat')
      .join('questionnaire_applications as qa', 'qa.questionnaire_application_id', 'qat.questionnaire_application_id')
      .join('branch_offices as bo', 'bo.branch_office_id', 'qa.branch_office_id')
      .join('employees as e', 'e.employee_id', 'qat.employee_id')
      .leftJoin('questionnaire_application_responses as qar', (join) => {
        join
          .on('qar.questionnaire_application_id', 'qat.questionnaire_application_id')
          .andOn('qar.employee_id', 'qat.employee_id')
          .andOnNull('qar.questionnaire_application_response_deleted_at')
      })
      .leftJoin('departments as d', 'd.department_id', 'e.department_id')
      .leftJoin('positions as p', 'p.position_id', 'e.position_id')
      .where('qat.questionnaire_application_id', questionnaireApplicationId)
      .whereNull('e.employee_deleted_at')
      .whereNull('qa.questionnaire_application_deleted_at')
      .whereNull('bo.branch_office_deleted_at')
      .if(!!filters.status, (query) => {
        query.where('qat.questionnaire_application_target_status', filters.status!)
      })
      .if(!!filters.captureStatus, (query) => {
        if (filters.captureStatus === 'respondido') {
          query.where('qat.questionnaire_application_target_status', 'respondido')
          return
        }

        if (filters.captureStatus === 'borrador') {
          query
            .where('qat.questionnaire_application_target_status', 'pendiente')
            .where('qar.questionnaire_application_response_status', 'borrador')
          return
        }

        query
          .where('qat.questionnaire_application_target_status', 'pendiente')
          .where((captureQuery) => {
            captureQuery
              .whereNull('qar.questionnaire_application_response_status')
              .orWhereNot('qar.questionnaire_application_response_status', 'borrador')
          })
      })
      .if(!!filters.search, (query) => {
        query.whereRaw(`${employeeFullNameExpression} LIKE ?`, [`%${filters.search}%`])
      })
      .select(
        'qat.questionnaire_application_target_id as questionnaireApplicationTargetId',
        'qat.employee_id as employeeId',
        'e.employee_code as employeeCode',
        'e.employee_payroll_num as employeePayrollNum',
        db.raw(`${employeeFullNameExpression} as employeeFullName`),
        'd.department_name as departmentName',
        'p.position_name as positionName',
        'qat.questionnaire_application_target_status as status',
        'qar.questionnaire_application_response_status as responseStatus',
        'qat.questionnaire_application_target_responded_at as respondedAt'
      )
      .orderBy('qat.questionnaire_application_target_id', 'asc')) as QuestionnaireApplicationTargetRow[]

    return rows.map((row) => ({
      questionnaireApplicationTargetId: Number(row.questionnaireApplicationTargetId),
      employeeId: Number(row.employeeId),
      employeeCode: row.employeeCode,
      employeePayrollNum: row.employeePayrollNum,
      employeeFullName: row.employeeFullName,
      departmentName: row.departmentName,
      positionName: row.positionName,
      status: row.status,
      captureStatus: row.status === 'respondido' ? 'respondido' : row.responseStatus === 'borrador' ? 'borrador' : 'pendiente',
      respondedAt: this.toIsoUtc(row.respondedAt),
    }))
  }

  async close(
    questionnaireApplicationId: number,
    actorUserId: number,
    input: CloseQuestionnaireApplicationInput,
    allowedBusinessUnitIds: number[] = [],
    i18n?: I18n
  ): Promise<QuestionnaireApplicationDetailResult> {
    const application = await this.getById(questionnaireApplicationId, allowedBusinessUnitIds, i18n)

    if (application.status === 'cerrada') {
      throw new QuestionnaireApplicationServiceError(
        this.translate(
          i18n,
          'nom035.questionnaire_application.already_closed',
          'Esta ronda ya está cerrada'
        ),
        QUESTIONNAIRE_APPLICATION_ERROR_CODES.ALREADY_CLOSED,
        409,
        'ronda-ya-cerrada'
      )
    }

    if (application.status !== 'en-curso') {
      throw new QuestionnaireApplicationServiceError(
        this.translate(
          i18n,
          'nom035.questionnaire_application.not_in_progress',
          'Solo se puede cerrar una ronda en curso'
        ),
        QUESTIONNAIRE_APPLICATION_ERROR_CODES.NOT_IN_PROGRESS,
        422,
        'ronda-no-en-curso'
      )
    }

    const now = DateTime.utc().toSQL({ includeOffset: false })!

    await db.transaction(async (trx) => {
      await trx
        .from('questionnaire_applications')
        .where('questionnaire_application_id', questionnaireApplicationId)
        .update({
          questionnaire_application_status: 'cerrada',
          questionnaire_application_closed_at: now,
          questionnaire_application_updated_at: now,
        })

      await trx.table('questionnaire_application_state_logs').insert({
        questionnaire_application_id: questionnaireApplicationId,
        actor_user_id: actorUserId,
        questionnaire_application_state_log_from_status: 'en-curso',
        questionnaire_application_state_log_to_status: 'cerrada',
        questionnaire_application_state_log_note: input.note.trim(),
        questionnaire_application_state_log_created_at: now,
      })
    })

    return this.getById(questionnaireApplicationId, allowedBusinessUnitIds, i18n)
  }

  async listHistory(
    questionnaireApplicationId: number,
    allowedBusinessUnitIds: number[] = [],
    i18n?: I18n
  ): Promise<QuestionnaireApplicationStateLogItem[]> {
    await this.getById(questionnaireApplicationId, allowedBusinessUnitIds, i18n)

    const rows = (await db
      .from('questionnaire_application_state_logs as qasl')
      .join('users as u', 'u.user_id', 'qasl.actor_user_id')
      .leftJoin('people as p', 'p.person_id', 'u.person_id')
      .where('qasl.questionnaire_application_id', questionnaireApplicationId)
      .select(
        'qasl.questionnaire_application_state_log_id as questionnaireApplicationStateLogId',
        'qasl.questionnaire_application_state_log_from_status as fromStatus',
        'qasl.questionnaire_application_state_log_to_status as toStatus',
        'qasl.questionnaire_application_state_log_note as note',
        'qasl.actor_user_id as actorUserId',
        'u.user_email as actorUserEmail',
        db.raw(
          "NULLIF(TRIM(CONCAT(COALESCE(p.person_firstname, ''), ' ', COALESCE(p.person_lastname, ''), ' ', COALESCE(p.person_second_lastname, ''))), '') as actorUserFullName"
        ),
        'qasl.questionnaire_application_state_log_created_at as createdAt'
      )
      .orderBy('qasl.questionnaire_application_state_log_created_at', 'asc')) as QuestionnaireApplicationStateLogRow[]

    return rows.map((row) => ({
      questionnaireApplicationStateLogId: Number(row.questionnaireApplicationStateLogId),
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      note: row.note,
      actorUser: {
        userId: Number(row.actorUserId),
        email: row.actorUserEmail,
        fullName: row.actorUserFullName,
      },
      createdAt: this.toIsoUtc(row.createdAt)!,
    }))
  }

  async softDelete(
    questionnaireApplicationId: number,
    allowedBusinessUnitIds: number[] = [],
    i18n?: I18n
  ): Promise<void> {
    const row = await db
      .from('questionnaire_applications as qa')
      .where('qa.questionnaire_application_id', questionnaireApplicationId)
      .whereNull('qa.questionnaire_application_deleted_at')
      .if(allowedBusinessUnitIds.length > 0, (query) => {
        query.whereIn('qa.business_unit_id', allowedBusinessUnitIds)
      })
      .if(allowedBusinessUnitIds.length === 0, (query) => {
        query.whereRaw('1 = 0')
      })
      .first()

    if (!row) {
      throw new QuestionnaireApplicationServiceError(
        this.translate(
          i18n,
          'nom035.questionnaire_application.not_found',
          'La aplicación de cuestionario no existe o está fuera de alcance'
        ),
        QUESTIONNAIRE_APPLICATION_ERROR_CODES.NOT_FOUND,
        404,
        'aplicacion-no-encontrada'
      )
    }

    const responseRow = await db
      .from('questionnaire_application_targets')
      .where('questionnaire_application_id', questionnaireApplicationId)
      .where('questionnaire_application_target_status', 'respondido')
      .count('questionnaire_application_target_id as respondedCount')
      .first()
    const respondedCount = Number(
      (responseRow as { respondedCount?: string | number } | undefined)?.respondedCount ?? 0
    )

    if (respondedCount > 0) {
      throw new QuestionnaireApplicationServiceError(
        this.translate(
          i18n,
          'nom035.questionnaire_application.has_responses',
          'No se puede eliminar una aplicación con respuestas capturadas'
        ),
        QUESTIONNAIRE_APPLICATION_ERROR_CODES.HAS_RESPONSES,
        422,
        'aplicacion-con-respuestas'
      )
    }

    const launchedAt = row.questionnaire_application_launched_at
      ? DateTime.fromJSDate(new Date(row.questionnaire_application_launched_at))
      : DateTime.fromSQL(row.questionnaire_application_created_at as string)

    const guard = new RetentionGuardService()
    await guard.assertCanDelete(
      row.business_unit_id as number,
      'questionnaire_application',
      launchedAt
    )

    await db
      .from('questionnaire_applications')
      .where('questionnaire_application_id', questionnaireApplicationId)
      .update({
        questionnaire_application_deleted_at: DateTime.utc().toSQL({ includeOffset: false }),
        questionnaire_application_updated_at: DateTime.utc().toSQL({ includeOffset: false }),
      })
  }

  private baseListQuery(allowedBusinessUnitIds: number[], filters: QuestionnaireApplicationListFilters) {
    return db
      .from('questionnaire_applications as qa')
      .leftJoin('branch_offices as bo', 'bo.branch_office_id', 'qa.branch_office_id')
      .leftJoin('business_units as bu', 'bu.business_unit_id', 'qa.business_unit_id')
      .leftJoin(
        'questionnaire_application_targets as qat',
        'qat.questionnaire_application_id',
        'qa.questionnaire_application_id'
      )
      .whereNull('qa.questionnaire_application_deleted_at')
      .whereNull('bo.branch_office_deleted_at')
      .if(allowedBusinessUnitIds.length > 0, (query) => {
        query.whereIn('qa.business_unit_id', allowedBusinessUnitIds)
      })
      .if(allowedBusinessUnitIds.length === 0, (query) => {
        query.whereRaw('1 = 0')
      })
      .if(!!filters.branchOfficeId, (query) => {
        query.where('qa.branch_office_id', filters.branchOfficeId!)
      })
      .if(!!filters.status, (query) => {
        query.where('qa.questionnaire_application_status', filters.status!)
      })
  }

  private baseListAggregatedQuery(
    allowedBusinessUnitIds: number[],
    filters: QuestionnaireApplicationListFilters
  ) {
    const respondedCountExpression =
      "COALESCE(SUM(CASE WHEN qat.questionnaire_application_target_status = 'respondido' THEN 1 ELSE 0 END), 0)"
    const targetCountExpression = 'COUNT(qat.questionnaire_application_target_id)'

    return this.baseListQuery(allowedBusinessUnitIds, filters)
      .clone()
      .select(
        'qa.questionnaire_application_id as questionnaireApplicationId',
        'qa.questionnaire_application_folio as folio',
        'qa.branch_office_id as branchOfficeId',
        'bo.branch_office_name as branchOfficeName',
        'bu.business_unit_public_id as businessUnitPublicId',
        'qa.regulation_questionnaire_id as regulationQuestionnaireId',
        'qa.questionnaire_application_instrument as applicableInstrument',
        'qa.questionnaire_application_status as status',
        'qa.questionnaire_application_launched_at as launchedAt',
        'qa.questionnaire_application_closed_at as closedAt',
        db.raw(`${targetCountExpression} as targetCount`),
        db.raw(`${respondedCountExpression} as respondedCount`)
      )
      .groupBy(
        'qa.questionnaire_application_id',
        'qa.questionnaire_application_folio',
        'qa.branch_office_id',
        'bo.branch_office_name',
        'bu.business_unit_public_id',
        'qa.regulation_questionnaire_id',
        'qa.questionnaire_application_instrument',
        'qa.questionnaire_application_status',
        'qa.questionnaire_application_launched_at',
        'qa.questionnaire_application_closed_at'
      )
      .if(!!filters.completionStatus, (query) => {
        this.applyCompletionStatusHaving(query, filters.completionStatus!)
      })
  }

  private applyCompletionStatusHaving(
    query: ReturnType<typeof db.from>,
    completionStatus: QuestionnaireApplicationCompletionStatus
  ) {
    const respondedCountExpression =
      "COALESCE(SUM(CASE WHEN qat.questionnaire_application_target_status = 'respondido' THEN 1 ELSE 0 END), 0)"
    const targetCountExpression = 'COUNT(qat.questionnaire_application_target_id)'

    if (completionStatus === 'none') {
      query.havingRaw(`${respondedCountExpression} = 0`)
      return
    }

    if (completionStatus === 'full') {
      query.havingRaw(
        `${targetCountExpression} > 0 AND ${respondedCountExpression} = ${targetCountExpression}`
      )
      return
    }

    query.havingRaw(
      `${respondedCountExpression} > 0 AND ${respondedCountExpression} < ${targetCountExpression}`
    )
  }

  private async findBranchInScopeOrFail(
    branchOfficeId: number,
    allowedBusinessUnitIds: number[],
    i18n?: I18n
  ): Promise<{ branchOfficeId: number; businessUnitId: number }> {
    const branch = await db
      .from('branch_offices')
      .where('branch_office_id', branchOfficeId)
      .whereNull('branch_office_deleted_at')
      .if(allowedBusinessUnitIds.length > 0, (query) => {
        query.whereIn('business_unit_id', allowedBusinessUnitIds)
      })
      .if(allowedBusinessUnitIds.length === 0, (query) => {
        query.whereRaw('1 = 0')
      })
      .select('branch_office_id as branchOfficeId', 'business_unit_id as businessUnitId')
      .first()

    if (!branch) {
      throw new QuestionnaireApplicationServiceError(
        this.translate(
          i18n,
          'nom035.questionnaire_application.branch_not_found',
          'Sucursal no encontrada o fuera del alcance del usuario'
        ),
        QUESTIONNAIRE_APPLICATION_ERROR_CODES.NOT_FOUND_BRANCH,
        404,
        'sucursal-no-encontrada'
      )
    }

    return {
      branchOfficeId: Number((branch as { branchOfficeId: number | string }).branchOfficeId),
      businessUnitId: Number((branch as { businessUnitId: number | string }).businessUnitId),
    }
  }

  private serializeListRow(row: QuestionnaireApplicationRow): QuestionnaireApplicationListItem {
    const targetCount = Number(row.targetCount)
    const respondedCount = Number(row.respondedCount)

    return {
      questionnaireApplicationId: Number(row.questionnaireApplicationId),
      folio: row.folio,
      branchOfficeId: Number(row.branchOfficeId),
      branchOfficeName: row.branchOfficeName,
      applicableInstrument: row.applicableInstrument,
      status: row.status,
      targetCount,
      respondedCount,
      completionStatus: this.resolveCompletionStatus(targetCount, respondedCount),
      launchedAt: this.toIsoUtc(row.launchedAt)!,
    }
  }

  private serializeDetailRow(row: QuestionnaireApplicationRow): QuestionnaireApplicationDetailResult {
    return {
      ...this.serializeListRow(row),
      businessUnitPublicId: String(row.businessUnitPublicId),
      regulationQuestionnaireId: Number(row.regulationQuestionnaireId),
      closedAt: this.toIsoUtc(row.closedAt),
    }
  }

  private toIsoUtc(value: string | Date | null): string | null {
    if (!value) return null
    if (value instanceof Date) {
      return DateTime.fromJSDate(value, { zone: 'utc' }).toISO()
    }

    const sqlDate = DateTime.fromSQL(value, { zone: 'utc' })
    if (sqlDate.isValid) return sqlDate.toISO()

    const isoDate = DateTime.fromISO(value, { zone: 'utc' })
    if (isoDate.isValid) return isoDate.toISO()

    return null
  }

  private resolveCompletionStatus(
    targetCount: number,
    respondedCount: number
  ): QuestionnaireApplicationCompletionStatus {
    if (respondedCount <= 0) return 'none'
    if (targetCount > 0 && respondedCount >= targetCount) return 'full'
    return 'partial'
  }

  private translate(i18n: I18n | undefined, key: string, fallback: string): string {
    if (!i18n) return fallback
    const translated = i18n.formatMessage(key)
    return translated === key ? fallback : translated
  }

  private async generateUniqueFolio(i18n?: I18n): Promise<string> {
    const year = DateTime.utc().year

    for (let attempt = 0; attempt < 8; attempt++) {
      const suffix = String(Math.floor(100000 + Math.random() * 900000))
      const folio = `${QUESTIONNAIRE_APPLICATION_FOLIO_PREFIX}-${year}-${suffix}`
      const existing = await db
        .from('questionnaire_applications')
        .where('questionnaire_application_folio', folio)
        .first()
      if (!existing) {
        return folio
      }
    }

    throw new QuestionnaireApplicationServiceError(
      this.translate(
        i18n,
        'nom035.questionnaire_application.folio_generation_failed',
        'No se pudo generar un folio único para la aplicación'
      ),
      QUESTIONNAIRE_APPLICATION_ERROR_CODES.FOLIO_GENERATION_FAILED,
      500,
      'folio-no-generado'
    )
  }
}
