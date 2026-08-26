import { test } from '@japa/runner'
import Person from '#models/person'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'
import type { LegalCategory } from '#constants/sensitive_fields'
import type { SensitiveWriteDecision } from '#utils/sensitive_access_context'
import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'

const deniedRead: Record<LegalCategory, boolean> = {
  identificacion: false,
  contacto: false,
  financiero: false,
  salud: false,
  biometrico: false,
}

const deniedWrite: Record<LegalCategory, SensitiveWriteDecision> = {
  identificacion: 'denied',
  contacto: 'denied',
  financiero: 'denied',
  salud: 'denied',
  biometrico: 'denied',
}

test.group('withSensitiveWriteGuard — cableado real sobre Person.save()', (group) => {
  let person: Person

  group.setup(async () => {
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 100_000)}`
    person = await Person.create({
      personFirstname: 'Cableado',
      personLastname: 'Guardia',
      personSecondLastname: 'Test',
      personEmail: `guardia-${stamp}@gsti-tests.local`,
    })
  })

  group.teardown(async () => {
    await Person.query().where('person_id', person.personId).delete()
  })

  test('cambiar personRfc sin permiso identificación lanza y no persiste', async ({ assert }) => {
    const stamp = `${Date.now()}`.slice(-6)
    await SensitiveAccessContext.run({ read: deniedRead, write: deniedWrite }, async () => {
      person.personRfc = `VARL8506${stamp}`
      let thrown: unknown
      try {
        await person.save()
      } catch (error) {
        thrown = error
      }
      assert.instanceOf(thrown, SensitiveDataWriteError)
      const denied = thrown as SensitiveDataWriteError
      assert.equal(denied.errorCode, SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN)
      assert.equal(denied.category, 'identificacion')
    })

    const reloaded = await Person.findOrFail(person.personId)
    assert.isNull(reloaded.personRfc)
  })

  test('cambiar personRfc con permiso identificación guarda de verdad', async ({ assert }) => {
    const stamp = `${Date.now()}`.slice(-6)
    await SensitiveAccessContext.run(
      { read: deniedRead, write: { ...deniedWrite, identificacion: 'allowed' } },
      async () => {
        person.personRfc = `GOMC8803${stamp}`
        await person.save()
      }
    )

    const reloaded = await Person.findOrFail(person.personId)
    assert.equal(reloaded.personRfc, `GOMC8803${stamp}`)
  })

  test('guardar sin ninguna columna sensible dirty nunca exige permiso', async ({ assert }) => {
    await SensitiveAccessContext.run({ read: deniedRead, write: deniedWrite }, async () => {
      person.personLastname = 'GuardiaActualizada'
      await person.save()
    })

    const reloaded = await Person.findOrFail(person.personId)
    assert.equal(reloaded.personLastname, 'GuardiaActualizada')
  })
})
