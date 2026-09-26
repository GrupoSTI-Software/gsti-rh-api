import { BaseSeeder } from '@adonisjs/lucid/seeders'
import db from '@adonisjs/lucid/services/db'
import AttentionActionLevel from '#models/attention_action_level'

type AttentionActionLevelSeed = {
  code: string
  nameKey: string
  order: number
}

export default class extends BaseSeeder {
  private readonly levels: AttentionActionLevelSeed[] = [
    {
      code: 'organizacional',
      nameKey: 'regulatory.nom035.action_level.organizacional',
      order: 1,
    },
    { code: 'grupal', nameKey: 'regulatory.nom035.action_level.grupal', order: 2 },
    { code: 'individual', nameKey: 'regulatory.nom035.action_level.individual', order: 3 },
  ]

  async run() {
    const regulation = await db
      .from('regulations')
      .where('regulation_code', 'NOM-035-STPS')
      .where('regulation_version', '2018')
      .whereNull('deleted_at')
      .select('regulation_id')
      .first()

    if (!regulation) {
      throw new Error('No se encontró la regulación NOM-035-STPS 2018 para sembrar niveles')
    }

    const clause = await db
      .from('regulation_clauses')
      .where('regulation_id', regulation.regulation_id)
      .where('regulation_clause_code', '8.5')
      .whereNull('deleted_at')
      .select('regulation_clause_id')
      .first()

    const regulationId = Number(regulation.regulation_id)
    const regulationClauseId = clause ? Number(clause.regulation_clause_id) : null

    for (const level of this.levels) {
      await AttentionActionLevel.updateOrCreate(
        { attentionActionLevelCode: level.code },
        {
          regulationId,
          regulationClauseId,
          attentionActionLevelCode: level.code,
          attentionActionLevelNameKey: level.nameKey,
          attentionActionLevelOrder: level.order,
          deletedAt: null,
        }
      )
    }
  }
}
