import { DateTime } from 'luxon'
import type { I18n } from '@adonisjs/i18n'
import db from '@adonisjs/lucid/services/db'
import {
  ATTENTION_PROGRAM_ERROR_CODES,
} from '#constants/attention_program_error_codes'
import {
  ATTENTION_PROGRAM_OPEN_STATUSES,
  ATTENTION_PROGRAM_REGULATION_CODE,
  ATTENTION_PROGRAM_REGULATION_VERSION,
} from '#constants/attention_program'
import { AttentionProgramServiceError } from '#exceptions/attention_program_service_error'
import type {
  AttentionProgramCatalogResult,
  AttentionProgramCreateInput,
  AttentionProgramListFilters,
  AttentionProgramListItem,
  AttentionProgramListResult,
  AttentionProgramOriginApplicationItem,
  AttentionProgramUpdateInput,
} from '../interfaces/attention_program_interface.js'

type AttentionProgramRow = {
  attentionProgramId: number | string
  businessUnitId: number | string
  regulationId: number | string
  questionnaireApplicationId: number | string | null
  originFolio: string | null
  originBranchOfficeName: string | null
  originStatus: 'borrador' | 'en-curso' | 'cerrada' | null
  originDeletedAt: string | Date | null
  originBranchDeletedAt: string | Date | null
  year: number | string
  period: string | null
  status: 'borrador' | 'vigente' | 'cerrado'
  actionCount: number | string
  createdAt: string | Date | null
  updatedAt: string | Date | null
}

export default class AttentionProgramService {
  async getCatalog(i18n?: I18n): Promise<AttentionProgramCatalogResult> {
    const regulationId = await this.getNom035RegulationId(i18n)

    const dimensions = await db
      .from('psychosocial_dimensions')
      .where('regulation_id', regulationId)
      .whereNull('psychosocial_dimension_deleted_at')
      .orderBy('psychosocial_dimension_ord', 'asc')
      .select(
        'psychosocial_dimension_id as psychosocialDimensionId',
        'psychosocial_dimension_code as code',
        'psychosocial_dimension_name_key as nameKey',
        'psychosocial_dimension_ord as ord'
      )

    const actionLevels = await db
      .from('attention_action_levels')
      .where('regulation_id', regulationId)
      .whereNull('attention_action_level_deleted_at')
      .orderBy('attention_action_level_order', 'asc')
      .select(
        'attention_action_level_id as attentionActionLevelId',
        'attention_action_level_code as code',
        'attention_action_level_name_key as nameKey',
        'attention_action_level_order as order'
      )

    return {
      dimensions: dimensions.map((row) => ({
        psychosocialDimensionId: Number(row.psychosocialDimensionId),
        code: String(row.code),
        nameKey: String(row.nameKey),
        name: this.translate(i18n, String(row.nameKey), String(row.nameKey)),
        ord: Number(row.ord),
      })),
      actionLevels: actionLevels.map((row) => ({
        attentionActionLevelId: Number(row.attentionActionLevelId),
        code: String(row.code),
        nameKey: String(row.nameKey),
        name: this.translate(i18n, String(row.nameKey), String(row.nameKey)),
        order: Number(row.order),
      })),
    }
  }

  async listPaginated(
    filters: AttentionProgramListFilters,
    allowedBusinessUnitIds: number[] = []
  ): Promise<AttentionProgramListResult> {
    const safePage = Math.max(filters.page ?? 1, 1)
    const safeLimit = Math.min(Math.max(filters.limit ?? 20, 1), 100)
    const offset = (safePage - 1) * safeLimit

    const aggregateQuery = this.baseListQuery(allowedBusinessUnitIds, filters)
    const totalRow = await db.from(aggregateQuery.clone().as('ap_aggregate')).count('* as total').first()
    const total = Number((totalRow as { total?: string | number } | undefined)?.total ?? 0)
    const lastPage = Math.max(Math.ceil(total / safeLimit), 1)

    const rows = (await aggregateQuery
      .clone()
      .orderBy('ap.attention_program_created_at', 'desc')
      .limit(safeLimit)
      .offset(offset)) as AttentionProgramRow[]

    return {
      meta: {
        total,
        perPage: safeLimit,
        currentPage: safePage,
        lastPage,
        firstPage: 1,
      },
      data: rows.map((row) => this.serializeRow(row)),
    }
  }

