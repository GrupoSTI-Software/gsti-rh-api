import { test } from '@japa/runner'
import EmployeeTeleworkCalculator from '#services/employee_telework_calculator'
import Shift from '#models/shift'
import {
  EMPLOYEE_HYBRID_MODE,
  EMPLOYEE_WORK_SCHEDULE,
  EMPLOYEE_WORK_SCHEDULE_ERROR_CODES,
} from '#constants/employee_work_schedule'

/**
 * Tests unitarios del cálculo del porcentaje de teletrabajo y las validaciones
 * cruzadas de la modalidad híbrida.
 *
 * El servicio `EmployeeTeleworkCalculator` es puro (no consulta BD ni recursos
 * externos), por lo que se puede probar directamente con objetos mock.
 *
 * Cubre la tabla canónica de `docs/spec-USRH1782788926678.md` §5 más los
 * casos borde documentados en §11.1.
 */

/**
 * Construye un mock de `Shift` con los campos mínimos que el calculador
 * consume (`shiftRestDays`). El resto se llena con valores neutros para
 * satisfacer al tipo Lucid sin acceso a BD.
 */
function makeShift(shiftRestDays: string): Shift {
  return { shiftRestDays } as Shift
}

test.group('EmployeeTeleworkCalculator — parseRestDays', () => {
  // Convención canónica del sistema: ISO 8601 (1 = Lunes, ..., 7 = Domingo),
  // consistente con `components/shiftInfoForm` y `WEEKDAY(day) + 1` en MySQL.
  test('CSV vacío devuelve arreglo vacío', ({ assert }) => {
    assert.deepEqual(EmployeeTeleworkCalculator.parseRestDays(''), [])
    assert.deepEqual(EmployeeTeleworkCalculator.parseRestDays(null), [])
    assert.deepEqual(EmployeeTeleworkCalculator.parseRestDays(undefined), [])
  })

  test('CSV "6,7" (sábado y domingo) devuelve [6,7]', ({ assert }) => {
    assert.deepEqual(EmployeeTeleworkCalculator.parseRestDays('6,7'), [6, 7])
  })

  test('CSV con espacios se recorta', ({ assert }) => {
    assert.deepEqual(EmployeeTeleworkCalculator.parseRestDays(' 6 , 7 '), [6, 7])
  })

  test('CSV con día fuera de rango [1..7] devuelve null', ({ assert }) => {
    assert.isNull(EmployeeTeleworkCalculator.parseRestDays('0,3'))
    assert.isNull(EmployeeTeleworkCalculator.parseRestDays('1,8'))
    assert.isNull(EmployeeTeleworkCalculator.parseRestDays('-1,3'))
  })

  test('CSV con no-enteros devuelve null', ({ assert }) => {
    assert.isNull(EmployeeTeleworkCalculator.parseRestDays('1.5,3'))
    assert.isNull(EmployeeTeleworkCalculator.parseRestDays('a,3'))
  })

  test('CSV con duplicados devuelve null', ({ assert }) => {
    assert.isNull(EmployeeTeleworkCalculator.parseRestDays('6,6,7'))
  })
})

test.group('EmployeeTeleworkCalculator — resolveWorkingDaysPerWeek', () => {
  test('turno con dos días de descanso (sáb+dom) devuelve 5 días laborables', ({ assert }) => {
    assert.equal(EmployeeTeleworkCalculator.resolveWorkingDaysPerWeek(makeShift('6,7')), 5)
  })

  test('turno 6x1 con un día de descanso (domingo) devuelve 6 días laborables', ({ assert }) => {
    assert.equal(EmployeeTeleworkCalculator.resolveWorkingDaysPerWeek(makeShift('7')), 6)
  })

  test('turno sin descansos declarados devuelve 7 días', ({ assert }) => {
    assert.equal(EmployeeTeleworkCalculator.resolveWorkingDaysPerWeek(makeShift('')), 7)
  })

  test('sin turno devuelve null', ({ assert }) => {
    assert.isNull(EmployeeTeleworkCalculator.resolveWorkingDaysPerWeek(null))
    assert.isNull(EmployeeTeleworkCalculator.resolveWorkingDaysPerWeek(undefined))
  })

  test('CSV corrupto devuelve null', ({ assert }) => {
    assert.isNull(EmployeeTeleworkCalculator.resolveWorkingDaysPerWeek(makeShift('abc')))
  })
})

