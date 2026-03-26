import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Weight from '#models/weight'

export default class extends BaseSeeder {
  async run() {
    const weights = [
      {
        weightId: 1,
        weightName: 'No lo tiene',
        weightValue: 0,
      },
      {
        weightId: 2,
        weightName: 'En desarrollo',
        weightValue: 1,
      },
      {
        weightId: 3,
        weightName: 'Lo tiene',
        weightValue: 2,
      },
      {
        weightId: 4,
        weightName: 'Experto',
        weightValue: 3,
      },
      {
        weightId: 999,
        weightName: 'Sin especificar',
        weightValue: 999,
      },
    ]

    for (const weight of weights) {
      const { weightId, ...weightData } = weight
      await Weight.firstOrCreate({ weightId }, weightData)
    }
  }
}

