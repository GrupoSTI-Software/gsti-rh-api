import { DateTime } from 'luxon'
import type { I18n } from '@adonisjs/i18n'
import db from '@adonisjs/lucid/services/db'
import { NOM035_TABULATION_ERROR_CODES } from '#constants/nom035_tabulation_error_codes'
import { QuestionnaireTabulationServiceError } from '#exceptions/questionnaire_tabulation_service_error'
import { RISK_SEVERITY_ORD } from '../helpers/risk_severity.js'
import QuestionnaireScoringService, {
  QuestionnaireScoringServiceError,
} from '#services/questionnaire_scoring_service'
import type {
  EmployeeResponseInput,
  QuestionDefinitionInput,
  TabulationResult,
  ThresholdInput,
} from '../interfaces/questionnaire_tabulation.interface.js'

type ApplicationInScope = {
  questionnaireApplicationId: number
  businessUnitId: number
  regulationQuestionnaireId: number
  questionnaireCode: string
  questionnaireApplicationStatus: 'borrador' | 'en-curso' | 'cerrada'
  minResponders: number | null
}

type ResponseRow = {
  employeeId: number
  questionId: number
  optionKey: string
}

type QuestionDefinitionRow = {
  questionId: number
  categoryCode: string
  isReverseScored: number
  weight: number
  options: Array<{ key: string; value: number; reverseValue?: number }>
  domainCode: string | null
}

export default class QuestionnaireTabulationService {
  private scoringService = new QuestionnaireScoringService()

  async tabulate(
    applicationId: number,
    allowedBusinessUnitIds: number[] = [],
    i18n?: I18n
  ): Promise<TabulationResult> {
    const application = await this.findApplicationInScopeOrFail(
      applicationId,
      allowedBusinessUnitIds,
      i18n
    )

    if (application.questionnaireApplicationStatus !== 'cerrada') {
      throw new QuestionnaireTabulationServiceError(
        this.translate(
          i18n,
          'nom035.questionnaire_tabulation.not_closed',
          'Solo se puede tabular una ronda cerrada'
        ),
        NOM035_TABULATION_ERROR_CODES.NOT_CLOSED,
        422
      )
    }

    const responseRows = await this.loadResponseRows(application.questionnaireApplicationId)
    const responses = this.groupResponsesByEmployee(responseRows)
    const respondersCount = responses.length

    if (
      (application.minResponders !== null && respondersCount < application.minResponders) ||
      (application.minResponders === null && respondersCount < 1)
    ) {
      throw new QuestionnaireTabulationServiceError(
        this.translate(
          i18n,
          'nom035.questionnaire_tabulation.insufficient_responses',
          'No hay suficientes respuestas para tabular la ronda'
        ),
        NOM035_TABULATION_ERROR_CODES.INSUFFICIENT_RESPONSES,
        422
      )
    }

    const questionDefinitions = await this.loadQuestionDefinitions(application.regulationQuestionnaireId)
    const thresholds = await this.loadThresholds(application.regulationQuestionnaireId)

    let result: TabulationResult
    try {
      result = this.scoringService.compute({
        applicationId: application.questionnaireApplicationId,
        instrumentCode: application.questionnaireCode,
        responses,
        questionDefinitions,
        thresholds,
      })
    } catch (error) {
      if (error instanceof QuestionnaireScoringServiceError) {
        throw new QuestionnaireTabulationServiceError(error.message, error.errorCode, error.httpStatus)
      }
      throw error
    }

    const now = DateTime.utc().toSQL({ includeOffset: false })!

    await db.transaction(async (trx) => {
      await trx
        .from('questionnaire_tabulation_results')
        .where('questionnaire_application_id', application.questionnaireApplicationId)
        .delete()
      await trx
        .from('questionnaire_tabulation_employee_results')
        .where('questionnaire_application_id', application.questionnaireApplicationId)
        .delete()

      const aggregateRows = [
        {
          questionnaire_application_id: application.questionnaireApplicationId,
          business_unit_id: application.businessUnitId,
          questionnaire_tabulation_result_scope: 'overall',
          questionnaire_tabulation_result_target_code: null,
          questionnaire_tabulation_result_score: result.overall.score,
          questionnaire_tabulation_result_risk_level: result.overall.riskLevel,
          questionnaire_tabulation_result_responders_count: result.respondersCount,
          questionnaire_tabulation_result_computed_at: now,
          questionnaire_tabulation_result_created_at: now,
          questionnaire_tabulation_result_updated_at: now,
        },
        ...result.categories.map((category) => ({
          questionnaire_application_id: application.questionnaireApplicationId,
          business_unit_id: application.businessUnitId,
          questionnaire_tabulation_result_scope: 'category',
          questionnaire_tabulation_result_target_code: category.code,
          questionnaire_tabulation_result_score: category.score,
          questionnaire_tabulation_result_risk_level: category.riskLevel,
          questionnaire_tabulation_result_responders_count: category.respondersCount,
          questionnaire_tabulation_result_computed_at: now,
          questionnaire_tabulation_result_created_at: now,
          questionnaire_tabulation_result_updated_at: now,
        })),
        ...result.domains.map((domain) => ({
          questionnaire_application_id: application.questionnaireApplicationId,
          business_unit_id: application.businessUnitId,
          questionnaire_tabulation_result_scope: 'domain',
          questionnaire_tabulation_result_target_code: domain.code,
          questionnaire_tabulation_result_score: domain.score,
          questionnaire_tabulation_result_risk_level: domain.riskLevel,
          questionnaire_tabulation_result_responders_count: domain.respondersCount,
          questionnaire_tabulation_result_computed_at: now,
          questionnaire_tabulation_result_created_at: now,
          questionnaire_tabulation_result_updated_at: now,
        })),
      ]

      if (aggregateRows.length > 0) {
        await trx.table('questionnaire_tabulation_results').insert(aggregateRows)
      }

      const employeeRows = result.employees.map((employee) => ({
        questionnaire_application_id: application.questionnaireApplicationId,
        employee_id: employee.employeeId,
        questionnaire_tabulation_employee_result_score: employee.score,
        questionnaire_tabulation_employee_result_risk_level: employee.riskLevel,
        questionnaire_tabulation_employee_result_created_at: now,
        questionnaire_tabulation_employee_result_updated_at: now,
      }))

      if (employeeRows.length > 0) {
        await trx.table('questionnaire_tabulation_employee_results').insert(employeeRows)
      }
    })

    return result
  }

