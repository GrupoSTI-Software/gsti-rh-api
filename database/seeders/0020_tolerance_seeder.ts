import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Tolerance from '../../app/models/tolerance.js'

export default class extends BaseSeeder {
  async run() {
    const tolerances = [
      {
        toleranceName: 'Delay', // Tolerancia de retraso
        toleranceMinutes: 10, // 10 minutos para considerar azul
        systemSettingId: 1,
      },
      {
        toleranceName: 'Fault', // Tolerancia de falta
        toleranceMinutes: 30, // 30 minutos para considerar rojo
        systemSettingId: 1,
      },
      {
        toleranceName: 'TardinessTolerance',
        toleranceMinutes: 3,
        systemSettingId: 1,
      },
    ]

    for (const tolerance of tolerances) {
      const { toleranceName, ...toleranceData } = tolerance
      await Tolerance.firstOrCreate({ toleranceName }, toleranceData)
    }
  }
}
