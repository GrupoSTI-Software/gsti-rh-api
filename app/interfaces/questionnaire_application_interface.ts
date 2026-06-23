import type {
  QuestionnaireApplicationInstrument,
  QuestionnaireApplicationStatus,
} from '#models/questionnaire_application'
import type { QuestionnaireApplicationTargetStatus } from '#models/questionnaire_application_target'

export interface CreateQuestionnaireApplicationInput {
  branchOfficeId: number
}

export interface QuestionnaireApplicationListFilters {
  branchOfficeId?: number
  status?: QuestionnaireApplicationStatus
  page?: number
  limit?: number
}

export interface QuestionnaireApplicationListItem {
  questionnaireApplicationId: number
  folio: string
  branchOfficeId: number
  branchOfficeName: string
  applicableInstrument: QuestionnaireApplicationInstrument
  status: QuestionnaireApplicationStatus
  targetCount: number
  respondedCount: number
  launchedAt: string
}

export interface QuestionnaireApplicationDetailResult {
  questionnaireApplicationId: number
  folio: string
  branchOfficeId: number
  branchOfficeName: string
  businessUnitId: number
  regulationQuestionnaireId: number
  applicableInstrument: QuestionnaireApplicationInstrument
  status: QuestionnaireApplicationStatus
  targetCount: number
  respondedCount: number
  launchedAt: string
  closedAt: string | null
}

export interface QuestionnaireApplicationStoreResult extends QuestionnaireApplicationDetailResult {}

export interface QuestionnaireApplicationListResult {
  meta: Record<string, unknown>
  data: QuestionnaireApplicationListItem[]
}

export interface QuestionnaireApplicationTargetRow {
  questionnaireApplicationTargetId: number
  questionnaireApplicationId: number
  employeeId: number
  status: QuestionnaireApplicationTargetStatus
  respondedAt: string | null
}