  async getAggregates(
    applicationId: number,
    allowedBusinessUnitIds: number[] = [],
    i18n?: I18n
  ): Promise<TabulationResult> {
    const application = await this.findApplicationInScopeOrFail(
      applicationId,
      allowedBusinessUnitIds,
      i18n
    )

    const rows = await db
      .from('questionnaire_tabulation_results')
      .where('questionnaire_application_id', application.questionnaireApplicationId)
      .orderBy('questionnaire_tabulation_result_scope', 'asc')
      .orderBy('questionnaire_tabulation_result_target_code', 'asc')

    if (rows.length === 0) {
      throw new QuestionnaireTabulationServiceError(
        this.translate(
          i18n,
          'nom035.questionnaire_tabulation.not_tabulated',
          'La ronda aún no tiene tabulación calculada'
        ),
        NOM035_TABULATION_ERROR_CODES.NOT_TABULATED,
        404
      )
    }

    const overall = rows.find(
      (row) => row.questionnaire_tabulation_result_scope === 'overall'
    )
    if (!overall) {
      throw new QuestionnaireTabulationServiceError(
        this.translate(
          i18n,
          'nom035.questionnaire_tabulation.not_tabulated',
          'La ronda aún no tiene tabulación calculada'
        ),
        NOM035_TABULATION_ERROR_CODES.NOT_TABULATED,
        404
      )
    }

    const categories = rows
      .filter((row) => row.questionnaire_tabulation_result_scope === 'category')
      .map((row) => ({
        code: String(row.questionnaire_tabulation_result_target_code),
        score: Number(row.questionnaire_tabulation_result_score),
        riskLevel: row.questionnaire_tabulation_result_risk_level,
        respondersCount: Number(row.questionnaire_tabulation_result_responders_count),
      }))

    const domainCategoryRows = await db
      .from('risk_domains')
      .where('regulation_questionnaire_id', application.regulationQuestionnaireId)
      .whereNull('deleted_at')
      .select('risk_domain_code as domainCode', 'risk_domain_category_section_code as categoryCode')
    const domainCategoryMap = new Map(
      domainCategoryRows.map((row) => [String(row.domainCode), String(row.categoryCode)])
    )

    const domains = rows
      .filter((row) => row.questionnaire_tabulation_result_scope === 'domain')
      .map((row) => ({
        code: String(row.questionnaire_tabulation_result_target_code),
        categoryCode:
          domainCategoryMap.get(String(row.questionnaire_tabulation_result_target_code)) ??
          'SIN_CATEGORIA',
        score: Number(row.questionnaire_tabulation_result_score),
        riskLevel: row.questionnaire_tabulation_result_risk_level,
        respondersCount: Number(row.questionnaire_tabulation_result_responders_count),
      }))

    return {
      applicationId: application.questionnaireApplicationId,
      instrumentCode: application.questionnaireCode,
      respondersCount: Number(overall.questionnaire_tabulation_result_responders_count),
      overall: {
        score: Number(overall.questionnaire_tabulation_result_score),
        riskLevel: overall.questionnaire_tabulation_result_risk_level,
      },
      categories,
      domains: this.sortDomainsBySeverity(domains),
      employees: [],
    }
  }

