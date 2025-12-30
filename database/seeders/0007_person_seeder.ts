import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Person from '../../app/models/person.js'

export default class extends BaseSeeder {
  async run() {
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
