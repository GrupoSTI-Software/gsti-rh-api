import type { AttentionProgramStatus } from '#models/attention_program'

export interface AttentionProgramListFilters {
  status?: AttentionProgramStatus
  page?: number
  limit?: number
}

export interface AttentionProgramCreateInput {
  year: number
  period?: string
  questionnaireApplicationId?: number
}

export interface AttentionProgramUpdateInput {
  period?: string
  status?: Extract<AttentionProgramStatus, 'borrador' | 'vigente'>
}

export interface AttentionProgramCatalogDimensionItem {
  psychosocialDimensionId: number
  code: string
  nameKey: string
  name: string
  ord: number
}

export interface AttentionProgramCatalogLevelItem {
  attentionActionLevelId: number
  code: string
  nameKey: string
  name: string
  order: number
}

export interface AttentionProgramCatalogResult {
  dimensions: AttentionProgramCatalogDimensionItem[]
  actionLevels: AttentionProgramCatalogLevelItem[]
}

export interface AttentionProgramListItem {
  attentionProgramId: number
  businessUnitId: number
  regulationId: number
  questionnaireApplicationId: number | null
  originApplication: AttentionProgramOriginApplicationItem | null
  year: number
  period: string | null
  status: AttentionProgramStatus
  actionCount: number
  createdAt: string
  updatedAt: string
}

export interface AttentionProgramOriginApplicationItem {
  questionnaireApplicationId: number
  folio: string
  branchOfficeName: string | null
  status: 'borrador' | 'en-curso' | 'cerrada'
  year: number
  period: string | null
}

export interface AttentionProgramListResult {
  meta: Record<string, unknown>
  data: AttentionProgramListItem[]
}
