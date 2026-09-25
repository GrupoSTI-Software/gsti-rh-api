import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import {
  sensitiveSerialize,
  sensitiveSerializeNumeric,
  maskSensitiveDtoValue,
} from '#helpers/sensitive_serialize'
import { SensitiveAccessContext, type SensitiveWriteDecision } from '#utils/sensitive_access_context'
import { maskSensitiveValue, SENSITIVE_MASK } from '#helpers/sensitive_mask'
import type { LegalCategory } from '#constants/sensitive_fields'

const allDenied: Record<LegalCategory, boolean> = {
  identificacion: false,
  contacto: false,
  financiero: false,
  salud: false,
  biometrico: false,
}

const deniedWrite: Record<LegalCategory, SensitiveWriteDecision> = {
  identificacion: 'denied',
  contacto: 'denied',
  financiero: 'denied',
  salud: 'denied',
  biometrico: 'denied',
}

test.group('sensitiveSerialize', () => {
  test('sin contexto activo enmascara con máscara fija', ({ assert }) => {
    const serialize = sensitiveSerialize('Person', 'personCurp')
    assert.equal(serialize('ABCD123456MDFABC01'), SENSITIVE_MASK)
    assert.equal(serialize('ABCD123456MDFABC01'), maskSensitiveValue('ABCD123456MDFABC01'))
  })

  test('con permiso de la categoría sigue enmascarando (claro solo por reveal)', ({ assert }) => {
    const serialize = sensitiveSerialize('Person', 'personEmail')
    SensitiveAccessContext.run(
      {
        read: { ...allDenied, contacto: true },
        write: deniedWrite,
      },
      () => {
        assert.equal(serialize('juan@empresa.com'), SENSITIVE_MASK)
      }
    )
  })

  test('sin permiso de la categoría enmascara igual que con permiso', ({ assert }) => {
    const serializeClabe = sensitiveSerialize('EmployeeBank', 'employeeBankAccountClabe')
    SensitiveAccessContext.run(
      {
        read: { ...allDenied, contacto: true },
        write: deniedWrite,
      },
      () => {
        assert.equal(serializeClabe('012345678901234567'), SENSITIVE_MASK)
      }
    )
  })

  test('salud sin permiso entrega máscara fija', ({ assert }) => {
    const serialize = sensitiveSerialize(
      'EmployeeMedicalCondition',
      'employeeMedicalConditionDiagnosis'
    )
    assert.equal(serialize('gripe'), SENSITIVE_MASK)
  })

  test('par no clasificado se tapa siempre, incluso con bypass de otra categoría', ({
    assert,
  }) => {
    const serialize = sensitiveSerialize('Person', 'personFirstname')
    SensitiveAccessContext.run(
      {
        read: {
          identificacion: true,
          contacto: true,
          financiero: true,
          salud: true,
          biometrico: true,
        },
        write: deniedWrite,
      },
      () => {
        assert.equal(serialize('Ana'), SENSITIVE_MASK)
      }
    )
  })

  test('null permanece null', ({ assert }) => {
    const serialize = sensitiveSerialize('Person', 'personRfc')
    assert.isNull(serialize(null))
  })

  test('cadena en blanco permanece en blanco, no se enmascara', ({ assert }) => {
    const serialize = sensitiveSerialize('Person', 'personImssNss')
    assert.equal(serialize(''), '')
    assert.equal(serialize('   '), '   ')
  })
})

