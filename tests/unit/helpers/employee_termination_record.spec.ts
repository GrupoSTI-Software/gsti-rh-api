import { test } from '@japa/runner'
import {
  isEmployeeTerminationRecordChanged,
  normalizeEmployeeTerminatedDate,
  normalizeToken,
  parseEmployeeTerminatedDate,
} from '#helpers/employee_termination_record'

const base = {
  employeeTerminatedDate: '2024-01-15 00:00:00',
  employeeTerminationModality: 'Renuncia',
  employeeTerminationType: 'Jubilación',
}

test.group('isEmployeeTerminationRecordChanged', () => {
  test('false cuando reenvía el mismo registro (edición ordinaria de baja existente)', ({
    assert,
  }) => {
    assert.isFalse(isEmployeeTerminationRecordChanged(base, { ...base }))
  })

  test('true al asentar registro donde no había ninguno', ({ assert }) => {
    assert.isTrue(
      isEmployeeTerminationRecordChanged(
        {
          employeeTerminatedDate: null,
          employeeTerminationModality: null,
          employeeTerminationType: null,
        },
        base
      )
    )
  })

  test('true al cambiar solo la fecha', ({ assert }) => {
    assert.isTrue(
      isEmployeeTerminationRecordChanged(base, {
        ...base,
        employeeTerminatedDate: '2024-02-01 00:00:00',
      })
    )
  })

  test('true al cambiar modalidad o tipo', ({ assert }) => {
    assert.isTrue(
      isEmployeeTerminationRecordChanged(base, {
        ...base,
        employeeTerminationModality: 'Despido',
      })
    )
    assert.isTrue(
      isEmployeeTerminationRecordChanged(base, {
        ...base,
        employeeTerminationType: 'Bajo Desempeño Operativo',
      })
    )
  })

  test('true al quitar el registro por completo', ({ assert }) => {
    assert.isTrue(
      isEmployeeTerminationRecordChanged(base, {
        employeeTerminatedDate: null,
        employeeTerminationModality: null,
        employeeTerminationType: null,
      })
    )
  })

  test('normaliza fecha ISO a la forma del controlador antes de comparar', ({ assert }) => {
    assert.equal(normalizeEmployeeTerminatedDate('2024-01-15T12:00:00.000Z'), '2024-01-15 00:00:00')
    assert.isFalse(
      isEmployeeTerminationRecordChanged(base, {
        ...base,
        employeeTerminatedDate: normalizeEmployeeTerminatedDate('2024-01-15T00:00:00.000Z'),
      })
    )
  })

  test('normaliza Date UTC a la misma forma canónica que una fecha string', ({ assert }) => {
    const date = new Date('2024-01-15T23:59:59.000Z')
    assert.equal(normalizeEmployeeTerminatedDate(date), '2024-01-15 00:00:00')
    assert.isFalse(
      isEmployeeTerminationRecordChanged(
        { ...base, employeeTerminatedDate: date },
        { ...base, employeeTerminatedDate: '2024-01-15T00:00:00.000Z' }
      )
    )
  })
})

/**
 * VLRH-H1790812613821 (CA-13) — la fecha de baja se interpreta en un solo
 * lugar y con tres resultados: vacía, no interpretable y válida.
 */
