import type {
  QuestionnaireApplicationInstrument,
  QuestionnaireApplicationStatus,
} from '#models/questionnaire_application'
import type { QuestionnaireApplicationTargetStatus } from '#models/questionnaire_application_target'
import type { QuestionnaireApplicationResponseStatus } from '#models/questionnaire_application_response'

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

export interface QuestionnaireApplicationTargetListFilters {
  status?: QuestionnaireApplicationTargetStatus
  search?: string
}

export type QuestionnaireApplicationCaptureStatus = 'pendiente' | 'borrador' | 'respondido'

export interface QuestionnaireApplicationTargetListItem {
  questionnaireApplicationTargetId: number
  employeeId: number
  employeeCode: number | string
  employeePayrollNum: string
  employeeFullName: string
  departmentName: string | null
  positionName: string | null
  branchOfficeName: string
  status: QuestionnaireApplicationTargetStatus
  captureStatus: QuestionnaireApplicationCaptureStatus
  respondedAt: string | null
}

export interface AnswerInput {
  questionId: number
  optionKey: string
}

export interface SubmitAnswersInput {
  answers: AnswerInput[]
}

export interface SaveDraftInput {
  answers: AnswerInput[]
}

export interface InstrumentForCaptureQuestionOption {
  key: string
  value: number
}

export interface InstrumentForCaptureQuestion {
  questionId: number
  textKey: string
  helpKey: string | null
  answerScale: {
    code: string
    options: InstrumentForCaptureQuestionOption[]
  }
}

export interface InstrumentForCaptureSection {
  titleKey: string
  ord: number
  questions: InstrumentForCaptureQuestion[]
}

export interface InstrumentForCapture {
  questionnaireApplicationId: number
  employeeId: number
  instrument: QuestionnaireApplicationInstrument
  sections: InstrumentForCaptureSection[]
}

export interface SubmitAnswersResult {
  questionnaireApplicationResponseId: number
  employeeId: number
  answeredCount: number
  targetStatus: QuestionnaireApplicationTargetStatus
  respondedAt: string
}

export interface SaveDraftResult {
  questionnaireApplicationResponseId: number
  status: QuestionnaireApplicationResponseStatus
  answeredCount: number
}

export interface GetResponseResult {
  questionnaireApplicationResponseId: number
  status: QuestionnaireApplicationResponseStatus
  answers: Array<{
    questionId: number
    optionKey: string
    value: number
  }>
}
