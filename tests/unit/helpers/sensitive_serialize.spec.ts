import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import {
  sensitiveSerialize,
  sensitiveSerializeNumeric,
  maskSensitiveDtoValue,
} from '#helpers/sensitive_serialize'
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

test.group('sensitiveSerializeNumeric', () => {
  test('sin permiso entrega null, nunca máscara parcial', ({ assert }) => {
    const serialize = sensitiveSerializeNumeric('EmployeeSalaryHistory', 'salaryDaily')
    assert.isNull(serialize(1250.75))
    assert.notEqual(serialize(1250.75), '•••0.75')
  })

  test('con permiso de financiero entrega el number', ({ assert }) => {
    const serialize = sensitiveSerializeNumeric('PositionSalaryRange', 'minSalaryDaily')
    SensitiveAccessContext.run({ ...allDenied, financiero: true }, () => {
      assert.equal(serialize(1250.75), 1250.75)
      assert.equal(typeof serialize(1250.75), 'number')
    })
  })

  test('null permanece null', ({ assert }) => {
    const serialize = sensitiveSerializeNumeric('PositionSalaryRange', 'maxSalaryDaily')
    assert.isNull(serialize(null))
  })

  test('sin clasificación entrega null (fail-closed de importe)', ({ assert }) => {
    const serialize = sensitiveSerializeNumeric('Employee', 'dailySalary')
    SensitiveAccessContext.run(
      { identificacion: true, contacto: true, financiero: true, salud: true, biometrico: true },
      () => {
        assert.isNull(serialize(999))
      }
    )
  })
})

test.group('maskSensitiveDtoValue', () => {
  test('biométrico sin permiso entrega cinco MASK_CHAR', ({ assert }) => {
    assert.equal(
      maskSensitiveDtoValue('EmployeeBiometric', 'employeeBiometricData', 'Finger:1, Face'),
      MASK_CHAR.repeat(5)
    )
  })

  test('biométrico con permiso entrega el valor en claro', ({ assert }) => {
    SensitiveAccessContext.run({ ...allDenied, biometrico: true }, () => {
      assert.equal(
        maskSensitiveDtoValue('EmployeeBiometric', 'employeeBiometricData', 'Finger:1, Face'),
        'Finger:1, Face'
      )
    })
  })

  test('cadena vacía permanece vacía (sin enrolamiento)', ({ assert }) => {
    assert.equal(maskSensitiveDtoValue('EmployeeBiometric', 'employeeBiometricData', ''), '')
  })

  test('RFC de empresa contratante sin permiso aplica maskLastFour', ({ assert }) => {
    assert.equal(
      maskSensitiveDtoValue('EmpresaContratante', 'rfc', 'VACW850312J95'),
      '•••••••••2J95'
    )
  })

  test('la categoría sale del catálogo, no de un literal en el caller', ({ assert }) => {
    const source = readFileSync(join(process.cwd(), 'app/helpers/sensitive_serialize.ts'), 'utf-8')
    assert.notMatch(source, /canRead\('biometrico'\)/)
    assert.notMatch(source, /canRead\('identificacion'\)/)
  })
})
