export type ApplicableInstrument = 'none' | 'guide_ii' | 'guide_iii'

export interface QuestionnaireApplicabilityItem {
  branchOfficeId: number
  branchOfficeName: string
  activeEmployees: number
  applicableInstrument: ApplicableInstrument
  note: string | null
}
