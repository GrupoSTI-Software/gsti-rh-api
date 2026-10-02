import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import { resolveDocumentStatus } from '#modules/consent/platform/platform_consent.service'

test.group('resolveDocumentStatus', () => {
  test('sin versión vigente → sin-version-publicada, sin importar aceptaciones', ({ assert }) => {
    assert.equal(resolveDocumentStatus(false, DateTime.now(), true), 'sin-version-publicada')
  })

  test('aceptó la vigente → al-dia', ({ assert }) => {
    assert.equal(resolveDocumentStatus(true, DateTime.now(), true), 'al-dia')
  })

  test('aceptó solo una versión anterior → pendiente', ({ assert }) => {
    assert.equal(resolveDocumentStatus(true, DateTime.now(), false), 'pendiente')
  })

  test('nunca aceptó → nunca', ({ assert }) => {
    assert.equal(resolveDocumentStatus(true, null, false), 'nunca')
  })
})
