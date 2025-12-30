import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Role from '../../app/models/role.js'

export default class extends BaseSeeder {

  async run() {
    const roles = [
      {
        roleId: 1,
        roleName: 'Super Administrador',
        roleSlug: 'super-administrador',
        roleDescription: 'Administrador',
        roleActive: 1,
        roleBusinessAccess: 'gsti-rh'
      },
      {
        roleId: 2,
        roleName: 'Recursos Humanos',
        roleSlug: 'rh-manager',
        roleDescription: 'Recursos Humanos Manager',
        roleActive: 1,
        roleBusinessAccess: 'gsti-rh'
      },
      {
        roleId: 3,
        roleName: 'Root',
        roleSlug: 'root',
        roleDescription: 'Root',
        roleActive: 1,
        roleBusinessAccess: 'gsti-rh'
      }
    ]

    for (const role of roles) {
      const { roleId, ...roleData } = role
      await Role.firstOrCreate({ roleId }, roleData)
    }
  }
}