  async getEmployeeResults(
    applicationId: number,
    allowedBusinessUnitIds: number[] = [],
    i18n?: I18n
  ): Promise<{ applicationId: number; employees: TabulationResult['employees'] }> {
    const application = await this.findApplicationInScopeOrFail(
      applicationId,
      allowedBusinessUnitIds,
      i18n
    )

    const employeeRows = await db
      .from('questionnaire_tabulation_employee_results')
      .where('questionnaire_application_id', application.questionnaireApplicationId)
      .orderBy('employee_id', 'asc')
      .select(
        'employee_id as employeeId',
        'questionnaire_tabulation_employee_result_score as score',
        'questionnaire_tabulation_employee_result_risk_level as riskLevel'
      )

    return {
      applicationId: application.questionnaireApplicationId,
      employees: employeeRows.map((row) => ({
        employeeId: Number(row.employeeId),
        score: Number(row.score),
        riskLevel: row.riskLevel,
      })),
    }
  }

  private async findApplicationInScopeOrFail(
    applicationId: number,
    allowedBusinessUnitIds: number[],
    i18n?: I18n
  ): Promise<ApplicationInScope> {
    if (allowedBusinessUnitIds.length === 0) {
      throw new QuestionnaireTabulationServiceError(
        this.translate(
          i18n,
          'nom035.questionnaire_tabulation.not_found',
          'Ronda no encontrada o fuera del alcance del usuario'
        ),
        NOM035_TABULATION_ERROR_CODES.NOT_FOUND_APPLICATION,
        404
      )
    }

    const row = await db
      .from('questionnaire_applications as qa')
      .join(
        'regulation_questionnaires as rq',
        'rq.regulation_questionnaire_id',
        'qa.regulation_questionnaire_id'
      )
      .where('qa.questionnaire_application_id', applicationId)
      .whereNull('qa.questionnaire_application_deleted_at')
      .whereIn('qa.business_unit_id', allowedBusinessUnitIds)
      .select(
        'qa.questionnaire_application_id as questionnaireApplicationId',
        'qa.business_unit_id as businessUnitId',
        'qa.regulation_questionnaire_id as regulationQuestionnaireId',
        'qa.questionnaire_application_status as questionnaireApplicationStatus',
        'rq.regulation_questionnaire_code as questionnaireCode',
        'rq.regulation_questionnaire_min_responders as minResponders'
      )
      .first()

    if (!row) {
      throw new QuestionnaireTabulationServiceError(
        this.translate(
          i18n,
          'nom035.questionnaire_tabulation.not_found',
          'Ronda no encontrada o fuera del alcance del usuario'
        ),
        NOM035_TABULATION_ERROR_CODES.NOT_FOUND_APPLICATION,
        404
      )
    }

    return {
      questionnaireApplicationId: Number(row.questionnaireApplicationId),
      businessUnitId: Number(row.businessUnitId),
      regulationQuestionnaireId: Number(row.regulationQuestionnaireId),
      questionnaireCode: String(row.questionnaireCode),
      questionnaireApplicationStatus: row.questionnaireApplicationStatus,
      minResponders: row.minResponders === null ? null : Number(row.minResponders),
    }
  }

  private async loadResponseRows(applicationId: number): Promise<ResponseRow[]> {
    const rows = await db
      .from('questionnaire_application_responses as qar')
      .join(
        'questionnaire_application_answers as qaa',
        'qaa.questionnaire_application_response_id',
        'qar.questionnaire_application_response_id'
      )
      .where('qar.questionnaire_application_id', applicationId)
      .where('qar.questionnaire_application_response_status', 'respondido')
      .whereNull('qar.questionnaire_application_response_deleted_at')
      .select(
        'qar.employee_id as employeeId',
        'qaa.regulation_questionnaire_question_id as questionId',
        'qaa.questionnaire_application_answer_option_key as optionKey'
      )

    return rows.map((row) => ({
      employeeId: Number(row.employeeId),
      questionId: Number(row.questionId),
      optionKey: String(row.optionKey),
    }))
  }

