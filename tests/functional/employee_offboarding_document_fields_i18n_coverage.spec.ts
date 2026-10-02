import { readFile } from 'node:fs/promises'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import {
  OFFBOARDING_DOCUMENT_FIELDS,
  fieldsForDocumentType,
} from '#modules/employee-offboarding/documents/document_fields.constants'
import {
  DERIVED_FIELD_DEPENDENCIES,
  LEGACY_FIELD_GUARD_LABEL_KEY,
  resolveRequiredFieldKeys,
  type EmployeeOffboardingDocumentType,
} from '#modules/employee-offboarding/documents/documents.constants'
import { EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE } from '#modules/employee-offboarding/documents/documents.constants'
import { collectMissingDocumentFields } from '#modules/employee-offboarding/documents/separation_letter_pdf.service'
import type { OffboardingDocumentField } from '#modules/employee-offboarding/documents/document_fields.constants'

/**
 * USRH1789097550392 — red que sustituye la garantía de compilación perdida
 * (CA-8): ningún campo del catálogo se queda mudo en es ni en en, y la lista
 * consciente de capturables opcionales no crece por descuido. Incluye además
 * la tabla de la función pura de la lista efectiva (CA-4) y de la guarda.
 */

const DOCUMENT_TYPE = EMPLOYEE_OFFBOARDING_DOCUMENT_TYPE.SEPARATION_LETTER

/** Capturables que el catálogo declara opcionales a propósito: agregar otro es una decisión. */
const OPTIONAL_CAPTURABLE_FIELDS = ['trade_name', 'department_or_unit']

const LEGACY_REQUIRED_ORDER = [
  'legal_name',
  'employee_name',
  'position_name',
  'hire_date',
  'separation_date',
]

async function loadLang(lang: string): Promise<Record<string, unknown>> {
  const raw = await readFile(app.makePath('resources', 'langs', `${lang}.json`), 'utf8')
  return JSON.parse(raw) as Record<string, unknown>
}

function isFilled(messages: Record<string, unknown>, key: string): boolean {
  const value = messages[key]
  return typeof value === 'string' && value.trim().length > 0
}

test.group('Cobertura i18n del catálogo de campos (USRH1789097550392)', () => {
  test('CA-8: toda etiqueta y toda pestaña de captura existen y no están vacías en es y en', async ({
    assert,
  }) => {
    const langs = await Promise.all([loadLang('es'), loadLang('en')])
    for (const field of OFFBOARDING_DOCUMENT_FIELDS) {
      for (const [index, messages] of langs.entries()) {
        const lang = index === 0 ? 'es' : 'en'
        assert.isTrue(
          isFilled(messages, field.labelKey),
          `${field.key}: ${field.labelKey} en ${lang}`
        )
        if (field.captureTabLabelKey !== null) {
          assert.isTrue(
            isFilled(messages, field.captureTabLabelKey),
            `${field.key}: ${field.captureTabLabelKey} en ${lang}`
          )
        }
      }
    }
  })

  test('CA-8: las frases vivas de los cinco campos históricos existen en es y en', async ({
    assert,
  }) => {
    const langs = await Promise.all([loadLang('es'), loadLang('en')])
    for (const [key, guardKey] of Object.entries(LEGACY_FIELD_GUARD_LABEL_KEY)) {
      for (const messages of langs) {
        assert.isTrue(isFilled(messages, guardKey), `${key}: ${guardKey}`)
      }
    }
    assert.sameMembers(Object.keys(LEGACY_FIELD_GUARD_LABEL_KEY), LEGACY_REQUIRED_ORDER)
  })

  test('CA-8: un capturable opcional fuera de la lista consciente es una decisión, no un descuido', ({
    assert,
  }) => {
    const optionalCapturable = OFFBOARDING_DOCUMENT_FIELDS.filter(
      (field) => !field.requiredInTemplate && field.captureTabLabelKey !== null
    ).map((field) => field.key)
    assert.sameMembers(optionalCapturable, OPTIONAL_CAPTURABLE_FIELDS)
  })

  test('las dependencias de los calculados apuntan a campos capturables del catálogo', ({
    assert,
  }) => {
    for (const [derived, dependencies] of Object.entries(DERIVED_FIELD_DEPENDENCIES)) {
      assert.exists(
        OFFBOARDING_DOCUMENT_FIELDS.find((field) => field.key === derived),
        derived
      )
      for (const dependency of dependencies) {
        const target = OFFBOARDING_DOCUMENT_FIELDS.find((field) => field.key === dependency)
        assert.exists(target, `${derived} → ${dependency}`)
        assert.isNotNull(target?.captureTabLabelKey, `${derived} → ${dependency}`)
      }
    }
  })
})

