import { test } from '@japa/runner'
import type { LegalCategory } from '#constants/sensitive_fields'
import {
  SensitiveAccessContext,
  type SensitiveAccessStore,
  type SensitiveWriteDecision,
} from '#utils/sensitive_access_context'
import { SENSITIVE_DATA_WRITE_ERROR_CODES } from '#constants/sensitive_data_write_error_codes'
import { SensitiveDataWriteError } from '#exceptions/sensitive_data_write_error'
import {
  assertSensitiveWriteAllowed,
  type SensitiveWriteModel,
} from '#mixins/with_sensitive_write_guard'

const deniedRead: Record<LegalCategory, boolean> = {
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

function store(write?: Partial<Record<LegalCategory, SensitiveWriteDecision>>): SensitiveAccessStore {
  return {
    read: { ...deniedRead },
    write: { ...deniedWrite, ...write },
  }
}

function person(partial: {
  dirty: Record<string, unknown>
  original?: Record<string, unknown>
}): SensitiveWriteModel {
  return {
    constructor: { name: 'Person' },
    $dirty: partial.dirty,
    $original: partial.original ?? {},
  }
}

test.group('assertSensitiveWriteAllowed', () => {
  test('sin ALS no lanza (fail-open de comandos y seeders)', ({ assert }) => {
    assert.isFalse(SensitiveAccessContext.isActive())
    assert.doesNotThrow(() =>
      assertSensitiveWriteAllowed(
        person({ dirty: { personRfc: 'VARL850602AB3' } })
      )
    )
  })

  test('columna no clasificada no exige permiso', ({ assert }) => {
    SensitiveAccessContext.run(store(), () => {
      assert.doesNotThrow(() =>
        assertSensitiveWriteAllowed(
          person({
            dirty: { personLastname: 'García', personMaritalStatus: 'married' },
            original: { personLastname: 'López', personMaritalStatus: 'single' },
          })
        )
      )
    })
  })

  test('null, undefined y vacío son equivalentes: no hay transición', ({ assert }) => {
    SensitiveAccessContext.run(store(), () => {
      assert.doesNotThrow(() =>
        assertSensitiveWriteAllowed(
          person({
            dirty: { personRfc: null, personEmail: '' },
            original: { personRfc: undefined, personEmail: null },
          })
        )
      )
    })
  })

  test('mismo valor que el guardado no exige permiso', ({ assert }) => {
    SensitiveAccessContext.run(store(), () => {
      assert.doesNotThrow(() =>
        assertSensitiveWriteAllowed(
          person({
            dirty: { personRfc: 'GOMC880315HRA' },
            original: { personRfc: 'GOMC880315HRA' },
          })
        )
      )
    })
  })

  test('transición real sin permiso lanza FORBIDDEN de identificación', ({ assert }) => {
    SensitiveAccessContext.run(store(), () => {
      try {
        assertSensitiveWriteAllowed(
          person({
            dirty: { personRfc: 'VARL850602AB3', personLastname: 'García' },
            original: { personRfc: 'GOMC880315HRA', personLastname: 'López' },
          })
        )
        assert.fail('debía lanzar')
      } catch (error) {
        assert.instanceOf(error, SensitiveDataWriteError)
        const denied = error as SensitiveDataWriteError
        assert.equal(denied.errorCode, SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN)
        assert.equal(denied.category, 'identificacion')
        assert.notInclude(denied.message, 'VARL850602AB3')
        assert.notInclude(denied.message, 'GOMC880315HRA')
      }
    })
  })

  test('petición mixta reporta identificación primero y no menciona el teléfono', ({ assert }) => {
    SensitiveAccessContext.run(store({ contacto: 'allowed' }), () => {
      try {
        assertSensitiveWriteAllowed(
          person({
            dirty: { personPhone: '5511111111', personCurp: 'AAAA800101HDFRRN09' },
            original: { personPhone: '5500000000', personCurp: 'BBBB800101HDFRRN09' },
          })
        )
        assert.fail('debía lanzar')
      } catch (error) {
        const denied = error as SensitiveDataWriteError
        assert.equal(denied.category, 'identificacion')
        assert.equal(denied.errorCode, SENSITIVE_DATA_WRITE_ERROR_CODES.FORBIDDEN)
      }
    })
  })

  test('alta con CLABE sin permiso financiero lanza FORBIDDEN', ({ assert }) => {
    SensitiveAccessContext.run(store(), () => {
      try {
        assertSensitiveWriteAllowed({
          constructor: { name: 'EmployeeBank' },
          $dirty: { employeeBankAccountClabe: '012345678901234567', employeeBankAccountType: 'checking' },
          $original: {},
        })
        assert.fail('debía lanzar')
      } catch (error) {
        assert.equal((error as SensitiveDataWriteError).category, 'financiero')
      }
    })
  })

  test('alta con CLABE y permiso financiero no lanza', ({ assert }) => {
    SensitiveAccessContext.run(store({ financiero: 'allowed' }), () => {
      assert.doesNotThrow(() =>
        assertSensitiveWriteAllowed({
          constructor: { name: 'EmployeeBank' },
          $dirty: { employeeBankAccountClabe: '012345678901234567' },
          $original: {},
        })
      )
    })
  })

  test('write unresolved lanza UNRESOLVED', ({ assert }) => {
    SensitiveAccessContext.run(store({ identificacion: 'unresolved' }), () => {
      try {
        assertSensitiveWriteAllowed(
          person({ dirty: { personRfc: 'VARL850602AB3' }, original: { personRfc: 'GOMC880315HRA' } })
        )
        assert.fail('debía lanzar')
      } catch (error) {
        assert.equal(
          (error as SensitiveDataWriteError).errorCode,
          SENSITIVE_DATA_WRITE_ERROR_CODES.UNRESOLVED
        )
      }
    })
  })

  test('isUnguarded no lanza aunque haya transición biométrica', ({ assert }) => {
    SensitiveAccessContext.run(store(), () => {
      SensitiveAccessContext.runUnguarded('test', () => {
        assert.doesNotThrow(() =>
          assertSensitiveWriteAllowed({
            constructor: { name: 'EmployeeBiometricFaceId' },
            $dirty: { employeeBiometricFaceIdToken: 'new-token' },
            $original: { employeeBiometricFaceIdToken: 'old-token' },
          })
        )
      })
    })
  })

  test('diagnóstico de salud sin permiso lanza categoría salud', ({ assert }) => {
    SensitiveAccessContext.run(store(), () => {
      try {
        assertSensitiveWriteAllowed({
          constructor: { name: 'EmployeeMedicalCondition' },
          $dirty: { employeeMedicalConditionDiagnosis: 'nuevo' },
          $original: { employeeMedicalConditionDiagnosis: 'previo' },
        })
        assert.fail('debía lanzar')
      } catch (error) {
        assert.equal((error as SensitiveDataWriteError).category, 'salud')
      }
    })
  })
})