test.group('EmployeeTeleworkCalculator — calculateTeleworkPercentage (tabla canónica §5)', () => {
  test('Onsite devuelve 0.00', ({ assert }) => {
    const p = EmployeeTeleworkCalculator.calculateTeleworkPercentage({
      modality: EMPLOYEE_WORK_SCHEDULE.ONSITE,
      workingDaysPerWeek: 5,
    })
    assert.equal(p, 0.0)
  })

  test('Remote devuelve 100.00', ({ assert }) => {
    const p = EmployeeTeleworkCalculator.calculateTeleworkPercentage({
      modality: EMPLOYEE_WORK_SCHEDULE.REMOTE,
      workingDaysPerWeek: 5,
    })
    assert.equal(p, 100.0)
  })

  test('Hybrid SpecificDays [1,3,5] con 5 laborables devuelve 60.00', ({ assert }) => {
    const p = EmployeeTeleworkCalculator.calculateTeleworkPercentage({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.SPECIFIC_DAYS,
      hybridConfig: { days: [1, 3, 5] },
      workingDaysPerWeek: 5,
    })
    assert.equal(p, 60.0)
  })

  test('Hybrid DaysPerWeek 2 con 5 laborables devuelve 40.00', ({ assert }) => {
    const p = EmployeeTeleworkCalculator.calculateTeleworkPercentage({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.DAYS_PER_WEEK,
      hybridConfig: { count: 2 },
      workingDaysPerWeek: 5,
    })
    assert.equal(p, 40.0)
  })

  test('Hybrid DaysPerWeek 3 con 5 laborables devuelve 60.00', ({ assert }) => {
    const p = EmployeeTeleworkCalculator.calculateTeleworkPercentage({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.DAYS_PER_WEEK,
      hybridConfig: { count: 3 },
      workingDaysPerWeek: 5,
    })
    assert.equal(p, 60.0)
  })

  test('Hybrid DaysPerMonth 10 con 5 laborables devuelve 46.15', ({ assert }) => {
    const p = EmployeeTeleworkCalculator.calculateTeleworkPercentage({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.DAYS_PER_MONTH,
      hybridConfig: { count: 10 },
      workingDaysPerWeek: 5,
    })
    assert.equal(p, 46.15)
  })

  test('Hybrid DaysPerMonth 8 con 5 laborables devuelve 36.92', ({ assert }) => {
    const p = EmployeeTeleworkCalculator.calculateTeleworkPercentage({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.DAYS_PER_MONTH,
      hybridConfig: { count: 8 },
      workingDaysPerWeek: 5,
    })
    assert.equal(p, 36.92)
  })

  test('Hybrid DaysPerWeek 2 con 6 laborables (turno 6x1) devuelve 33.33', ({ assert }) => {
    const p = EmployeeTeleworkCalculator.calculateTeleworkPercentage({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.DAYS_PER_WEEK,
      hybridConfig: { count: 2 },
      workingDaysPerWeek: 6,
    })
    assert.equal(p, 33.33)
  })

  test('umbral legal: DaysPerWeek=2 con 5 laborables NO supera 40% (borde)', ({ assert }) => {
    const p = EmployeeTeleworkCalculator.calculateTeleworkPercentage({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.DAYS_PER_WEEK,
      hybridConfig: { count: 2 },
      workingDaysPerWeek: 5,
    })
    assert.equal(p, 40.0)
    assert.isFalse(p > 40, 'exactamente 40% no debe entrar al listado 5.1')
  })
})

test.group('EmployeeTeleworkCalculator — calculateTeleworkPercentage (clamp defensivo)', () => {
  // Aunque `validateHybridConfig` bloquea configs donde el usuario supera
  // los días laborables, si algún flujo legacy invocara el cálculo sin
  // validar preferimos topar el resultado en 100 en lugar de persistir un
  // porcentaje imposible como 140.
  test('DaysPerWeek con count > workingDaysPerWeek se topa en 100', ({ assert }) => {
    const p = EmployeeTeleworkCalculator.calculateTeleworkPercentage({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.DAYS_PER_WEEK,
      hybridConfig: { count: 7 },
      workingDaysPerWeek: 5,
    })
    assert.equal(p, 100.0)
  })

  test('SpecificDays con más días que workingDaysPerWeek se topa en 100', ({ assert }) => {
    const p = EmployeeTeleworkCalculator.calculateTeleworkPercentage({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.SPECIFIC_DAYS,
      hybridConfig: { days: [1, 2, 3, 4, 5, 6, 7] },
      workingDaysPerWeek: 5,
    })
    assert.equal(p, 100.0)
  })

  test('DaysPerMonth con count > monthlyWorkingDays se topa en 100', ({ assert }) => {
    const p = EmployeeTeleworkCalculator.calculateTeleworkPercentage({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.DAYS_PER_MONTH,
      hybridConfig: { count: 30 },
      workingDaysPerWeek: 5,
    })
    assert.equal(p, 100.0)
  })
})

