import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Person from '../../app/models/person.js'
import { TenantContext } from '#utils/tenant_context'
import { TENANT_UNSCOPED_REASON } from '#constants/tenant_unscoped_reason'

export default class extends BaseSeeder {
  async run() {
    await TenantContext.runUnscoped(
      async () => {
        await this.seedPersons()
      },
      TENANT_UNSCOPED_REASON.SEEDER,
      '0007_person_seeder'
    )
  }

  private async seedPersons() {
    const persons = [
      {
        personId: 1,
        personFirstname: 'GrupoSTI',
        personLastname: '',
        personSecondLastname: '',
        personEmail: 'desarrollo-software@gruposti.com',
      }
    ]

    for (const person of persons) {
      const { personId, ...personData } = person
      await Person.firstOrCreate({ personId }, personData)
    }
  }
}
