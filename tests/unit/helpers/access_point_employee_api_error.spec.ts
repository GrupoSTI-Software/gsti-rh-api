import { test } from '@japa/runner'
import type { I18n } from '@adonisjs/i18n'
import { resolveAccessPointEmployeeApiError } from '#helpers/access_point_employee_api_error'
import { AdmsError } from '#exceptions/adms_error'
import { ADMS_ERROR_CODES } from '#constants/adms_error_codes'

/** El i18n real no aporta nada aqui: devuelve la clave y se compara por ella. */
const i18n = { formatMessage: (key: string) => key } as unknown as I18n

/**
 * El alta del vinculo delega en el modulo de sincronizacion, que lanza
 * `AdmsError` con su propio triplete. Ese contrato tiene que llegar al
 * Backoffice tal cual (estatus, titulo, detalle, key) y no como 500.
 */
test.group('resolveAccessPointEmployeeApiError con errores del canal ADMS', () => {
  test('pin-ocupado responde 409 con su titulo, detalle y key', ({ assert }) => {
    const error = new AdmsError(
      'Ese PIN ya esta ocupado en este equipo',
      ADMS_ERROR_CODES.PIN_TAKEN,
      409,
      'pin-ocupado',
      'Otra operacion tomo ese numero primero.'
    )

    const resolved = resolveAccessPointEmployeeApiError(error, i18n)

    assert.equal(resolved.status, 409)
    assert.equal(resolved.key, 'pin-ocupado')
    assert.equal(resolved.title, 'Ese PIN ya esta ocupado en este equipo')
    assert.equal(resolved.detail, 'Otra operacion tomo ese numero primero.')
    assert.equal(resolved.code, ADMS_ERROR_CODES.PIN_TAKEN)
  })

  test('un error no reconocido sigue siendo 500 generico', ({ assert }) => {
    const resolved = resolveAccessPointEmployeeApiError(new Error('detalle interno'), i18n)

    assert.equal(resolved.status, 500)
    assert.equal(resolved.key, 'error-interno')
    assert.notInclude(JSON.stringify(resolved), 'detalle interno')
  })
})
