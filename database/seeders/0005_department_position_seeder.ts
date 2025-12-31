import { BaseSeeder } from '@adonisjs/lucid/seeders'
import DepartmentPosition from '../../app/models/department_position.js'

export default class extends BaseSeeder {
  async run() {
    const departmentPositions = [
      {
        departmentId: 999,
        positionId: 999,
      },
    ]

    for (const departmentPosition of departmentPositions) {
      const { departmentId, ...departmentPositionData } = departmentPosition
      await DepartmentPosition.firstOrCreate({ departmentId }, departmentPositionData)
    }
  }
}
