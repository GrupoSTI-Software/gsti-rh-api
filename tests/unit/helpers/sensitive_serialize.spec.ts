import { test } from '@japa/runner'
import { sensitiveSerialize } from '#helpers/sensitive_serialize'
import { SensitiveAccessContext } from '#utils/sensitive_access_context'
import { maskSensitiveValue, MASK_CHAR } from '#helpers/sensitive_mask'
import type { LegalCategory } from '#constants/sensitive_fields'

const allDenied: Record<LegalCategory, boolean> = {
  identificacion: false,
  contacto: false,
  financiero: false,
  salud: false,
  biometrico: false,
}

test.group('sensitiveSerialize', () => {
  test('sin contexto activo enmascara igual que hoy', ({ assert }) => {
    const serialize = sensitiveSerialize('Person', 'personCurp')
    assert.equal(serialize('ABCD123456MDFABC01'), '••••••••••••••BC01')
    assert.equal(serialize('ABCD123456MDFABC01'), maskSensitiveValue('ABCD123456MDFABC01', 'identificacion'))
  })

  test('con permiso de la categoría entrega el valor en claro', ({ assert }) => {
    const serialize = sensitiveSerialize('Person', 'personEmail')
    SensitiveAccessContext.run({ ...allDenied, contacto: true }, () => {
      assert.equal(serialize('juan@empresa.com'), 'juan@empresa.com')
    })
  })

  test('sin permiso de la categoría enmascara; otra categoría en claro no abre esta', ({
    assert,
  }) => {
    const serializeClabe = sensitiveSerialize('EmployeeBank', 'employeeBankAccountClabe')
    SensitiveAccessContext.run({ ...allDenied, contacto: true }, () => {
      assert.equal(serializeClabe('012345678901234567'), '••••••••••••••4567')
    })
  })

  test('salud sin permiso entrega cinco MASK_CHAR', ({ assert }) => {
    const serialize = sensitiveSerialize(
      'EmployeeMedicalCondition',
      'employeeMedicalConditionDiagnosis'
    )
    assert.equal(serialize('gripe'), MASK_CHAR.repeat(5))
  })

  test('par no clasificado se tapa siempre, incluso con bypass de otra categoría', ({
    assert,
  }) => {
    const serialize = sensitiveSerialize('Person', 'personFirstname')
    SensitiveAccessContext.run(
      {
        identificacion: true,
        contacto: true,
        financiero: true,
        salud: true,
        biometrico: true,
      },
      () => {
        assert.equal(serialize('Ana'), MASK_CHAR.repeat(5))
      }
    )
  })

  test('null permanece null', ({ assert }) => {
    const serialize = sensitiveSerialize('Person', 'personRfc')
    assert.isNull(serialize(null))
  })
})
