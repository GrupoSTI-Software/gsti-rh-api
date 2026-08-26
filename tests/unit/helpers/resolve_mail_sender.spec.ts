import { test } from '@japa/runner'
import { resolveMailSender } from '../../../app/helpers/resolve_mail_sender.js'

/**
 * USRH1787178944072 — prelación del remitente de correo saliente.
 *
 * Los tests usan el parámetro `overrides` para simular cada escenario sin
 * depender del caché de arranque de `@adonisjs/env` (ver riesgo 1 del spec).
 */
test.group('resolve_mail_sender — resolveMailSender', () => {
  test('CA-1: SMTP_FROM_ADDRESS tiene la máxima prelación', ({ assert }) => {
    const result = resolveMailSender({
      fromAddress: 'avisos@valanserh.com',
      username: 'postmaster@mg.valanserh.com',
    })
    assert.equal(result, 'avisos@valanserh.com')
  })

  test('CA-2: SMTP_USERNAME se usa cuando SMTP_FROM_ADDRESS está vacía', ({ assert }) => {
    const result = resolveMailSender({
      fromAddress: '',
      username: 'no-responder@email.gruposti.app',
    })
    assert.equal(result, 'no-responder@email.gruposti.app')
  })

  test('CA-3: aplica la dirección institucional de respaldo cuando ambas variables están vacías', ({
    assert,
  }) => {
    const result = resolveMailSender({ fromAddress: '', username: '' })
    assert.equal(result, 'no-reply@valanserh.local')
  })

  test('nunca devuelve cadena vacía', ({ assert }) => {
    const result = resolveMailSender({ fromAddress: '', username: '' })
    assert.isNotEmpty(result)
  })

  test('ignora espacios en blanco en SMTP_FROM_ADDRESS y usa el siguiente nivel', ({ assert }) => {
    const result = resolveMailSender({
      fromAddress: '   ',
      username: 'no-responder@gruposti.app',
    })
    assert.equal(result, 'no-responder@gruposti.app')
  })

  test('ignora espacios en blanco en SMTP_USERNAME y cae al respaldo', ({ assert }) => {
    const result = resolveMailSender({ fromAddress: '', username: '   ' })
    assert.equal(result, 'no-reply@valanserh.local')
  })

  test('recorta espacios del valor resuelto', ({ assert }) => {
    const result = resolveMailSender({
      fromAddress: '  avisos@valanserh.com  ',
      username: '',
    })
    assert.equal(result, 'avisos@valanserh.com')
  })
})
