import { test } from '@japa/runner'
import { pickRecipientEmail } from '#helpers/pick_recipient_email'
import {
  EXCEPTION_REQUEST_APPROVER_LINK,
  EXCEPTION_REQUEST_ROLE_CHAIN,
} from '#constants/exception_request_notification'

/**
 * Cuando un colaborador pide un permiso desde la app, alguien tiene que
 * enterarse. La regla de negocio es una cadena: su jefe directo; si no tiene uno
 * asignado, Recursos Humanos; si no, administracion; y al final el dueno de la
 * cuenta. Un permiso que no le llega a nadie es un permiso que nadie resuelve.
 *
 * El orden importa tanto como los eslabones: notificar al dueno de la cuenta
 * teniendo jefe directo convierte el aviso en ruido y hace que se deje de leer.
 */
test.group('Cadena de aviso de solicitudes de permiso', () => {
  test('el orden por rol es Recursos Humanos, administracion y dueno', ({ assert }) => {
    assert.deepEqual(
      EXCEPTION_REQUEST_ROLE_CHAIN.map((eslabon) => eslabon.link),
      [
        EXCEPTION_REQUEST_APPROVER_LINK.HR,
        EXCEPTION_REQUEST_APPROVER_LINK.ADMIN,
        EXCEPTION_REQUEST_APPROVER_LINK.OWNER,
      ]
    )
  })

  test('cada eslabon por rol declara al menos un slug', ({ assert }) => {
    for (const eslabon of EXCEPTION_REQUEST_ROLE_CHAIN) {
      assert.isAbove(eslabon.slugs.length, 0, `el eslabon ${eslabon.link} se quedo sin slugs`)
    }
  })

  test('el jefe directo no se resuelve por rol', ({ assert }) => {
    const porRol = EXCEPTION_REQUEST_ROLE_CHAIN.map((eslabon) => eslabon.link)

    assert.notInclude(
      porRol,
      EXCEPTION_REQUEST_APPROVER_LINK.DIRECT_BOSS,
      'el jefe directo sale de la asignacion en user_responsible_employee, no de un rol'
    )
  })
})

/**
 * Que correo se usa para alcanzar a alguien.
 *
 * Primero el institucional, que es el que la empresa controla; si el expediente
 * no lo tiene, el personal. Los dos viven en tablas distintas —empleado y
 * persona— y capturar solo uno de ellos es lo normal, no la excepcion.
 */
test.group('pickRecipientEmail', () => {
  test('el institucional gana cuando existe', ({ assert }) => {
    const elegido = pickRecipientEmail({
      business: 'jefe@empresa.com',
      personal: 'jefe@personal.com',
      account: 'jefe@cuenta.com',
    })

    assert.deepEqual(elegido, { email: 'jefe@empresa.com', emailKind: 'business' })
  })

  test('sin institucional cae al personal', ({ assert }) => {
    const elegido = pickRecipientEmail({
      business: null,
      personal: 'jefe@personal.com',
      account: 'jefe@cuenta.com',
    })

    assert.deepEqual(elegido, { email: 'jefe@personal.com', emailKind: 'personal' })
  })

  test('sin ninguno de los dos, el de la cuenta evita perder el aviso', ({ assert }) => {
    const elegido = pickRecipientEmail({ business: '', personal: '   ', account: 'jefe@cuenta.com' })

    assert.deepEqual(elegido, { email: 'jefe@cuenta.com', emailKind: 'account' })
  })

  test('un correo en blanco no cuenta como capturado', ({ assert }) => {
    const elegido = pickRecipientEmail({ business: '   ', personal: 'jefe@personal.com' })

    assert.deepEqual(elegido, { email: 'jefe@personal.com', emailKind: 'personal' })
  })

  test('el correo elegido viene recortado', ({ assert }) => {
    const elegido = pickRecipientEmail({ business: '  jefe@empresa.com  ' })

    assert.equal(elegido?.email, 'jefe@empresa.com')
  })

  test('sin ningun correo devuelve null y la cadena sigue subiendo', ({ assert }) => {
    assert.isNull(pickRecipientEmail({}))
    assert.isNull(pickRecipientEmail({ business: null, personal: null, account: null }))
  })
})
