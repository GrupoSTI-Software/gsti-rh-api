import { test } from '@japa/runner'
import { maskSensitiveValue } from '#helpers/sensitive_mask'
import { neutralizeSensitiveMaskEchoInBody } from '#helpers/sensitive_mask_echo_body'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'

const deniedStore = {
  read: { identificacion: false, contacto: false, financiero: false, salud: false, biometrico: false },
  write: {
    identificacion: 'denied' as const,
    contacto: 'denied' as const,
    financiero: 'denied' as const,
    salud: 'denied' as const,
    biometrico: 'denied' as const,
  },
}

const readIdentificacionStore = {
  read: { identificacion: true, contacto: false, financiero: false, salud: false, biometrico: false },
  write: {
    identificacion: 'allowed' as const,
    contacto: 'denied' as const,
    financiero: 'denied' as const,
    salud: 'denied' as const,
    biometrico: 'denied' as const,
  },
}

test.group('neutralizeSensitiveMaskEchoInBody', () => {
  test('sin ALS devuelve el cuerpo intacto', ({ assert }) => {
    const body = { personRfc: maskSensitiveValue('VARL850602AB3', 'identificacion') }
    assert.strictEqual(neutralizeSensitiveMaskEchoInBody(body as Record<string, unknown>), body)
  })

  test('elimina eco de catálogo si no hay lectura de la categoría', ({ assert }) => {
    const echo = maskSensitiveValue('VARL850602AB3', 'identificacion')
    const body = { personRfc: echo, personFirstname: 'Ana' }
    SensitiveAccessContext.run(deniedStore, () => {
      const out = neutralizeSensitiveMaskEchoInBody(body as Record<string, unknown>)
      assert.notProperty(out, 'personRfc')
      assert.equal(out.personFirstname, 'Ana')
    })
  })

  test('no elimina si el usuario tiene lectura de la categoría', ({ assert }) => {
    const echo = maskSensitiveValue('VARL850602AB3', 'identificacion')
    const body = { personRfc: echo }
    SensitiveAccessContext.run(readIdentificacionStore, () => {
      const out = neutralizeSensitiveMaskEchoInBody(body as Record<string, unknown>)
      assert.equal(out.personRfc, echo)
    })
  })

  test('no toca campos fuera del catálogo aunque parezcan máscara', ({ assert }) => {
    const body = { personFirstname: '••••', employeeCode: '••••1234' }
    SensitiveAccessContext.run(deniedStore, () => {
      const out = neutralizeSensitiveMaskEchoInBody(body as Record<string, unknown>)
      assert.deepEqual(out, body)
    })
  })

  test('no elimina corrupción que no es eco', ({ assert }) => {
    const body = { personRfc: '•••X1234ABCD' }
    SensitiveAccessContext.run(deniedStore, () => {
      const out = neutralizeSensitiveMaskEchoInBody(body as Record<string, unknown>)
      assert.equal(out.personRfc, '•••X1234ABCD')
    })
  })
})