test.group('Lista efectiva y guarda (USRH1789097550392)', () => {
  test('sin plantilla propia: exactamente los cinco de hoy, en el orden del catálogo', ({
    assert,
  }) => {
    assert.deepEqual(
      resolveRequiredFieldKeys(DOCUMENT_TYPE, null, OFFBOARDING_DOCUMENT_FIELDS),
      LEGACY_REQUIRED_ORDER
    )
  })

  test('con plantilla: solo los indispensables capturables que usa, sin los que provee el sistema ni los opcionales', ({
    assert,
  }) => {
    const recognized = ['folio', 'trade_name', 'legal_name', 'employee_name', 'issue_date']
    assert.deepEqual(
      resolveRequiredFieldKeys(DOCUMENT_TYPE, recognized, OFFBOARDING_DOCUMENT_FIELDS),
      ['legal_name', 'employee_name']
    )
  })

  test('con plantilla: la antigüedad arrastra las dos fechas y la adscripción arrastra la razón social', ({
    assert,
  }) => {
    assert.deepEqual(
      resolveRequiredFieldKeys(
        DOCUMENT_TYPE,
        ['seniority', 'employee_name'],
        OFFBOARDING_DOCUMENT_FIELDS
      ),
      ['employee_name', 'hire_date', 'separation_date']
    )
    assert.deepEqual(
      resolveRequiredFieldKeys(DOCUMENT_TYPE, ['department_or_unit'], OFFBOARDING_DOCUMENT_FIELDS),
      ['legal_name']
    )
  })

  test('el orden es el del catálogo aunque la plantilla los declare al revés, y sin duplicados', ({
    assert,
  }) => {
    const reversed = [...fieldsForDocumentType(DOCUMENT_TYPE)].reverse().map((field) => field.key)
    assert.deepEqual(
      resolveRequiredFieldKeys(
        DOCUMENT_TYPE,
        [...reversed, ...reversed],
        OFFBOARDING_DOCUMENT_FIELDS
      ),
      LEGACY_REQUIRED_ORDER
    )
  })

  test('CA-4: un campo capturable fuera de los cinco entra en su orden y la guarda lo trata como a cualquier otro', ({
    assert,
  }) => {
    const catalog: readonly OffboardingDocumentField[] = [
      ...OFFBOARDING_DOCUMENT_FIELDS.slice(0, 2),
      {
        key: 'legal_address',
        labelKey: 'employee_offboarding_document_field_label_legal_address',
        requiredInTemplate: true,
        captureTabLabelKey: 'employee_offboarding_document_field_capture_tab_billing',
        documentTypes: [DOCUMENT_TYPE] as readonly EmployeeOffboardingDocumentType[],
        source: 'business_units.legal_address',
      },
      ...OFFBOARDING_DOCUMENT_FIELDS.slice(2),
    ]
    const required = resolveRequiredFieldKeys(
      DOCUMENT_TYPE,
      ['legal_name', 'legal_address', 'employee_name'],
      catalog
    )
    // Orden de declaración del catálogo de prueba: el campo nuevo va donde se declaró
    assert.deepEqual(required, ['legal_name', 'legal_address', 'employee_name'])
    // Fail-closed: la clave exigida que no viene en los valores cuenta como faltante
    const missing = collectMissingDocumentFields(required, {
      legal_name: 'Empresa SA',
      employee_name: '',
    })
    assert.deepEqual(missing, ['legal_address', 'employee_name'])
  })

  test('la guarda devuelve en el orden de la lista y trata vacío, nulo y ausente igual', ({
    assert,
  }) => {
    const required = resolveRequiredFieldKeys(DOCUMENT_TYPE, null, OFFBOARDING_DOCUMENT_FIELDS)
    assert.deepEqual(
      collectMissingDocumentFields(required, {
        legal_name: '   ',
        employee_name: 'Ana',
        position_name: null,
        separation_date: '2026-07-31',
      }),
      ['legal_name', 'position_name', 'hire_date']
    )
    assert.deepEqual(
      collectMissingDocumentFields(required, {
        legal_name: 'Empresa',
        employee_name: 'Ana',
        position_name: 'Analista',
        hire_date: '2019-04-15',
        separation_date: '2026-07-31',
      }),
      []
    )
  })
})
