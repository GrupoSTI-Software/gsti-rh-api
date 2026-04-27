import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Competency from '#models/competency'

export default class extends BaseSeeder {
  async run() {
    const competencies: Array<{
      competencyId: number
      competencyName: string
      competencyType: 'technical' | 'transversal'
    }> = [
      { competencyId: 1, competencyName: 'Escritura', competencyType: 'transversal' },
      { competencyId: 2, competencyName: 'Presentacion', competencyType: 'transversal' },
      { competencyId: 3, competencyName: 'Negociacion', competencyType: 'transversal' },
      { competencyId: 4, competencyName: 'Investigacion', competencyType: 'transversal' },
      { competencyId: 5, competencyName: 'Facilitacion', competencyType: 'transversal' },
      { competencyId: 6, competencyName: 'Tutoria', competencyType: 'transversal' },
    ]

    for (const competency of competencies) {
      const { competencyId, ...competencyData } = competency
      await Competency.firstOrCreate({ competencyId }, competencyData)
    }
  }
}
