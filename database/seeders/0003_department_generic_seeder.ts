import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Department from '#models/department'
import { DateTime } from 'luxon'

export default class extends BaseSeeder {
  async run() {
    const departments = [
      {
        departmentId: 999,
        departmentSyncId: DateTime.now().toMillis(),
        departmentCode: 'SIN-DEPTO',
        departmentName: 'Sin Departamento',
        departmentAlias: 'Sin Departamento',
        departmentIsDefault: true,
        departmentActive: 1,
      },
      {
        departmentId: 1000,
        departmentSyncId: DateTime.now().toMillis(),
        departmentCode: DateTime.now().toMillis().toString(),
        departmentName: 'Dirección General',
        departmentAlias: 'Dirección General',
        departmentIsDefault: false,
        departmentActive: 1,
      }
    ]

    for (const department of departments) {
      const { departmentId, ...departmentData } = department
      await Department.firstOrCreate({ departmentId }, departmentData)
    }
  }
}
