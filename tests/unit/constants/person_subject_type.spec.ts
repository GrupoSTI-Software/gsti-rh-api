import { test } from '@japa/runner'
import {
  PERSON_SUBJECT_TYPES,
  resolvePersonSubjectType,
  personSubjectRequiresCollaboratorWritePermission,
} from '#constants/person_subject_type'

test.group('resolvePersonSubjectType — fail-closed', () => {
  test('ausente, no-string, vacío o desconocido resuelve a collaborator', ({ assert }) => {
    assert.equal(resolvePersonSubjectType(undefined), 'collaborator')
    assert.equal(resolvePersonSubjectType(null), 'collaborator')
    assert.equal(resolvePersonSubjectType(1), 'collaborator')
    assert.equal(resolvePersonSubjectType(''), 'collaborator')
    assert.equal(resolvePersonSubjectType('   '), 'collaborator')
    assert.equal(resolvePersonSubjectType('valor-invalido'), 'collaborator')
    assert.equal(resolvePersonSubjectType('CUSTOMER'), 'collaborator')
  })

  test('los cinco literales se reconocen tal cual, con trim', ({ assert }) => {
    for (const literal of PERSON_SUBJECT_TYPES) {
      assert.equal(resolvePersonSubjectType(literal), literal)
      assert.equal(resolvePersonSubjectType(`  ${literal}  `), literal)
    }
  })

  test('solo collaborator exige permiso de escritura de persona', ({ assert }) => {
    assert.isTrue(personSubjectRequiresCollaboratorWritePermission('collaborator'))
    assert.isFalse(personSubjectRequiresCollaboratorWritePermission('customer'))
    assert.isFalse(personSubjectRequiresCollaboratorWritePermission('flight-attendant'))
    assert.isFalse(personSubjectRequiresCollaboratorWritePermission('pilot'))
    assert.isFalse(personSubjectRequiresCollaboratorWritePermission('system-user'))
  })
})