  async store(
    input: AttentionProgramCreateInput,
    businessUnitId: number,
    allowedBusinessUnitIds: number[] = [],
    i18n?: I18n
  ): Promise<AttentionProgramListItem> {
    if (!allowedBusinessUnitIds.includes(businessUnitId)) {
      throw new AttentionProgramServiceError(
        this.translate(
          i18n,
          'nom035.attention_program.not_found_program',
          'Programa de atención no encontrado o fuera del alcance del usuario'
        ),
        ATTENTION_PROGRAM_ERROR_CODES.NOT_FOUND_PROGRAM,
        404,
        'programa-no-encontrado'
      )
    }

    if (input.questionnaireApplicationId) {
      await this.findOriginInScopeOrFail(input.questionnaireApplicationId, allowedBusinessUnitIds, i18n)
    }

    const openProgram = await db
      .from('attention_programs')
      .where('business_unit_id', businessUnitId)
      .whereIn('attention_program_status', [...ATTENTION_PROGRAM_OPEN_STATUSES])
      .whereNull('attention_program_deleted_at')
      .first()

    if (openProgram) {
      throw new AttentionProgramServiceError(
        this.translate(
          i18n,
          'nom035.attention_program.already_open',
          'Ya existe un Programa abierto para la empresa'
        ),
        ATTENTION_PROGRAM_ERROR_CODES.ALREADY_OPEN,
        409,
        'programa-abierto'
      )
    }

    const regulationId = await this.getNom035RegulationId(i18n)
    const now = DateTime.utc().toSQL({ includeOffset: false })!

    const [attentionProgramId] = await db.transaction(async (trx) => {
      const result = await trx.table('attention_programs').insert({
        business_unit_id: businessUnitId,
        regulation_id: regulationId,
        questionnaire_application_id: input.questionnaireApplicationId ?? null,
        attention_program_year: input.year,
        attention_program_period: input.period?.trim() ?? null,
        attention_program_status: 'borrador',
        attention_program_created_at: now,
        attention_program_updated_at: now,
        attention_program_deleted_at: null,
      })

      return [Number(result[0])]
    })

    return this.getById(Number(attentionProgramId), allowedBusinessUnitIds, i18n)
  }

  async getById(
    attentionProgramId: number,
    allowedBusinessUnitIds: number[] = [],
    i18n?: I18n
  ): Promise<AttentionProgramListItem> {
    const row = (await this.baseListQuery(allowedBusinessUnitIds, {})
      .clone()
      .where('ap.attention_program_id', attentionProgramId)
      .first()) as AttentionProgramRow | null

    if (!row) {
      throw new AttentionProgramServiceError(
        this.translate(
          i18n,
          'nom035.attention_program.not_found_program',
          'Programa de atención no encontrado o fuera del alcance del usuario'
        ),
        ATTENTION_PROGRAM_ERROR_CODES.NOT_FOUND_PROGRAM,
        404,
        'programa-no-encontrado'
      )
    }

    return this.serializeRow(row)
  }

  async update(
    attentionProgramId: number,
    input: AttentionProgramUpdateInput,
    allowedBusinessUnitIds: number[] = [],
    i18n?: I18n
  ): Promise<AttentionProgramListItem> {
    const found = await this.getById(attentionProgramId, allowedBusinessUnitIds, i18n)
    const now = DateTime.utc().toSQL({ includeOffset: false })!

    await db
      .from('attention_programs')
      .where('attention_program_id', found.attentionProgramId)
      .update({
        attention_program_period:
          input.period === undefined ? found.period : (input.period?.trim() ?? null),
        attention_program_status: input.status ?? found.status,
        attention_program_updated_at: now,
      })

    return this.getById(found.attentionProgramId, allowedBusinessUnitIds, i18n)
  }

  private baseListQuery(allowedBusinessUnitIds: number[], filters: AttentionProgramListFilters) {
    return db
      .from('attention_programs as ap')
      .leftJoin(
        'questionnaire_applications as qa',
        'qa.questionnaire_application_id',
        'ap.questionnaire_application_id'
      )
      .leftJoin('branch_offices as bo', 'bo.branch_office_id', 'qa.branch_office_id')
      .whereNull('ap.attention_program_deleted_at')
      .if(allowedBusinessUnitIds.length > 0, (query) => {
        query.whereIn('ap.business_unit_id', allowedBusinessUnitIds)
      })
      .if(allowedBusinessUnitIds.length === 0, (query) => {
        query.whereRaw('1 = 0')
      })
      .if(!!filters.status, (query) => {
        query.where('ap.attention_program_status', filters.status!)
      })
      .select(
        'ap.attention_program_id as attentionProgramId',
        'ap.business_unit_id as businessUnitId',
        'ap.regulation_id as regulationId',
        'ap.questionnaire_application_id as questionnaireApplicationId',
        'qa.questionnaire_application_folio as originFolio',
        'qa.questionnaire_application_status as originStatus',
        'qa.questionnaire_application_deleted_at as originDeletedAt',
        'bo.branch_office_name as originBranchOfficeName',
        'bo.branch_office_deleted_at as originBranchDeletedAt',
        'ap.attention_program_year as year',
        'ap.attention_program_period as period',
        'ap.attention_program_status as status',
        db.raw(`(
          SELECT COUNT(*)
          FROM attention_program_actions AS apa
          WHERE apa.attention_program_id = ap.attention_program_id
            AND apa.attention_program_action_deleted_at IS NULL
        ) as actionCount`),
        'ap.attention_program_created_at as createdAt',
        'ap.attention_program_updated_at as updatedAt'
      )
  }

