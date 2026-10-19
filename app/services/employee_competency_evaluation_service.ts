import Employee from '#models/employee'
import EmployeeCompetencyEvaluation from '#models/employee_competency_evaluation'
import PositionBusinessUnitCompetencyLevel from '#models/position_business_unit_competency_level'
import BusinessUnitCompetencyLevel from '#models/business_unit_competency_level'
import CompetencyBracket from '#models/competency_bracket'
import { COMPETENCY_ERROR_CODES, type CompetencyErrorCode } from '#constants/competency_error_codes'
import { I18n } from '@adonisjs/i18n'

export default class EmployeeCompetencyEvaluationService {
  private t: (key: string,params?: { [key: string]: string | number }) => string

  constructor(i18n: I18n) {
    this.t = i18n.formatMessage.bind(i18n)
  }

  /**
   * VLRH-H1792032453526 (regla 2 propia, VLRH-C0192 R4): el nivel por puesto,
   * el nivel de empresa y el rango calificados deben ser de la empresa en
   * contexto. La pertenencia sale de la consulta escopeada
   * (withBusinessUnitScope, VLRH-H1792026427127): sin fila es ajeno, plantilla
   * o inexistente, sin distinguir.
   *
   * Solo valida los ids presentes. Orden: positionBusinessUnitCompetencyLevelId
   * → businessUnitCompetencyLevelId → competencyBracketId.
   */
  async findOutOfScopeReference(data: {
    positionBusinessUnitCompetencyLevelId?: number | null
    businessUnitCompetencyLevelId?: number | null
    competencyBracketId?: number | null
  }): Promise<CompetencyErrorCode | null> {
    if (data.positionBusinessUnitCompetencyLevelId) {
      const positionLevel = await PositionBusinessUnitCompetencyLevel.query()
        .whereNull('position_business_unit_competency_level_deleted_at')
        .where('positionBusinessUnitCompetencyLevelId', data.positionBusinessUnitCompetencyLevelId)
        .first()
      if (!positionLevel) return COMPETENCY_ERROR_CODES.POSITION_LEVEL_NOT_FOUND
    }

    if (data.businessUnitCompetencyLevelId) {
      const level = await BusinessUnitCompetencyLevel.query()
        .whereNull('business_unit_competency_level_deleted_at')
        .where('businessUnitCompetencyLevelId', data.businessUnitCompetencyLevelId)
        .first()
      if (!level) return COMPETENCY_ERROR_CODES.BUSINESS_UNIT_LEVEL_NOT_FOUND
    }

    if (data.competencyBracketId) {
      const bracket = await CompetencyBracket.query()
        .whereNull('competency_bracket_deleted_at')
        .where('competencyBracketId', data.competencyBracketId)
        .first()
      if (!bracket) return COMPETENCY_ERROR_CODES.BRACKET_NOT_FOUND
    }

    return null
  }
  async create(employeeCompetencyEvaluation: EmployeeCompetencyEvaluation) {
    const newEmployeeCompetencyEvaluation = new EmployeeCompetencyEvaluation()
    newEmployeeCompetencyEvaluation.employeeEvaluationId = employeeCompetencyEvaluation.employeeEvaluationId
    newEmployeeCompetencyEvaluation.positionBusinessUnitCompetencyLevelId = employeeCompetencyEvaluation.positionBusinessUnitCompetencyLevelId
    newEmployeeCompetencyEvaluation.businessUnitCompetencyLevelId = employeeCompetencyEvaluation.businessUnitCompetencyLevelId
    newEmployeeCompetencyEvaluation.competencyBracketId = employeeCompetencyEvaluation.competencyBracketId
    newEmployeeCompetencyEvaluation.employeeCompetencyEvaluationBracketDescription = employeeCompetencyEvaluation.employeeCompetencyEvaluationBracketDescription
    newEmployeeCompetencyEvaluation.employeeCompetencyEvaluationBracketRangeMin = employeeCompetencyEvaluation.employeeCompetencyEvaluationBracketRangeMin
    newEmployeeCompetencyEvaluation.employeeCompetencyEvaluationBracketRangeMax = employeeCompetencyEvaluation.employeeCompetencyEvaluationBracketRangeMax
    newEmployeeCompetencyEvaluation.employeeCompetencyEvaluationScore = employeeCompetencyEvaluation.employeeCompetencyEvaluationScore
    await newEmployeeCompetencyEvaluation.save()
    return newEmployeeCompetencyEvaluation
  }