test.group('EmployeeTeleworkCalculator — calculateTeleworkPercentage (fallbacks seguros)', () => {
  test('Hybrid sin workingDaysPerWeek devuelve 0.00', ({ assert }) => {
    const p = EmployeeTeleworkCalculator.calculateTeleworkPercentage({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.DAYS_PER_WEEK,
      hybridConfig: { count: 2 },
      workingDaysPerWeek: null,
    })
    assert.equal(p, 0.0)
  })

  test('Hybrid sin modo devuelve 0.00', ({ assert }) => {
    const p = EmployeeTeleworkCalculator.calculateTeleworkPercentage({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: null,
      hybridConfig: { count: 2 },
      workingDaysPerWeek: 5,
    })
    assert.equal(p, 0.0)
  })

  test('Hybrid con config incoherente al modo devuelve 0.00', ({ assert }) => {
    const p = EmployeeTeleworkCalculator.calculateTeleworkPercentage({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.SPECIFIC_DAYS,
      hybridConfig: { count: 2 } as unknown as { days: number[] },
      workingDaysPerWeek: 5,
    })
    assert.equal(p, 0.0)
  })
})

test.group('EmployeeTeleworkCalculator — validateHybridConfig', () => {
  test('modalidad no híbrida siempre es ok', ({ assert }) => {
    const result = EmployeeTeleworkCalculator.validateHybridConfig({
      modality: EMPLOYEE_WORK_SCHEDULE.ONSITE,
      hybridMode: null,
      hybridConfig: null,
      workingDaysPerWeek: null,
    })
    assert.isTrue(result.ok)
  })

  test('Híbrido sin turno activo devuelve hybrid_requires_active_shift', ({ assert }) => {
    const result = EmployeeTeleworkCalculator.validateHybridConfig({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.DAYS_PER_WEEK,
      hybridConfig: { count: 2 },
      workingDaysPerWeek: null,
    })
    assert.isFalse(result.ok)
    if (!result.ok) {
      assert.equal(result.code, EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_REQUIRES_ACTIVE_SHIFT)
    }
  })

  test('Híbrido sin modo devuelve hybrid_mode_required', ({ assert }) => {
    const result = EmployeeTeleworkCalculator.validateHybridConfig({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: null,
      hybridConfig: { count: 2 },
      workingDaysPerWeek: 5,
    })
    assert.isFalse(result.ok)
    if (!result.ok) {
      assert.equal(result.code, EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_MODE_REQUIRED)
    }
  })

  test('Híbrido sin config devuelve hybrid_config_required', ({ assert }) => {
    const result = EmployeeTeleworkCalculator.validateHybridConfig({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.DAYS_PER_WEEK,
      hybridConfig: null,
      workingDaysPerWeek: 5,
    })
    assert.isFalse(result.ok)
    if (!result.ok) {
      assert.equal(result.code, EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_CONFIG_REQUIRED)
    }
  })

  test('SpecificDays con día que coincide con restDays devuelve hybrid_days_intersect_rest_days', ({
    assert,
  }) => {
    // Turno descansa sábado (6) y domingo (7). Días específicos incluyen sábado.
    const result = EmployeeTeleworkCalculator.validateHybridConfig({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.SPECIFIC_DAYS,
      hybridConfig: { days: [3, 6] },
      workingDaysPerWeek: 5,
      restDays: [6, 7],
    })
    assert.isFalse(result.ok)
    if (!result.ok) {
      assert.equal(
        result.code,
        EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_DAYS_INTERSECT_REST_DAYS
      )
    }
  })

  test('SpecificDays con arreglo vacío devuelve hybrid_zero_equals_onsite', ({ assert }) => {
    const result = EmployeeTeleworkCalculator.validateHybridConfig({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.SPECIFIC_DAYS,
      hybridConfig: { days: [] },
      workingDaysPerWeek: 5,
      restDays: [6, 7],
    })
    assert.isFalse(result.ok)
    if (!result.ok) {
      assert.equal(result.code, EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_ZERO_EQUALS_ONSITE)
    }
  })

  test('SpecificDays con todos los días laborables devuelve hybrid_full_equals_remote', ({
    assert,
  }) => {
    // Turno descansa 6,7; el empleado marca los 5 días laborales L-V.
    const result = EmployeeTeleworkCalculator.validateHybridConfig({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.SPECIFIC_DAYS,
      hybridConfig: { days: [1, 2, 3, 4, 5] },
      workingDaysPerWeek: 5,
      restDays: [6, 7],
    })
    assert.isFalse(result.ok)
    if (!result.ok) {
      assert.equal(result.code, EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_FULL_EQUALS_REMOTE)
    }
  })

  test('SpecificDays con día fuera de rango [1..7] devuelve hybrid_config_invalid_shape', ({
    assert,
  }) => {
    const result = EmployeeTeleworkCalculator.validateHybridConfig({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.SPECIFIC_DAYS,
      hybridConfig: { days: [0, 3] },
      workingDaysPerWeek: 5,
      restDays: [6, 7],
    })
    assert.isFalse(result.ok)
    if (!result.ok) {
      assert.equal(
        result.code,
        EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_CONFIG_INVALID_SHAPE
      )
    }
  })

  test('DaysPerWeek=0 devuelve hybrid_zero_equals_onsite', ({ assert }) => {
    const result = EmployeeTeleworkCalculator.validateHybridConfig({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.DAYS_PER_WEEK,
      hybridConfig: { count: 0 },
      workingDaysPerWeek: 5,
    })
    assert.isFalse(result.ok)
    if (!result.ok) {
      assert.equal(result.code, EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_ZERO_EQUALS_ONSITE)
    }
  })

  test('DaysPerWeek igual a los días laborables devuelve hybrid_full_equals_remote', ({
    assert,
  }) => {
    const result = EmployeeTeleworkCalculator.validateHybridConfig({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.DAYS_PER_WEEK,
      hybridConfig: { count: 5 },
      workingDaysPerWeek: 5,
    })
    assert.isFalse(result.ok)
    if (!result.ok) {
      assert.equal(result.code, EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_FULL_EQUALS_REMOTE)
    }
  })

  test('DaysPerMonth con count > (monthlyWorkingDays - 1) devuelve hybrid_full_equals_remote', ({ assert }) => {
    // 5 días × 4.333 = 21.66; max válido = floor(21.66 - 1) = 20.
    // count=21 supera el umbral (aunque no llegue a 21.66) porque el spec
    // reserva al menos 1 día presencial en promedio al mes.
    const result = EmployeeTeleworkCalculator.validateHybridConfig({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.DAYS_PER_MONTH,
      hybridConfig: { count: 21 },
      workingDaysPerWeek: 5,
    })
    assert.isFalse(result.ok)
    if (!result.ok) {
      assert.equal(result.code, EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_FULL_EQUALS_REMOTE)
    }
  })

  test('DaysPerMonth con count = (monthlyWorkingDays - 1) es válido (borde)', ({ assert }) => {
    // Para 5 días: max = 20. Debe aceptarse.
    const result = EmployeeTeleworkCalculator.validateHybridConfig({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.DAYS_PER_MONTH,
      hybridConfig: { count: 20 },
      workingDaysPerWeek: 5,
    })
    assert.isTrue(result.ok)
  })

  test('SpecificDays con configuración correcta es válida', ({ assert }) => {
    // Descansa 6,7 (sáb+dom); los días específicos [1,3,5] = L, Mié, V.
    const result = EmployeeTeleworkCalculator.validateHybridConfig({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.SPECIFIC_DAYS,
      hybridConfig: { days: [1, 3, 5] },
      workingDaysPerWeek: 5,
      restDays: [6, 7],
    })
    assert.isTrue(result.ok)
  })

  test('DaysPerWeek con configuración correcta es válida', ({ assert }) => {
    const result = EmployeeTeleworkCalculator.validateHybridConfig({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.DAYS_PER_WEEK,
      hybridConfig: { count: 3 },
      workingDaysPerWeek: 5,
    })
    assert.isTrue(result.ok)
  })

  test('config con shape inválido (falta days/count) devuelve hybrid_config_invalid_shape', ({
    assert,
  }) => {
    const result = EmployeeTeleworkCalculator.validateHybridConfig({
      modality: EMPLOYEE_WORK_SCHEDULE.HYBRID,
      hybridMode: EMPLOYEE_HYBRID_MODE.DAYS_PER_WEEK,
      hybridConfig: {} as unknown as { count: number },
      workingDaysPerWeek: 5,
    })
    assert.isFalse(result.ok)
    if (!result.ok) {
      assert.equal(
        result.code,
        EMPLOYEE_WORK_SCHEDULE_ERROR_CODES.HYBRID_CONFIG_INVALID_SHAPE
      )
    }
  })
})

test.group('EmployeeTeleworkCalculator — roundToTwoDecimals', () => {
  test('valores finitos redondean a 2 decimales', ({ assert }) => {
    assert.equal(EmployeeTeleworkCalculator.roundToTwoDecimals(1.005), 1.01)
    assert.equal(EmployeeTeleworkCalculator.roundToTwoDecimals(1.004), 1.0)
    assert.equal(EmployeeTeleworkCalculator.roundToTwoDecimals(0.126), 0.13)
  })

  test('NaN e Infinity devuelven 0.00', ({ assert }) => {
    assert.equal(EmployeeTeleworkCalculator.roundToTwoDecimals(Number.NaN), 0.0)
    assert.equal(EmployeeTeleworkCalculator.roundToTwoDecimals(Number.POSITIVE_INFINITY), 0.0)
  })
})