  private groupResponsesByEmployee(rows: ResponseRow[]): EmployeeResponseInput[] {
    const grouped = new Map<number, EmployeeResponseInput>()

    for (const row of rows) {
      if (!grouped.has(row.employeeId)) {
        grouped.set(row.employeeId, { employeeId: row.employeeId, answers: [] })
      }

      grouped.get(row.employeeId)!.answers.push({
        questionId: row.questionId,
        optionKey: row.optionKey,
      })
    }

    return [...grouped.values()]
  }

  private async loadQuestionDefinitions(
    regulationQuestionnaireId: number
  ): Promise<QuestionDefinitionInput[]> {
    const rows = await db
      .from('regulation_questionnaire_questions as q')
      .join(
        'regulation_questionnaire_sections as s',
        's.regulation_questionnaire_section_id',
        'q.regulation_questionnaire_section_id'
      )
      .join(
        'regulation_questionnaire_answer_scales as scale',
        'scale.regulation_questionnaire_answer_scale_id',
        'q.regulation_questionnaire_question_answer_scale_id'
      )
      .leftJoin('risk_domain_questions as rdq', 'rdq.regulation_questionnaire_question_id', 'q.regulation_questionnaire_question_id')
      .leftJoin('risk_domains as rd', 'rd.risk_domain_id', 'rdq.risk_domain_id')
      .where('s.regulation_questionnaire_id', regulationQuestionnaireId)
      .whereNull('s.deleted_at')
      .whereNull('q.deleted_at')
      .whereNull('scale.deleted_at')
      .where((query) => {
        query.whereNull('rd.risk_domain_id').orWhereNull('rd.deleted_at')
      })
      .select(
        'q.regulation_questionnaire_question_id as questionId',
        's.regulation_questionnaire_section_code as categoryCode',
        'q.regulation_questionnaire_question_is_reverse_scored as isReverseScored',
        'q.regulation_questionnaire_question_weight as weight',
        'scale.regulation_questionnaire_answer_scale_definition as definition',
        'rd.risk_domain_code as domainCode'
      )

    const parsedRows = rows.map((row) => {
      const definition = row.definition as { options?: Array<{ key: string; value: number; reverseValue?: number }> } | null
      return {
        questionId: Number(row.questionId),
        categoryCode: String(row.categoryCode),
        isReverseScored: Number(row.isReverseScored),
        weight: Number(row.weight),
        options: definition?.options ?? [],
        domainCode: row.domainCode ? String(row.domainCode) : null,
      }
    })

    const byQuestionId = new Map<number, QuestionDefinitionRow>()
    for (const row of parsedRows) {
      if (!byQuestionId.has(row.questionId)) {
        byQuestionId.set(row.questionId, row)
      }
    }

    return [...byQuestionId.values()]
  }

  private async loadThresholds(regulationQuestionnaireId: number): Promise<ThresholdInput[]> {
    const rows = await db
      .from('risk_thresholds')
      .where('regulation_questionnaire_id', regulationQuestionnaireId)
      .whereNull('deleted_at')
      .select(
        'risk_threshold_scope as scope',
        'risk_threshold_target_code as targetCode',
        'risk_threshold_level as level',
        'risk_threshold_min as min',
        'risk_threshold_max as max',
        'risk_threshold_ord as ord'
      )

    return rows.map((row) => ({
      scope: row.scope,
      targetCode: row.targetCode ? String(row.targetCode) : null,
      level: row.level,
      min: Number(row.min),
      max: Number(row.max),
      ord: Number(row.ord),
    }))
  }

  private sortDomainsBySeverity<T extends { riskLevel: string | null }>(domains: T[]): T[] {
    return [...domains].sort((left, right) => {
      const leftSeverity = left.riskLevel
        ? (RISK_SEVERITY_ORD[left.riskLevel as keyof typeof RISK_SEVERITY_ORD] ?? 0)
        : 0
      const rightSeverity = right.riskLevel
        ? (RISK_SEVERITY_ORD[right.riskLevel as keyof typeof RISK_SEVERITY_ORD] ?? 0)
        : 0
      return rightSeverity - leftSeverity
    })
  }

  private translate(i18n: I18n | undefined, key: string, fallback: string): string {
    if (!i18n) return fallback
    const translated = i18n.formatMessage(key)
    return translated === key ? fallback : translated
  }
}
