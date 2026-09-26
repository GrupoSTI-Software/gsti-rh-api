import { test } from '@japa/runner'
import i18nManager from '@adonisjs/i18n/services/main'
import { MAIL_FORCED_LOCALE, resolveMailLocale } from '#constants/mail_locale'

/**
 * Los correos salen en español aunque el cliente pida otro idioma. Estas
 * pruebas fijan esa decisión en un solo lugar: si alguien la cambia sin querer
 * —por ejemplo devolviendo `requested`—, aquí se entera antes de que salga un
 * correo a medio traducir.
 *
 * Cuando el producto lance en inglés, estas pruebas son justamente las que hay
 * que reescribir: son el recordatorio de que la decisión fue deliberada.
 */
test.group('resolveMailLocale — idioma forzado de los correos', () => {
  test('devuelve español sin importar lo que pida el cliente', ({ assert }) => {
    assert.equal(resolveMailLocale('en'), 'es')
    assert.equal(resolveMailLocale('es'), 'es')
    assert.equal(resolveMailLocale(undefined), 'es')
    assert.equal(resolveMailLocale(null), 'es')
    assert.equal(resolveMailLocale('pt'), 'es')
  })

  test('el idioma forzado es español', ({ assert }) => {
    assert.equal(MAIL_FORCED_LOCALE, 'es')
  })

  test('el catálogo en inglés sigue existiendo para el lanzamiento futuro', ({ assert }) => {
    // Forzar español no debe convertirse en excusa para dejar morir el `en`:
    // la cadena en inglés tiene que seguir ahí y ser distinta de la española.
    const en = i18nManager.locale('en').formatMessage('auth.password_recovery.subject', {
      tradeName: 'Valanserh',
    })
    const es = i18nManager.locale('es').formatMessage('auth.password_recovery.subject', {
      tradeName: 'Valanserh',
    })

    assert.isNotEmpty(en)
    assert.isNotEmpty(es)
    assert.notEqual(en, es)
  })

  test('el asunto de un correo sale en español aunque se pida en inglés', ({ assert }) => {
    // Réplica de lo que hace cada mail: el locale se resuelve por el helper.
    const subject = i18nManager
      .locale(resolveMailLocale('en'))
      .formatMessage('auth.password_recovery.subject', { tradeName: 'Valanserh' })

    const expected = i18nManager
      .locale('es')
      .formatMessage('auth.password_recovery.subject', { tradeName: 'Valanserh' })

    assert.equal(subject, expected)
  })
})
