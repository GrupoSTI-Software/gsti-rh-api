import { I18n } from '@adonisjs/i18n'
import db from '@adonisjs/lucid/services/db'
import BranchOffice from '#models/branch_office'
import { QUESTIONNAIRE_APPLICATION_OPEN_STATUSES } from '#constants/questionnaire_application'
import {
  QUESTIONNAIRE_APPLICABILITY_ERROR_CODES,
} from '#constants/questionnaire_applicability_error_codes'
import { QuestionnaireApplicabilityServiceError } from '#exceptions/questionnaire_applicability_service_error'
import type {
  ApplicableInstrument,
  LaunchBlockReason,
  QuestionnaireApplicabilityItem,
} from '../interfaces/questionnaire_applicability_interface.js'

export default class QuestionnaireApplicabilityService {
  static THRESHOLDS = {
    GUIDE_II_MIN: 16,
    GUIDE_III_MIN: 51,
  } as const

  static getApplicableInstrument(activeEmployees: number): ApplicableInstrument {
    if (activeEmployees >= this.THRESHOLDS.GUIDE_III_MIN) {
      return 'guide_iii'
    }

    if (activeEmployees >= this.THRESHOLDS.GUIDE_II_MIN) {
      return 'guide_ii'
    }

    return 'none'
  }

  private static buildApplicabilityItem(
    branchOfficeId: number,
    branchOfficeName: string,
    activeEmployees: number,
    openApplicationId: number | null,
    i18n: I18n
  ): QuestionnaireApplicabilityItem {
    const applicableInstrument = this.getApplicableInstrument(activeEmployees)
    const launchBlockReason = this.resolveLaunchBlockReason(applicableInstrument, openApplicationId)

    return {
      branchOfficeId,
      branchOfficeName,
      activeEmployees,
      applicableInstrument,
      canLaunch: launchBlockReason === null,
      launchBlockReason,
      blockingApplicationId: openApplicationId,
      note:
        applicableInstrument === 'none'
          ? i18n.formatMessage('nom035.questionnaire_applicability.none_note', {
              count: activeEmployees,
            })
          : null,
    }
  }

  private static resolveLaunchBlockReason(
    applicableInstrument: ApplicableInstrument,
    openApplicationId: number | null
  ): LaunchBlockReason {
    if (applicableInstrument === 'none') {
      return 'NOT_APPLICABLE'
    }

    if (openApplicationId !== null) {
      return 'OPEN_ROUND_EXISTS'
    }

    return null
  }

  private static async getActiveEmployeesCountByBranch(
    branchOfficeIds: number[]
  ): Promise<Map<number, number>> {
    if (branchOfficeIds.length === 0) {
      return new Map()
    }

    const rows = await db
      .from('employee_branch_offices as ebo')
      .innerJoin('employees as e', 'e.employee_id', 'ebo.employee_id')
      .whereIn('ebo.branch_office_id', branchOfficeIds)
      .where('ebo.employee_branch_office_active', 1)
      .whereNull('e.employee_deleted_at')
      .groupBy('ebo.branch_office_id')
      .select('ebo.branch_office_id as branchOfficeId')
      .countDistinct('ebo.employee_id as activeEmployees')

    const countMap = new Map<number, number>()
    for (const row of rows) {
      const branchOfficeId = Number((row as { branchOfficeId: number | string }).branchOfficeId)
      const activeEmployees = Number((row as { activeEmployees: number | string }).activeEmployees)
      countMap.set(branchOfficeId, activeEmployees)
    }
    return countMap
  }

  static async getActiveEmployeeIdsByBranch(branchOfficeId: number): Promise<number[]> {
    const rows = await db
      .from('employee_branch_offices as ebo')
      .innerJoin('employees as e', 'e.employee_id', 'ebo.employee_id')
      .where('ebo.branch_office_id', branchOfficeId)
      .where('ebo.employee_branch_office_active', 1)
      .whereNull('e.employee_deleted_at')
      .distinct('ebo.employee_id as employeeId')

    return rows.map((row) => Number((row as { employeeId: number | string }).employeeId))
  }

  private static async getOpenApplicationByBranch(
    branchOfficeIds: number[]
  ): Promise<Map<number, number>> {
    if (branchOfficeIds.length === 0) {
      return new Map()
    }

    const rows = await db
      .from('questionnaire_applications')
      .whereIn('branch_office_id', branchOfficeIds)
      .whereIn('questionnaire_application_status', [...QUESTIONNAIRE_APPLICATION_OPEN_STATUSES])
      .whereNull('questionnaire_application_deleted_at')
      .select('branch_office_id as branchOfficeId', 'questionnaire_application_id as applicationId')

    const result = new Map<number, number>()
    for (const row of rows) {
      const branchOfficeId = Number((row as { branchOfficeId: number | string }).branchOfficeId)
      const applicationId = Number((row as { applicationId: number | string }).applicationId)
      if (!result.has(branchOfficeId)) {
        result.set(branchOfficeId, applicationId)
      }
    }

    return result
  }

  static async getByBusinessUnit(
    businessUnitId: number,
    i18n: I18n
  ): Promise<QuestionnaireApplicabilityItem[]> {
    const branchOffices = await BranchOffice.query()
      .where('businessUnitId', businessUnitId)
      .whereNull('branch_office_deleted_at')
      .orderBy('branchOfficeName', 'asc')

    const countByBranch = await this.getActiveEmployeesCountByBranch(
      branchOffices.map((branch) => branch.branchOfficeId)
    )
    const openApplicationByBranch = await this.getOpenApplicationByBranch(
      branchOffices.map((branch) => branch.branchOfficeId)
    )

    return branchOffices.map((branch) => {
      const activeEmployees = countByBranch.get(branch.branchOfficeId) ?? 0
      const openApplicationId = openApplicationByBranch.get(branch.branchOfficeId) ?? null
      return this.buildApplicabilityItem(
        branch.branchOfficeId,
        branch.branchOfficeName,
        activeEmployees,
        openApplicationId,
        i18n
      )
    })
  }

  static async getByBranchOffice(
    branchOfficeId: number,
    i18n: I18n
  ): Promise<QuestionnaireApplicabilityItem> {
    const branchOffice = await BranchOffice.query()
      .where('branchOfficeId', branchOfficeId)
      .whereNull('branch_office_deleted_at')
      .first()

    if (!branchOffice) {
      throw new QuestionnaireApplicabilityServiceError(
        i18n.formatMessage('nom035.questionnaire_applicability.branch_not_found'),
        QUESTIONNAIRE_APPLICABILITY_ERROR_CODES.NOT_FOUND_BRANCH,
        404
      )
    }

    const countByBranch = await this.getActiveEmployeesCountByBranch([branchOffice.branchOfficeId])
    const activeEmployees = countByBranch.get(branchOffice.branchOfficeId) ?? 0
    const openApplicationByBranch = await this.getOpenApplicationByBranch([branchOffice.branchOfficeId])
    const openApplicationId = openApplicationByBranch.get(branchOffice.branchOfficeId) ?? null

    return this.buildApplicabilityItem(
      branchOffice.branchOfficeId,
      branchOffice.branchOfficeName,
      activeEmployees,
      openApplicationId,
      i18n
    )
  }
}
