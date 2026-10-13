import { test } from '@japa/runner'
import {
  EMPLOYEE_OFFBOARDING_STATUS,
  EMPLOYEE_OFFBOARDING_WRITABLE_STATUSES,
  isOffboardingCaseWritable,
} from '#modules/employee-offboarding/offboardings/offboardings.constants'

/**
 * VLRH-H1790812613830, regla 3: solo el expediente abierto admite cambios. La
 * lista de permisión hace que el cancelado, el cerrado y cualquier estado
 * futuro nazcan de solo lectura.
 */
test.group('isOffboardingCaseWritable (VLRH-H1790812613830)', () => {
  test('solo open es escribible; closed y cancelled no', ({ assert }) => {
    assert.isTrue(isOffboardingCaseWritable(EMPLOYEE_OFFBOARDING_STATUS.OPEN))
    assert.isFalse(isOffboardingCaseWritable(EMPLOYEE_OFFBOARDING_STATUS.CLOSED))
    assert.isFalse(isOffboardingCaseWritable(EMPLOYEE_OFFBOARDING_STATUS.CANCELLED))
  })

  test('un estado desconocido nace de solo lectura', ({ assert }) => {
    assert.isFalse(isOffboardingCaseWritable('estado-futuro'))
    assert.isFalse(isOffboardingCaseWritable(''))
  })

  test('la lista de permisión contiene exactamente open', ({ assert }) => {
    assert.deepEqual(
      [...EMPLOYEE_OFFBOARDING_WRITABLE_STATUSES],
      [EMPLOYEE_OFFBOARDING_STATUS.OPEN]
    )
  })

  test('el catálogo declara los tres estados', ({ assert }) => {
    assert.deepEqual(Object.values(EMPLOYEE_OFFBOARDING_STATUS).sort(), [
      'cancelled',
      'closed',
      'open',
    ])
  })
})