test.group('sensitiveSerializeNumeric', () => {
  test('sin permiso entrega máscara fija, nunca máscara parcial', ({ assert }) => {
    const serialize = sensitiveSerializeNumeric('EmployeeSalaryHistory', 'salaryDaily')
    assert.equal(serialize(1250.75), SENSITIVE_MASK)
    assert.notEqual(serialize(1250.75), '•••0.75')
  })

  test('con permiso de financiero sigue entregando máscara fija', ({ assert }) => {
    const serialize = sensitiveSerializeNumeric('PositionSalaryRange', 'minSalaryDaily')
    SensitiveAccessContext.run(
      {
        read: { ...allDenied, financiero: true },
        write: deniedWrite,
      },
      () => {
        assert.equal(serialize(1250.75), SENSITIVE_MASK)
      }
    )
  })

  test('null permanece null', ({ assert }) => {
    const serialize = sensitiveSerializeNumeric('PositionSalaryRange', 'maxSalaryDaily')
    assert.isNull(serialize(null))
  })

  test('cero se entrega tapado como cualquier importe capturado', ({ assert }) => {
    const serialize = sensitiveSerializeNumeric('Employee', 'dailySalary')
    assert.equal(serialize(0), SENSITIVE_MASK)
    assert.equal(serialize('0.0000'), SENSITIVE_MASK)
  })

  test('par no clasificado con valor también se tapa (fail-closed de presencia)', ({
    assert,
  }) => {
    const serialize = sensitiveSerializeNumeric('Employee', 'employeeTeleworkPercentage')
    assert.equal(serialize(999), SENSITIVE_MASK)
  })

  test('importe decimal como string del driver se entrega tapado', ({ assert }) => {
    const serialize = sensitiveSerializeNumeric('Employee', 'dailySalary')
    assert.equal(serialize('1250.7500'), SENSITIVE_MASK)
  })

  test('Employee.dailySalary sin permiso financiero entrega máscara fija', ({ assert }) => {
    const serialize = sensitiveSerializeNumeric('Employee', 'dailySalary')
    SensitiveAccessContext.run(
      {
        read: {
          identificacion: true,
          contacto: true,
          financiero: false,
          salud: true,
          biometrico: true,
        },
        write: deniedWrite,
      },
      () => {
        assert.equal(serialize(850.5), SENSITIVE_MASK)
      }
    )
  })

  test('Employee.dailySalary con permiso financiero sigue entregando máscara fija', ({ assert }) => {
    const serialize = sensitiveSerializeNumeric('Employee', 'dailySalary')
    SensitiveAccessContext.run(
      {
        read: {
          identificacion: true,
          contacto: true,
          financiero: true,
          salud: true,
          biometrico: true,
        },
        write: deniedWrite,
      },
      () => {
        assert.equal(serialize(850.5), SENSITIVE_MASK)
      }
    )
  })
})

test.group('maskSensitiveDtoValue', () => {
  test('biométrico sin permiso entrega máscara fija', ({ assert }) => {
    assert.equal(
      maskSensitiveDtoValue('EmployeeBiometric', 'employeeBiometricData', 'Finger:1, Face'),
      SENSITIVE_MASK
    )
  })

  test('biométrico con permiso sigue enmascarando', ({ assert }) => {
    SensitiveAccessContext.run(
      {
        read: { ...allDenied, biometrico: true },
        write: deniedWrite,
      },
      () => {
        assert.equal(
          maskSensitiveDtoValue('EmployeeBiometric', 'employeeBiometricData', 'Finger:1, Face'),
          SENSITIVE_MASK
        )
      }
    )
  })

  test('cadena vacía permanece vacía (sin enrolamiento)', ({ assert }) => {
    assert.equal(maskSensitiveDtoValue('EmployeeBiometric', 'employeeBiometricData', ''), '')
  })

  test('RFC de empresa contratante sin permiso aplica máscara fija', ({ assert }) => {
    assert.equal(
      maskSensitiveDtoValue('EmpresaContratante', 'rfc', 'VACW850312J95'),
      SENSITIVE_MASK
    )
  })

  test('cadena en blanco en DTO permanece en blanco', ({ assert }) => {
    assert.equal(maskSensitiveDtoValue('Person', 'personRfc', '   '), '   ')
  })

  test('no consulta SensitiveAccessContext en el helper', ({ assert }) => {
    const source = readFileSync(join(process.cwd(), 'app/helpers/sensitive_serialize.ts'), 'utf-8')
    assert.notInclude(source, 'SensitiveAccessContext')
  })
})
