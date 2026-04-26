import { BaseSeeder } from '@adonisjs/lucid/seeders'
import CompetencyLevel from '#models/competency_level'

export default class extends BaseSeeder {
  async run() {
    const competencyLevels: Array<{
      competencyLevelId: number
      competencyLevelCode: string
      competencyLevelName: string
      competencyLevelOrder: number
    }> = [
      {
        competencyLevelId: 1,
        competencyLevelCode: 'in_development',
        competencyLevelName: 'En Desarrollo',
        competencyLevelOrder: 1,
      },
      {
        competencyLevelId: 2,
        competencyLevelCode: 'capable',
        competencyLevelName: 'Capaz',
        competencyLevelOrder: 2,
      },
      {
        competencyLevelId: 3,
        competencyLevelCode: 'expert',
        competencyLevelName: 'Experto',
        competencyLevelOrder: 3,
      },
    ]

    for (const competencyLevel of competencyLevels) {
      const { competencyLevelId, ...competencyLevelData } = competencyLevel
      await CompetencyLevel.updateOrCreate({ competencyLevelId }, competencyLevelData)
    }
  }
}