  async update(currentEmployeeCompetencyEvaluation: EmployeeCompetencyEvaluation, employeeCompetencyEvaluation: EmployeeCompetencyEvaluation) {
    currentEmployeeCompetencyEvaluation.businessUnitCompetencyLevelId = employeeCompetencyEvaluation.businessUnitCompetencyLevelId
    currentEmployeeCompetencyEvaluation.competencyBracketId = employeeCompetencyEvaluation.competencyBracketId
    currentEmployeeCompetencyEvaluation.employeeCompetencyEvaluationScore = employeeCompetencyEvaluation.employeeCompetencyEvaluationScore
    currentEmployeeCompetencyEvaluation.employeeCompetencyEvaluationBracketDescription = employeeCompetencyEvaluation.employeeCompetencyEvaluationBracketDescription
    currentEmployeeCompetencyEvaluation.employeeCompetencyEvaluationBracketRangeMin = employeeCompetencyEvaluation.employeeCompetencyEvaluationBracketRangeMin
    currentEmployeeCompetencyEvaluation.employeeCompetencyEvaluationBracketRangeMax = employeeCompetencyEvaluation.employeeCompetencyEvaluationBracketRangeMax
    await currentEmployeeCompetencyEvaluation.save()
    return currentEmployeeCompetencyEvaluation
  }

  async delete(currentEmployeeCompetencyEvaluation: EmployeeCompetencyEvaluation) {
    await currentEmployeeCompetencyEvaluation.delete()
    return currentEmployeeCompetencyEvaluation
  }

  async show(employeeCompetencyEvaluationId: number) {
    const employeeCompetencyEvaluation = await EmployeeCompetencyEvaluation.query()
      .whereNull('employee_competency_evaluation_deleted_at')
      .where('employee_competency_evaluation_id', employeeCompetencyEvaluationId)
      .preload('businessUnitCompetencyLevel')
      .first()
    return employeeCompetencyEvaluation ? employeeCompetencyEvaluation : null
  }

  async verifyInfoExist(employeeCompetencyEvaluation: EmployeeCompetencyEvaluation) {
    const existEmployee = await Employee.query()
      .whereNull('employee_deleted_at')
      .where('employee_id', employeeCompetencyEvaluation.employeeEvaluationId)
      .first()

    if (!existEmployee && employeeCompetencyEvaluation.employeeEvaluationId) {
      const entity = this.t('employee')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...employeeCompetencyEvaluation },
      }
    }

    const existPositionBusinessUnitCompetencyLevel = await PositionBusinessUnitCompetencyLevel.query()
      .whereNull('position_business_unit_competency_level_deleted_at')
      .where('position_business_unit_competency_level_id', employeeCompetencyEvaluation.positionBusinessUnitCompetencyLevelId)
      .first()

    if (!existPositionBusinessUnitCompetencyLevel && employeeCompetencyEvaluation.positionBusinessUnitCompetencyLevelId) {
      const entity = this.t('position_business_unit_competency_level')
      return {
        status: 400,
        type: 'warning',
        title: this.t('entity_was_not_found', { entity }),
        message: this.t('entity_was_not_found_with_entered_id', { entity }),
        data: { ...employeeCompetencyEvaluation },
      }
    }
    return {
      status: 200,
      type: 'success',
      title: this.t('info_verify_successfully'),
      message: this.t('info_verify_successfully'),
      data: { ...employeeCompetencyEvaluation },
    }
  }
}
