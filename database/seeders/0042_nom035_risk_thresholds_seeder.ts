import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import RegulationQuestionnaire from '#models/regulation_questionnaire'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

type RiskLevel = 'nulo' | 'bajo' | 'medio' | 'alto' | 'muy_alto'

type ThresholdTarget = {
  scope: 'overall' | 'category' | 'domain'
  targetCode: string | null
}

/**
 * PENDIENTE confirmación STPS:
 * - Rangos min/max definitivos.
 * - Fórmula exacta de agregación para clasificación final.
 * CA-2 queda en rojo hasta validar contra DOF.
 */
export default class extends BaseSeeder {
  async run() {
    const questionnaire = await RegulationQuestionnaire.findByOrFail(
      'regulationQuestionnaireCode',
      'GUIA-III-NOM035'
    )

    const now = DateTime.utc().toSQL({ includeOffset: false })!
    const levels: Array<{ level: RiskLevel; ord: number }> = [
      { level: 'nulo', ord: 1 },
      { level: 'bajo', ord: 2 },
      { level: 'medio', ord: 3 },
      { level: 'alto', ord: 4 },
      { level: 'muy_alto', ord: 5 },
    ]

    const categoryRows = await db
      .from('regulation_questionnaire_sections')
      .where('regulation_questionnaire_id', questionnaire.regulationQuestionnaireId)
      .select('regulation_questionnaire_section_code')

    const domainRows = await db
      .from('risk_domains')
      .where('regulation_questionnaire_id', questionnaire.regulationQuestionnaireId)
      .select('risk_domain_code')

    const targets: ThresholdTarget[] = [
      { scope: 'overall', targetCode: null },
      ...categoryRows.map((row) => ({
        scope: 'category' as const,
        targetCode: String(row.regulation_questionnaire_section_code),
      })),
      ...domainRows.map((row) => ({
        scope: 'domain' as const,
        targetCode: String(row.risk_domain_code),
      })),
    ]

    await db.transaction(async (trx) => {
      await trx
        .from('risk_thresholds')
        .where('regulation_questionnaire_id', questionnaire.regulationQuestionnaireId)
        .delete()

      const rowsToInsert = targets.flatMap((target) =>
        levels.map((level) => ({
          regulation_questionnaire_id: questionnaire.regulationQuestionnaireId,
          risk_threshold_scope: target.scope,
          risk_threshold_target_code: target.targetCode,
          risk_threshold_level: level.level,
          risk_threshold_min: 0,
          risk_threshold_max: 0,
          risk_threshold_ord: level.ord,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        }))
      )

      if (rowsToInsert.length > 0) {
        await trx.table('risk_thresholds').insert(rowsToInsert)
      }
    })

    const insertedRows = await db
      .from('risk_thresholds')
      .where('regulation_questionnaire_id', questionnaire.regulationQuestionnaireId)
      .select(
        'risk_threshold_scope as scope',
        'risk_threshold_target_code as targetCode',
        'risk_threshold_level as level',
        'risk_threshold_ord as ord'
      )

    const buckets = new Map<string, Array<{ level: string; ord: number }>>()
    for (const row of insertedRows) {
      const key = `${row.scope}:${row.targetCode ?? '_OVERALL_'}`
      if (!buckets.has(key)) {
        buckets.set(key, [])
      }

      buckets.get(key)!.push({
        level: String(row.level),
        ord: Number(row.ord),
      })
    }

    for (const [bucket, values] of buckets.entries()) {
      if (values.length !== 5) {
        throw new Error(`Configuración inválida de umbrales para ${bucket}: se esperaban 5 niveles`)
      }

      const ords = values
        .map((value) => value.ord)
        .sort((a, b) => a - b)
        .join(',')
      if (ords !== '1,2,3,4,5') {
        throw new Error(`Configuración inválida de ord para ${bucket}: ${ords}`)
      }
    }
  }
}
