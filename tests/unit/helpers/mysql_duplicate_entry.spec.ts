import { test } from '@japa/runner'
import { isDuplicateEntry } from '#helpers/mysql_duplicate_entry'

test.group('isDuplicateEntry', () => {
  test('reconoce el choque por code', ({ assert }) => {
    assert.isTrue(isDuplicateEntry({ code: 'ER_DUP_ENTRY' }))
  })

  test('reconoce el choque por errno', ({ assert }) => {
    assert.isTrue(isDuplicateEntry({ errno: 1062 }))
  })

  test('otro error de MySQL no lo es', ({ assert }) => {
    assert.isFalse(isDuplicateEntry({ code: 'ER_LOCK_DEADLOCK', errno: 1213 }))
    assert.isFalse(isDuplicateEntry(new Error('ER_DUP_ENTRY')))
  })

  test('null, undefined y lo que no es objeto no lo son', ({ assert }) => {
    assert.isFalse(isDuplicateEntry(null))
    assert.isFalse(isDuplicateEntry(undefined))
    assert.isFalse(isDuplicateEntry('ER_DUP_ENTRY'))
    assert.isFalse(isDuplicateEntry(1062))
  })
})
