import { BaseSeeder } from '@adonisjs/lucid/seeders'
import User from '../../app/models/user.js'

export default class extends BaseSeeder {
  async run() {
    const users = [
      {
        userEmail: 'desarrollo-software@gruposti.com',
        userId: 100,
        userPassword: 'GrupoSTI',
        userActive: 1,
        personId: 1,
        roleId: 3,
        userBusinessAccess: 'gsti-rh',
      }
    ]

    for (const user of users) {
      const { userEmail, ...userData } = user
      await User.firstOrCreate({ userEmail }, userData)
    }
  }
}
