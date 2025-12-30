import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Position from '../../app/models/position.js'
import { DateTime } from 'luxon'

export default class extends BaseSeeder {
  async run() {
    const positions = [
      {
        positionId: 999,
        position_sync_id: DateTime.now().toMillis(),
        positionCode: 'SIN-POS',
        positionName: 'Sin posición',
        positionAlias: 'Sin posición',
        positionIsDefault: true,
        positionActive: 1,
        companyId: 1,
        businessUnitId: 1
      },
    ]

    for (const position of positions) {
      const { positionId, ...positionData } = position
      await Position.firstOrCreate({ positionId }, positionData)
    }
  }
}
