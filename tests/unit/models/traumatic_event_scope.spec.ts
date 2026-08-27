import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from '@japa/runner'
import { assertModelHasColumns } from '../helpers/lucid_model_assertions.js'
import TraumaticEventReport from '#models/traumatic_event_report'
import TraumaticEventExam from '#models/traumatic_event_exam'
import TraumaticEventReferral from '#models/traumatic_event_referral'
import TraumaticEventReportEvidence from '#models/traumatic_event_report_evidence'

/**
 * USRH1786595131490 — marca propia de empresa en el reporte de evento
 * traumático y sus anexos. Defensa en profundidad: columna + mixin + hook.
 */

const MODELS_DIR = join(process.cwd(), 'app/models')

const PARENT = {
  fileName: 'traumatic_event_report.ts',
  Model: TraumaticEventReport,
  parentLabel: 'el empleado del reporte',
} as const

const CHILDREN = [
  {
    fileName: 'traumatic_event_exam.ts',
    Model: TraumaticEventExam,
  },
  {
    fileName: 'traumatic_event_referral.ts',
    Model: TraumaticEventReferral,
  },
  {
    fileName: 'traumatic_event_report_evidence.ts',
    Model: TraumaticEventReportEvidence,
  },
] as const

test.group('Eventos traumáticos — modelos componen withBusinessUnitScope', () => {
  for (const { fileName, Model } of [PARENT, ...CHILDREN]) {
    test(`${fileName} importa y compone withBusinessUnitScope()`, ({ assert }) => {
      const content = readFileSync(join(MODELS_DIR, fileName), 'utf-8')

      assert.include(
        content,
        "import { withBusinessUnitScope } from '#mixins/with_business_unit_scope'"
      )
      assert.include(content, 'withBusinessUnitScope()')
      assert.notInclude(content, 'includeGlobal')
      assertModelHasColumns(assert, Model, ['businessUnitId'])
    })
  }

  test('el reporte resuelve la marca desde el empleado, no del payload', ({ assert }) => {
    const content = readFileSync(join(MODELS_DIR, PARENT.fileName), 'utf-8')

    assert.include(content, '@beforeCreate()')
    assert.include(content, 'resolveParentBusinessUnitId(')
    assert.include(content, "Employee.query().where('employeeId', instance.employeeId)")
    assert.include(content, PARENT.parentLabel)
  })

  for (const { fileName } of CHILDREN) {
    test(`${fileName} hereda la marca del reporte padre`, ({ assert }) => {
      const content = readFileSync(join(MODELS_DIR, fileName), 'utf-8')

      assert.include(content, '@beforeCreate()')
      assert.include(content, 'resolveParentBusinessUnitId(')
      assert.include(
        content,
        "TraumaticEventReport.query()\n          .where('traumaticEventReportId', instance.traumaticEventReportId)"
      )
      assert.include(content, 'el reporte de evento traumático')
    })
  }

  test('evidencias conservan static readonly table', ({ assert }) => {
    const content = readFileSync(
      join(MODELS_DIR, 'traumatic_event_report_evidence.ts'),
      'utf-8'
    )
    assert.include(content, "static readonly table = 'traumatic_event_report_evidences'")
  })
})

test.group('Eventos traumáticos — serializadores no exponen la marca', () => {
  test('serializeReport / exam / referral / toRow no incluyen businessUnitId', ({ assert }) => {
    const files = [
      'app/services/traumatic_event_report_service.ts',
      'app/services/traumatic_event_exam_service.ts',
      'app/services/traumatic_event_referral_service.ts',
      'app/services/traumatic_event_report_evidence_service.ts',
    ]
    for (const relative of files) {
      const content = readFileSync(join(process.cwd(), relative), 'utf-8')
      assert.notInclude(
        content,
        'businessUnitId:',
        `${relative} no debe serializar businessUnitId`
      )
    }
  })
})
