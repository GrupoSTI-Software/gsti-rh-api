import { test } from '@japa/runner'
import { PDF_TEMPLATE_DETAIL_MAX_LENGTH } from '#helpers/pdf_template_safety'
import { OFFBOARDING_DOCUMENT_FIELDS } from '#modules/employee-offboarding/documents/document_fields.constants'
import {
  levenshteinDistance,
  suggestFieldKey,
  SUGGESTION_MAX_DISTANCE,
  validateTemplateFields,
} from '#modules/employee-offboarding/documents/document_template_validation.service'
import { EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE } from '#modules/employee-offboarding/documents/documents.constants'
import {
  ALL_CATALOG_FIELD_NAMES,
  MISSING_HIRE_DATE_FIELD_NAMES,
  VALID_TEMPLATE_FIELD_NAMES,
} from '../../../fixtures/pdf-templates/build_pdf_template_fixtures.js'

/**
 * USRH1789097550388 — el contraste y la sugerencia en aislamiento (sin BD,
 * sin i18n, sin PDF): tabla de distancias del Anexo D, umbral y empates de
 * la sugerencia, las tres listas y su orden, colapso de repetidos, saneado
 * y determinismo. Vigila además que las fixtures del generador sigan al
 * catálogo.
 */

const DOCUMENT_TYPE = EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.SEPARATION_LETTER
const CHECKED_AT = '2026-09-17T12:00:00.000Z'
const CATALOG_KEYS = OFFBOARDING_DOCUMENT_FIELDS.map((field) => field.key)
const REQUIRED_KEYS = OFFBOARDING_DOCUMENT_FIELDS.filter((field) => field.requiredInTemplate).map(
  (field) => field.key
)

function nearestDistance(name: string): number {
  return Math.min(...CATALOG_KEYS.map((key) => levenshteinDistance(name, key)))
}

test.group('document_template_validation — distancia y sugerencia', () => {
  test('levenshteinDistance: casos de referencia, por puntos de código', ({ assert }) => {
    assert.strictEqual(levenshteinDistance('', ''), 0)
    assert.strictEqual(levenshteinDistance('', 'abc'), 3)
    assert.strictEqual(levenshteinDistance('abc', ''), 3)
    assert.strictEqual(levenshteinDistance('abc', 'abc'), 0)
    assert.strictEqual(levenshteinDistance('kitten', 'sitting'), 3)
    assert.strictEqual(levenshteinDistance('flaw', 'lawn'), 2)
    assert.strictEqual(levenshteinDistance('año', 'ano'), 1)
  })

  test('tabla del Anexo D: employe_name está a 1 del catálogo y nombre_empleado a 11', ({
    assert,
  }) => {
    assert.strictEqual(levenshteinDistance('employe_name', 'employee_name'), 1)
    assert.strictEqual(nearestDistance('employe_name'), 1)
    assert.strictEqual(levenshteinDistance('nombre_empleado', 'hire_date'), 11)
    assert.strictEqual(nearestDistance('nombre_empleado'), 11)
  })

  test('suggestFieldKey: sugiere solo con parecido real', ({ assert }) => {
    assert.strictEqual(suggestFieldKey('employe_name', CATALOG_KEYS), 'employee_name')
    assert.strictEqual(suggestFieldKey('Employee_Name', CATALOG_KEYS), 'employee_name')
    assert.strictEqual(suggestFieldKey('hire-date', CATALOG_KEYS), 'hire_date')
    assert.strictEqual(suggestFieldKey('separationdate', CATALOG_KEYS), 'separation_date')
    assert.strictEqual(suggestFieldKey('trade name', CATALOG_KEYS), 'trade_name')
    assert.strictEqual(suggestFieldKey('folip', CATALOG_KEYS), 'folio')

    assert.isNull(suggestFieldKey('nombre_empleado', CATALOG_KEYS))
    assert.isNull(suggestFieldKey('fecha_ingreso', CATALOG_KEYS))
    assert.isNull(suggestFieldKey('employee_full_name', CATALOG_KEYS))
    assert.isNull(suggestFieldKey('rfc', CATALOG_KEYS))
    // `folio` (5 letras) admite una sola edición: `fol` está a 2
    assert.isNull(suggestFieldKey('fol', CATALOG_KEYS))
    // `position` empata a 5 entre `folio` y `position_name`, y además excede el umbral
    assert.isNull(suggestFieldKey('position', CATALOG_KEYS))
  })

  test('suggestFieldKey: tope absoluto de 3, empate y lista vacía → null', ({ assert }) => {
    assert.strictEqual(SUGGESTION_MAX_DISTANCE, 3)
    // `department_or_unit` (18) toparía en 6 por largo; el tope absoluto lo deja en 3
    assert.strictEqual(suggestFieldKey('department_or_u', CATALOG_KEYS), 'department_or_unit')
    assert.isNull(suggestFieldKey('department_or_', CATALOG_KEYS))
    assert.isNull(suggestFieldKey('department', CATALOG_KEYS))
    // Empate dentro del umbral: dos candidatos a 1 → sin sugerencia
    assert.isNull(suggestFieldKey('abcdex', ['abcdef', 'abcdeg']))
    assert.strictEqual(suggestFieldKey('abcdex', ['abcdef', 'zzzzzz']), 'abcdef')
    assert.isNull(suggestFieldKey('employe_name', []))
  })
})

