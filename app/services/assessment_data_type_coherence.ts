import {
  ASSESSMENT_TEMPLATE_DIMENSION_DATA_TYPES,
  type AssessmentTemplateDimensionDataType,
} from '#models/assessment_template_dimension'
import {
  ASSESSMENT_CATEGORICAL_VALUES,
  type AssessmentCategoricalValue,
} from '#models/position_assessment_profile'

/**
 * Resultado de una verificación de coherencia entre un payload y el tipo
 * de dato de la dimensión (`assessmentTemplateDimensionDataType`).
 *
 * Cuando `ok` es `false`, `reason` indica un código de error estable que se
 * usa para construir respuestas 422 con `key` consistente:
 *
 *  - `range-required-for-numeric` / `-for-percent`: faltó min o max.
 *  - `range-min-greater-than-max`: min mayor que max.
 *  - `percent-out-of-bounds`: min/max fuera de [0,100].
 *  - `expected-value-required`: faltó expectedValue para categorical_amb.
 *  - `expected-value-not-allowed`: se envió expectedValue para tipo no categórico.
 *  - `range-not-allowed-for-categorical`: se enviaron min/max en categorical_amb.
 *  - `categorical-value-invalid`: expectedValue fuera del enum AMB.
 *  - `numeric-value-required`: el valor del empleado no es numérico parseable.
 *  - `categorical-value-mismatch-enum`: el valor del empleado no es high/medium/low.
 *  - `percent-value-out-of-bounds`: el valor del empleado está fuera de [0,100].
 */
export interface CoherenceResult {
  ok: boolean
  reason?: string
}

const NUMERIC_OK: CoherenceResult = { ok: true }

function fail(reason: string): CoherenceResult {
  return { ok: false, reason }
}

/**
 * Verifica que un payload de perfil de puesto sea coherente con el tipo
 * de dato declarado en la dimensión.
 *
 * Reglas:
 *  - `numeric` y `percent`: requieren `min` y `max`, ambos números >= 0,
 *    con `min <= max`. Para `percent` además min/max deben caer en [0,100].
 *    No se permite `expectedValue`.
 *  - `categorical_amb`: requiere `expectedValue` dentro del enum AMB y
 *    NO permite `min`/`max` (la API los acepta como `null`).
 */
export function checkPositionProfileCoherence(
  dataType: AssessmentTemplateDimensionDataType,
  payload: {
    minimumValue?: number | null
    maximumValue?: number | null
    expectedValue?: AssessmentCategoricalValue | string | null
  }
): CoherenceResult {
  const min = payload.minimumValue ?? null
  const max = payload.maximumValue ?? null
  const expected = payload.expectedValue ?? null

  if (dataType === 'numeric' || dataType === 'percent') {
    if (expected !== null && expected !== undefined) {
      return fail('expected-value-not-allowed')
    }
    if (min === null || max === null) {
      return fail(
        dataType === 'percent' ? 'range-required-for-percent' : 'range-required-for-numeric'
      )
    }
    if (Number(min) > Number(max)) {
      return fail('range-min-greater-than-max')
    }
    if (dataType === 'percent') {
      if (Number(min) < 0 || Number(min) > 100 || Number(max) < 0 || Number(max) > 100) {
        return fail('percent-out-of-bounds')
      }
    }
    return NUMERIC_OK
  }

  if (dataType === 'categorical_amb') {
    if (min !== null && min !== undefined) {
      return fail('range-not-allowed-for-categorical')
    }
    if (max !== null && max !== undefined) {
      return fail('range-not-allowed-for-categorical')
    }
    if (!expected) {
      return fail('expected-value-required')
    }
    if (
      !ASSESSMENT_CATEGORICAL_VALUES.includes(expected as AssessmentCategoricalValue)
    ) {
      return fail('categorical-value-invalid')
    }
    return NUMERIC_OK
  }

  // Defensa: si llega un dataType desconocido, lo reportamos.
  if (!ASSESSMENT_TEMPLATE_DIMENSION_DATA_TYPES.includes(dataType)) {
    return fail('data-type-unknown')
  }
  return NUMERIC_OK
}

/**
 * Verifica que el valor capturado para una evaluación de empleado sea
 * coherente con el tipo de dato de la dimensión correspondiente.
 *
 * Reglas:
 *  - Valor `null` o cadena vacía: se considera "sin captura" → ok (status null).
 *  - `numeric`: el valor debe ser parseable como número finito.
 *  - `percent`: numérico parseable y dentro de [0,100].
 *  - `categorical_amb`: debe ser exactamente uno de high/medium/low.
 */
export function checkEmployeeAssessmentValueCoherence(
  dataType: AssessmentTemplateDimensionDataType,
  rawValue: string | null | undefined
): CoherenceResult {
  const value = rawValue ?? null
  if (value === null || value.trim() === '') {
    return NUMERIC_OK
  }

  if (dataType === 'numeric' || dataType === 'percent') {
    const parsed = Number.parseFloat(value)
    if (!Number.isFinite(parsed)) {
      return fail('numeric-value-required')
    }
    if (dataType === 'percent' && (parsed < 0 || parsed > 100)) {
      return fail('percent-value-out-of-bounds')
    }
    return NUMERIC_OK
  }

  if (dataType === 'categorical_amb') {
    if (!ASSESSMENT_CATEGORICAL_VALUES.includes(value as AssessmentCategoricalValue)) {
      return fail('categorical-value-mismatch-enum')
    }
    return NUMERIC_OK
  }

  return NUMERIC_OK
}
