import { test } from '@japa/runner'
import Person from '#models/person'
import { blindIndex, blindIndexOrNull } from '#utils/blind_index'

/**
 * USRH1789698261610 regla 7 — vaciar el campo libera la huella.
 * Antes: `calculateIdentifierHashes` solo ponía huellas; un RFC vaciado
 * conservaba la anterior y bloqueaba su reúso sin que nada lo mostrara.
 */

test.group('blindIndexOrNull — puro, sin BD', () => {
  test('nulo, indefinido, vacío y espacios devuelven NULL', ({ assert }) => {
    assert.isNull(blindIndexOrNull(null))
    assert.isNull(blindIndexOrNull(undefined))
    assert.isNull(blindIndexOrNull(''))
    assert.isNull(blindIndexOrNull('   '))
  })

  test('un valor devuelve su huella y es insensible a caja y espacios', ({ assert }) => {
    assert.equal(blindIndexOrNull('gode800101hdf'), blindIndex('GODE800101HDF'))
    assert.equal(blindIndexOrNull('  GODE800101HDF  '), blindIndex('GODE800101HDF'))
  })
})

test.group('Person.calculateIdentifierHashes — puro, sin BD', () => {
  test('pone huellas con valor y las quita al vaciar', ({ assert }) => {
    const person = new Person()
    person.personRfc = 'GODE800101HDF'
    person.personCurp = null
    Person.calculateIdentifierHashes(person)
    assert.equal(person.personRfcHash, blindIndex('GODE800101HDF'))
    assert.isNull(person.personCurpHash)

    person.personRfc = ''
    Person.calculateIdentifierHashes(person)
    assert.isNull(person.personRfcHash)
  })
})

test.group('Person — vaciado real contra BD', (group) => {
  const personIds: number[] = []

  group.teardown(async () => {
    if (personIds.length > 0) {
      await Person.query().whereIn('person_id', personIds).delete()
    }
  })

  test('guardar con RFC vacío deja la huella en NULL', async ({ assert }) => {
    const person = await Person.create({
      personFirstname: 'Hash',
      personLastname: 'Libera',
      personSecondLastname: 'Spec',
      personRfc: 'HASHLIBERA01',
    })
    personIds.push(person.personId)
    assert.equal(person.personRfcHash, blindIndex('HASHLIBERA01'))

    person.personRfc = ''
    await person.save()
    const reloaded = await Person.query().where('person_id', person.personId).firstOrFail()
    assert.isNull(reloaded.personRfcHash)
  })
})