  private serializeRow(row: AttentionProgramRow): AttentionProgramListItem {
    return {
      attentionProgramId: Number(row.attentionProgramId),
      businessUnitId: Number(row.businessUnitId),
      regulationId: Number(row.regulationId),
      questionnaireApplicationId: row.questionnaireApplicationId
        ? Number(row.questionnaireApplicationId)
        : null,
      originApplication: this.serializeOrigin(row),
      year: Number(row.year),
      period: row.period,
      status: row.status,
      actionCount: Number(row.actionCount ?? 0),
      createdAt: this.toIsoUtc(row.createdAt) ?? DateTime.utc().toISO()!,
      updatedAt: this.toIsoUtc(row.updatedAt) ?? DateTime.utc().toISO()!,
    }
  }

  private serializeOrigin(row: AttentionProgramRow): AttentionProgramOriginApplicationItem | null {
    if (!row.questionnaireApplicationId) return null
    if (row.originDeletedAt || row.originBranchDeletedAt) return null
    if (!row.originFolio || !row.originStatus) return null

    return {
      questionnaireApplicationId: Number(row.questionnaireApplicationId),
      folio: String(row.originFolio),
      branchOfficeName: row.originBranchOfficeName ? String(row.originBranchOfficeName) : null,
      status: row.originStatus,
      year: Number(row.year),
      period: row.period,
    }
  }

  private async getNom035RegulationId(i18n?: I18n): Promise<number> {
    const row = await db
      .from('regulations')
      .where('regulation_code', ATTENTION_PROGRAM_REGULATION_CODE)
      .where('regulation_version', ATTENTION_PROGRAM_REGULATION_VERSION)
      .whereNull('deleted_at')
      .select('regulation_id')
      .first()

    if (!row) {
      throw new AttentionProgramServiceError(
        this.translate(
          i18n,
          'an_unexpected_error_has_occurred_on_the_server',
          'No se encontró el catálogo regulatorio NOM-035'
        ),
        ATTENTION_PROGRAM_ERROR_CODES.SYS_UNHANDLED,
        500,
        'catalogo-regulatorio-inexistente'
      )
    }

    return Number(row.regulation_id)
  }

  private async findOriginInScopeOrFail(
    questionnaireApplicationId: number,
    allowedBusinessUnitIds: number[],
    i18n?: I18n
  ) {
    const found = await db
      .from('questionnaire_applications')
      .where('questionnaire_application_id', questionnaireApplicationId)
      .whereNull('questionnaire_application_deleted_at')
      .if(allowedBusinessUnitIds.length > 0, (query) => {
        query.whereIn('business_unit_id', allowedBusinessUnitIds)
      })
      .if(allowedBusinessUnitIds.length === 0, (query) => {
        query.whereRaw('1 = 0')
      })
      .first()

    if (!found) {
      throw new AttentionProgramServiceError(
        this.translate(
          i18n,
          'nom035.attention_program.not_found_origin',
          'La evaluación de origen no existe o está fuera del alcance del usuario'
        ),
        ATTENTION_PROGRAM_ERROR_CODES.NOT_FOUND_ORIGIN,
        404,
        'origen-no-encontrado'
      )
    }
  }

  private toIsoUtc(value: string | Date | null): string | null {
    if (!value) return null
    if (value instanceof Date) return DateTime.fromJSDate(value, { zone: 'utc' }).toISO()
    const sqlDate = DateTime.fromSQL(value, { zone: 'utc' })
    if (sqlDate.isValid) return sqlDate.toISO()
    const isoDate = DateTime.fromISO(value, { zone: 'utc' })
    if (isoDate.isValid) return isoDate.toISO()
    return null
  }

  private translate(i18n: I18n | undefined, key: string, fallback: string): string {
    if (!i18n) return fallback
    const translated = i18n.formatMessage(key)
    return translated === key ? fallback : translated
  }
}
