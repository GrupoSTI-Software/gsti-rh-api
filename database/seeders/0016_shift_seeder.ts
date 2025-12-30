import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Shift from '../../app/models/shift.js'

export default class extends BaseSeeder {
  async run() {
    const shifts = [
      {
        shiftId: 1,
        shiftName: '00:00 to 00:00 - Rest (NA)',
        shiftDayStart: 1,
        shiftTimeStart: '00:00',
        shiftActiveHours: 24,
        shiftRestDays: '0',
        shiftAccumulatedFault: 1,
        shiftBusinessUnits: 'gsti-rh',
        shiftTemp: 0
      }
    ]

    for (const shift of shifts) {
      const { shiftId, ...shiftData } = shift
      await Shift.firstOrCreate({ shiftId }, shiftData)
    }
  }
}
