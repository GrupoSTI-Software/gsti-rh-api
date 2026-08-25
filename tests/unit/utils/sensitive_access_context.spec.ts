import { test } from '@japa/runner'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'
import type { LegalCategory } from '#constants/sensitive_fields'

const allDenied: Record<LegalCategory, boolean> = {
  identificacion: false,
  contacto: false,
  financiero: false,
  salud: false,
  biometrico: false,
}

test.group('SensitiveAccessContext', () => {
  test('sin contexto activo canRead es false y isActive es false', ({ assert }) => {
    assert.isFalse(SensitiveAccessContext.isActive())
    assert.isFalse(SensitiveAccessContext.canRead('contacto'))
    assert.isFalse(SensitiveAccessContext.canRead('financiero'))
  })

  test('con contexto activo canRead respeta cada categoría', ({ assert }) => {
    SensitiveAccessContext.run(
      { ...allDenied, contacto: true },
      () => {
        assert.isTrue(SensitiveAccessContext.isActive())
        assert.isTrue(SensitiveAccessContext.canRead('contacto'))
        assert.isFalse(SensitiveAccessContext.canRead('financiero'))
        assert.isFalse(SensitiveAccessContext.canRead('identificacion'))
      }
    )
    assert.isFalse(SensitiveAccessContext.isActive())
  })

  test('al salir de run el store no se filtra a la siguiente llamada', ({ assert }) => {
    SensitiveAccessContext.run({ ...allDenied, salud: true }, () => {
      assert.isTrue(SensitiveAccessContext.canRead('salud'))
    })
    assert.isFalse(SensitiveAccessContext.canRead('salud'))
  })
})
