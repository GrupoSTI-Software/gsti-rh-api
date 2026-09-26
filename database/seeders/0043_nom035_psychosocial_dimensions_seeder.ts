import { BaseSeeder } from '@adonisjs/lucid/seeders'
import db from '@adonisjs/lucid/services/db'
import PsychosocialDimension from '#models/psychosocial_dimension'

type PsychosocialDimensionSeed = {
  code: string
  nameKey: string
  ord: number
}

export default class extends BaseSeeder {
  private readonly dimensions: PsychosocialDimensionSeed[] = [
    {
      code: 'LIDERAZGO_RELACIONES',
      nameKey: 'regulatory.nom035.dimension.liderazgo_relaciones',
      ord: 1,
    },
    { code: 'CARGAS_TRABAJO', nameKey: 'regulatory.nom035.dimension.cargas_trabajo', ord: 2 },
    { code: 'CONTROL_TRABAJO', nameKey: 'regulatory.nom035.dimension.control_trabajo', ord: 3 },
    { code: 'APOYO_SOCIAL', nameKey: 'regulatory.nom035.dimension.apoyo_social', ord: 4 },
    { code: 'TRABAJO_FAMILIA', nameKey: 'regulatory.nom035.dimension.trabajo_familia', ord: 5 },
    { code: 'RECONOCIMIENTO', nameKey: 'regulatory.nom035.dimension.reconocimiento', ord: 6 },
    {
      code: 'PREVENCION_VIOLENCIA',
      nameKey: 'regulatory.nom035.dimension.prevencion_violencia',
      ord: 7,
    },
    { code: 'COMUNICACION', nameKey: 'regulatory.nom035.dimension.comunicacion', ord: 8 },
    { code: 'CAPACITACION', nameKey: 'regulatory.nom035.dimension.capacitacion', ord: 9 },
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
      throw new Error('No se encontró la regulación NOM-035-STPS 2018 para sembrar dimensiones')
    }

    const clause = await db
      .from('regulation_clauses')
      .where('regulation_id', regulation.regulation_id)
      .where('regulation_clause_code', '8.2')
      .whereNull('deleted_at')
      .select('regulation_clause_id')
      .first()

    const regulationId = Number(regulation.regulation_id)
    const regulationClauseId = clause ? Number(clause.regulation_clause_id) : null

    for (const dimension of this.dimensions) {
      await PsychosocialDimension.updateOrCreate(
        { psychosocialDimensionCode: dimension.code },
        {
          regulationId,
          regulationClauseId,
          psychosocialDimensionCode: dimension.code,
          psychosocialDimensionNameKey: dimension.nameKey,
          psychosocialDimensionOrd: dimension.ord,
          deletedAt: null,
        }
      )
    }
  }
}