test.group('parseEmployeeTerminatedDate', () => {
  const VALID_SEPTEMBER_15 = {
    kind: 'valid',
    calendarDate: '2026-09-15',
    sqlValue: '2026-09-15 00:00:00',
  }

  test('vacía: null, undefined y texto vacío o en blanco', ({ assert }) => {
    for (const value of [null, undefined, '', '   ']) {
      assert.deepEqual(parseEmployeeTerminatedDate(value), { kind: 'empty' })
    }
  })

  test('válida: la hora, la zona y las comillas que acompañen la fecha no la recorren de día', ({
    assert,
  }) => {
    for (const value of [
      '2026-09-15',
      '2026-09-15T06:00:00.000Z',
      '2026-09-15T23:30:00-06:00',
      '"2026-09-15"',
      '"2026-09-15T06:00:00.000Z"',
      '2026-09-15 00:00:00',
      '2026-09-15 00:000:00',
    ]) {
      assert.deepEqual(parseEmployeeTerminatedDate(value), VALID_SEPTEMBER_15, value)
    }
  })

  test('válida: 29 de febrero en año bisiesto y Date del driver leído en UTC', ({ assert }) => {
    assert.deepEqual(parseEmployeeTerminatedDate('2024-02-29'), {
      kind: 'valid',
      calendarDate: '2024-02-29',
      sqlValue: '2024-02-29 00:00:00',
    })
    assert.deepEqual(parseEmployeeTerminatedDate(new Date('2024-01-15T23:59:59.000Z')), {
      kind: 'valid',
      calendarDate: '2024-01-15',
      sqlValue: '2024-01-15 00:00:00',
    })
  })

  test('no interpretable: días que no existen, otros formatos y valores que no son texto', ({
    assert,
  }) => {
    const values: unknown[] = [
      '2026-02-29',
      '2026-02-30',
      '2026-13-01',
      'abc',
      '27/09/2026',
      '2026-9-15',
      '20260915',
      20260915,
      '2026-W38-2',
      '2026-258',
      '2026-09-15x',
      0,
      false,
      true,
      {},
      new Date('x'),
    ]
    for (const value of values) {
      assert.deepEqual(parseEmployeeTerminatedDate(value), { kind: 'invalid' }, String(value))
    }
  })

  test('idempotente: interpretar el valor ya normalizado da el mismo resultado', ({ assert }) => {
    const first = parseEmployeeTerminatedDate('2026-09-15T23:30:00-06:00')
    assert.strictEqual(first.kind, 'valid')
    if (first.kind !== 'valid') return
    assert.deepEqual(parseEmployeeTerminatedDate(first.sqlValue), first)
  })

  test('normalizeEmployeeTerminatedDate da null para vacía y para no interpretable', ({
    assert,
  }) => {
    for (const value of [null, undefined, '', '   ', 'abc', '2026-02-30', 0, false, 20260915]) {
      assert.isNull(normalizeEmployeeTerminatedDate(value))
    }
    assert.equal(normalizeEmployeeTerminatedDate('2026-09-15'), '2026-09-15 00:00:00')
  })
})

test.group('isEmployeeTerminationRecordChanged — fecha no interpretable (fail-closed)', () => {
  const noRecord = {
    employeeTerminatedDate: null,
    employeeTerminationModality: null,
    employeeTerminationType: null,
  }

  test('true cuando la fecha nueva no es interpretable, aunque no hubiera registro', ({
    assert,
  }) => {
    assert.isTrue(
      isEmployeeTerminationRecordChanged(noRecord, { ...noRecord, employeeTerminatedDate: 'abc' })
    )
  })

  test('true cuando la fecha guardada no es interpretable, aunque la nueva venga vacía', ({
    assert,
  }) => {
    assert.isTrue(
      isEmployeeTerminationRecordChanged(
        { ...noRecord, employeeTerminatedDate: new Date('x') },
        noRecord
      )
    )
  })

  test('false cuando la misma fecha llega con otra hora, zona o comillas', ({ assert }) => {
    const current = { ...base, employeeTerminatedDate: new Date('2024-01-15T00:00:00.000Z') }
    for (const value of ['2024-01-15T23:59:59-06:00', '"2024-01-15T06:00:00.000Z"']) {
      assert.isFalse(
        isEmployeeTerminationRecordChanged(current, { ...base, employeeTerminatedDate: value }),
        value
      )
    }
  })
})

test.group('normalizeToken', () => {
  test('null, undefined y vacío se normalizan a null', ({ assert }) => {
    assert.isNull(normalizeToken(null))
    assert.isNull(normalizeToken(undefined))
    assert.isNull(normalizeToken(''))
  })

  test('valores no vacíos se convierten a string', ({ assert }) => {
    assert.equal(normalizeToken('abc'), 'abc')
    assert.equal(normalizeToken(123), '123')
  })
})