test.group('document_template_validation — contraste', () => {
  test('las fixtures del generador siguen al catálogo', ({ assert }) => {
    assert.deepEqual([...ALL_CATALOG_FIELD_NAMES], CATALOG_KEYS)
    assert.deepEqual([...VALID_TEMPLATE_FIELD_NAMES], REQUIRED_KEYS)
    assert.deepEqual(
      [...MISSING_HIRE_DATE_FIELD_NAMES],
      REQUIRED_KEYS.filter((key) => key !== 'hire_date')
    )
  })

  test('los diez del catálogo, desordenados → pasa con recognized en orden de catálogo', ({
    assert,
  }) => {
    const shuffled = [...ALL_CATALOG_FIELD_NAMES].reverse()
    const result = validateTemplateFields(shuffled, DOCUMENT_TYPE, CHECKED_AT)
    assert.deepEqual(result, {
      checkedAt: CHECKED_AT,
      documentType: DOCUMENT_TYPE,
      passed: true,
      recognized: CATALOG_KEYS,
      unrecognized: [],
      missingRequired: [],
    })
  })

  test('solo los seis obligatorios → pasa; los opcionales no se reclaman', ({ assert }) => {
    const result = validateTemplateFields(VALID_TEMPLATE_FIELD_NAMES, DOCUMENT_TYPE, CHECKED_AT)
    assert.isTrue(result.passed)
    assert.deepEqual(result.recognized, REQUIRED_KEYS)
    assert.deepEqual(result.unrecognized, [])
    assert.deepEqual(result.missingRequired, [])
  })

  test('employe_name → no reconocido con sugerencia employee_name (regla 4)', ({ assert }) => {
    const result = validateTemplateFields(
      [...VALID_TEMPLATE_FIELD_NAMES, 'employe_name'],
      DOCUMENT_TYPE,
      CHECKED_AT
    )
    assert.isFalse(result.passed)
    assert.deepEqual(result.recognized, REQUIRED_KEYS)
    assert.deepEqual(result.unrecognized, [
      { fieldName: 'employe_name', suggestedFieldKey: 'employee_name' },
    ])
    assert.deepEqual(result.missingRequired, [])
  })

  test('nombre_empleado → no reconocido sin sugerencia (regla 4)', ({ assert }) => {
    const result = validateTemplateFields(
      [...VALID_TEMPLATE_FIELD_NAMES, 'nombre_empleado'],
      DOCUMENT_TYPE,
      CHECKED_AT
    )
    assert.isFalse(result.passed)
    assert.deepEqual(result.unrecognized, [
      { fieldName: 'nombre_empleado', suggestedFieldKey: null },
    ])
    assert.deepEqual(result.missingRequired, [])
  })

  test('sin hire_date → obligatorio ausente y ningún no reconocido', ({ assert }) => {
    const result = validateTemplateFields(MISSING_HIRE_DATE_FIELD_NAMES, DOCUMENT_TYPE, CHECKED_AT)
    assert.isFalse(result.passed)
    assert.deepEqual(result.recognized, [...MISSING_HIRE_DATE_FIELD_NAMES])
    assert.deepEqual(result.unrecognized, [])
    assert.deepEqual(result.missingRequired, ['hire_date'])
  })

  test('ambas fallas a la vez → las dos listas pobladas y passed=false', ({ assert }) => {
    const result = validateTemplateFields(
      [...MISSING_HIRE_DATE_FIELD_NAMES, 'employe_name'],
      DOCUMENT_TYPE,
      CHECKED_AT
    )
    assert.isFalse(result.passed)
    assert.deepEqual(result.unrecognized, [
      { fieldName: 'employe_name', suggestedFieldKey: 'employee_name' },
    ])
    assert.deepEqual(result.missingRequired, ['hire_date'])
  })

  test('varios obligatorios ausentes salen en orden de catálogo (regla 7)', ({ assert }) => {
    const result = validateTemplateFields(['folio', 'seniority'], DOCUMENT_TYPE, CHECKED_AT)
    assert.deepEqual(result.recognized, ['seniority', 'folio'])
    assert.deepEqual(
      result.missingRequired,
      REQUIRED_KEYS.filter((key) => key !== 'folio')
    )
  })

  test('los no reconocidos conservan el orden de aparición en el archivo (regla 7)', ({
    assert,
  }) => {
    const result = validateTemplateFields(
      ['zzz', 'employee_name', 'aaa', 'mmm'],
      DOCUMENT_TYPE,
      CHECKED_AT
    )
    assert.deepEqual(
      result.unrecognized.map((entry) => entry.fieldName),
      ['zzz', 'aaa', 'mmm']
    )
  })

  test('los repetidos se cuentan una sola vez, también tras sanear espacios (regla 8)', ({
    assert,
  }) => {
    const result = validateTemplateFields(
      ['employee_name', 'employee_name', ' employee_name ', 'xxx', 'xxx'],
      DOCUMENT_TYPE,
      CHECKED_AT
    )
    assert.deepEqual(result.recognized, ['employee_name'])
    assert.deepEqual(result.unrecognized, [{ fieldName: 'xxx', suggestedFieldKey: null }])
  })

  test('el nombre se cita saneado y truncado a 120, nunca reescrito (regla 3)', ({ assert }) => {
    const long = `campo_${'x'.repeat(300)}`
    const result = validateTemplateFields(
      [long, '\u202Eemploye_name', 'ab\u0007c'],
      DOCUMENT_TYPE,
      CHECKED_AT
    )
    const names = result.unrecognized.map((entry) => entry.fieldName)
    assert.strictEqual(names[0].length, PDF_TEMPLATE_DETAIL_MAX_LENGTH)
    assert.strictEqual(names[0], long.slice(0, PDF_TEMPLATE_DETAIL_MAX_LENGTH))
    assert.strictEqual(names[1], 'employe_name')
    assert.strictEqual(result.unrecognized[1].suggestedFieldKey, 'employee_name')
    assert.strictEqual(names[2], 'abc')
  })

  test('un campo sin nombre queda como no reconocido y sin sugerencia', ({ assert }) => {
    const result = validateTemplateFields([''], DOCUMENT_TYPE, CHECKED_AT)
    assert.deepEqual(result.unrecognized, [{ fieldName: '', suggestedFieldKey: null }])
  })

  test('determinista: mismas entradas → mismo dictamen (regla 7)', ({ assert }) => {
    const names = [...MISSING_HIRE_DATE_FIELD_NAMES, 'employe_name', 'nombre_empleado']
    const first = validateTemplateFields(names, DOCUMENT_TYPE, CHECKED_AT)
    const second = validateTemplateFields([...names], DOCUMENT_TYPE, CHECKED_AT)
    assert.deepEqual(first, second)
  })
})
