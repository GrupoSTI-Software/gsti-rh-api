import { test } from '@japa/runner'
import { createHash } from 'node:crypto'
import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import {
  inspectPdfTemplate,
  PDF_TEMPLATE_DETAIL_MAX_LENGTH,
  PDF_TEMPLATE_MAX_FIELDS,
  PDF_TEMPLATE_MAX_PAGES,
  sanitizeVerdictDetail,
  type PdfTemplateInspection,
} from '#helpers/pdf_template_safety'
import {
  buildBidiFieldName,
  buildCheckboxNamedEmployeeName,
  buildControlCharFieldName,
  buildDuplicateFieldDifferentType,
  buildEncrypted,
  buildManyPagesAndFields,
  buildMultiWidgetField,
  buildNoFields,
  buildSignatureField,
  buildValidTemplate,
  buildWithCatalogAdditionalActions,
  buildWithEmbeddedFile,
  buildWithFieldAdditionalActions,
  buildWithJavascriptNameTree,
  buildWithOpenAction,
  buildWithWidgetAction,
  buildWithWidgetAdditionalActions,
  buildXfa,
  PDF_TEMPLATE_FIXTURES,
  VALID_TEMPLATE_FIELD_NAMES,
  WIDGET_ACTION_KINDS,
} from '../../fixtures/pdf-templates/build_pdf_template_fixtures.js'

/**
 * USRH1789097550387 — cada detector de la revisión estructural contra su
 * fixture, la plantilla válida que pasa, el orden obligatorio de la detección
 * de XFA y el determinismo del generador.
 */

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/** Estrecha al veredicto de rechazo; falla la prueba si la plantilla pasó. */
function expectRejected(inspection: PdfTemplateInspection) {
  if (inspection.ok) {
    throw new Error('Se esperaba un rechazo y la plantilla pasó')
  }
  return inspection
}

test.group('pdf_template_safety — rechazos estructurales', () => {
  test('sin campos rellenables → no_form_fields', async ({ assert }) => {
    const verdict = expectRejected(await inspectPdfTemplate(await buildNoFields()))
    assert.strictEqual(verdict.reason, 'no_form_fields')
    assert.isNull(verdict.detail)
    assert.strictEqual(verdict.pageCount, 1)
    assert.strictEqual(verdict.fieldCount, 0)
  })

  test('PDF cifrado → encrypted, sin lanzar', async ({ assert }) => {
    const verdict = expectRejected(await inspectPdfTemplate(await buildEncrypted()))
    assert.strictEqual(verdict.reason, 'encrypted')
  })

  test('formulario dinámico → xfa, detectado sobre el diccionario crudo', async ({ assert }) => {
    const verdict = expectRejected(await inspectPdfTemplate(await buildXfa()))
    assert.strictEqual(verdict.reason, 'xfa')
  })

  test('getForm() borra /XFA: comprobarlo después ya no detecta nada', async ({ assert }) => {
    const document = await PDFDocument.load(new Uint8Array(await buildXfa()), {
      updateMetadata: false,
    })
    const acroForm = document.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict)
    assert.exists(acroForm)
    assert.isTrue(acroForm!.has(PDFName.of('XFA')))

    const originalWarn = console.warn
    console.warn = () => {}
    try {
      document.getForm()
    } finally {
      console.warn = originalWarn
    }
    // La evidencia desaparece: por eso el helper mira /XFA ANTES de getForm()
    assert.isFalse(acroForm!.has(PDFName.of('XFA')))
  })

  test('contenido activo del catálogo → active_content con el ofensor', async ({ assert }) => {
    const cases: Array<[() => Promise<Buffer>, string]> = [
      [buildWithOpenAction, '/OpenAction'],
      [buildWithCatalogAdditionalActions, '/AA'],
      [buildWithJavascriptNameTree, '/Names/JavaScript'],
      [buildWithEmbeddedFile, '/Names/EmbeddedFiles'],
    ]
    for (const [build, detail] of cases) {
      const verdict = expectRejected(await inspectPdfTemplate(await build()))
      assert.strictEqual(verdict.reason, 'active_content', detail)
      assert.strictEqual(verdict.detail, detail)
    }
  })

  test('acción de envío, importación, apertura o script en el widget → submit_action', async ({
    assert,
  }) => {
    for (const kind of WIDGET_ACTION_KINDS) {
      const verdict = expectRejected(await inspectPdfTemplate(await buildWithWidgetAction(kind)))
      assert.strictEqual(verdict.reason, 'submit_action', kind)
      // Se nombra el campo, nunca el destino de la acción
      assert.strictEqual(verdict.detail, 'employee_name')
    }
  })

  test('acciones /AA del widget y del campo padre → submit_action', async ({ assert }) => {
    const widget = expectRejected(
      await inspectPdfTemplate(await buildWithWidgetAdditionalActions())
    )
    assert.strictEqual(widget.reason, 'submit_action')
    const field = expectRejected(await inspectPdfTemplate(await buildWithFieldAdditionalActions()))
    assert.strictEqual(field.reason, 'submit_action')
    assert.strictEqual(field.detail, 'employee_name')
  })

  test('nombre de campo con marca bidi o control → field_name_invalid con el nombre saneado', async ({
    assert,
  }) => {
    const bidi = expectRejected(await inspectPdfTemplate(await buildBidiFieldName()))
    assert.strictEqual(bidi.reason, 'field_name_invalid')
    assert.strictEqual(bidi.detail, 'raro')

    const control = expectRejected(await inspectPdfTemplate(await buildControlCharFieldName()))
    assert.strictEqual(control.reason, 'field_name_invalid')
    assert.strictEqual(control.detail, 'ab')
  })

  test('dos campos distintos con el mismo nombre → duplicate_field; un campo con varios widgets pasa', async ({
    assert,
  }) => {
    const duplicate = expectRejected(
      await inspectPdfTemplate(await buildDuplicateFieldDifferentType())
    )
    assert.strictEqual(duplicate.reason, 'duplicate_field')
    assert.strictEqual(duplicate.detail, 'folio')

    const legitimate = await inspectPdfTemplate(await buildMultiWidgetField())
    assert.isTrue(legitimate.ok)
    if (legitimate.ok) {
      assert.deepEqual(legitimate.fieldNames, ['employee_name'])
    }
  })

  test('campo de firma → signature_field, con el ofensor truncado a 120', async ({ assert }) => {
    const verdict = expectRejected(await inspectPdfTemplate(await buildSignatureField()))
    assert.strictEqual(verdict.reason, 'signature_field')
    assert.strictEqual(verdict.detail, 'firma')

    const longName = 'x'.repeat(PDF_TEMPLATE_DETAIL_MAX_LENGTH * 2)
    const truncated = expectRejected(await inspectPdfTemplate(await buildSignatureField(longName)))
    assert.strictEqual(truncated.detail?.length, PDF_TEMPLATE_DETAIL_MAX_LENGTH)
  })

  test('topes: 31 páginas → too_complex antes de contar campos; 30/200 pasa', async ({
    assert,
  }) => {
    const verdict = expectRejected(await inspectPdfTemplate(await buildManyPagesAndFields(31, 201)))
    assert.strictEqual(verdict.reason, 'too_complex')
    assert.strictEqual(verdict.detail, `31/${PDF_TEMPLATE_MAX_PAGES}`)
    assert.isNull(verdict.fieldCount)

    const tooManyFields = expectRejected(
      await inspectPdfTemplate(await buildManyPagesAndFields(30, PDF_TEMPLATE_MAX_FIELDS + 1))
    )
    assert.strictEqual(tooManyFields.reason, 'too_complex')
    assert.strictEqual(
      tooManyFields.detail,
      `${PDF_TEMPLATE_MAX_FIELDS + 1}/${PDF_TEMPLATE_MAX_FIELDS}`
    )

    const boundary = await inspectPdfTemplate(
      await buildManyPagesAndFields(PDF_TEMPLATE_MAX_PAGES, PDF_TEMPLATE_MAX_FIELDS)
    )
    assert.isTrue(boundary.ok)
  }).timeout(10_000)

  test('bytes que no son un PDF → unreadable, sin lanzar', async ({ assert }) => {
    const verdict = expectRejected(await inspectPdfTemplate(Buffer.from('esto no es un pdf')))
    assert.strictEqual(verdict.reason, 'unreadable')
  })
})

test.group('pdf_template_safety — lo que pasa y lo que se entrega', () => {
  test('la plantilla válida pasa con el documento cargado y sus campos clasificados', async ({
    assert,
  }) => {
    const inspection = await inspectPdfTemplate(await buildValidTemplate())
    assert.isTrue(inspection.ok)
    if (!inspection.ok) return
    // `instanceOf` de japa exige constructor público y el de PDFDocument es privado
    assert.isTrue(inspection.document instanceof PDFDocument)
    assert.strictEqual(inspection.pageCount, 1)
    assert.deepEqual(inspection.fieldNames, [...VALID_TEMPLATE_FIELD_NAMES])
    assert.isTrue(inspection.fields.every((field) => field.kind === 'text'))
  })

  test('el helper no conoce el catálogo: la casilla employee_name pasa como checkbox', async ({
    assert,
  }) => {
    const inspection = await inspectPdfTemplate(await buildCheckboxNamedEmployeeName())
    assert.isTrue(inspection.ok)
    if (!inspection.ok) return
    assert.deepEqual(inspection.fields, [{ name: 'employee_name', kind: 'checkbox' }])
  })

  test('sanitizeVerdictDetail quita controles y bidi, colapsa espacios y corta a 120', ({
    assert,
  }) => {
    assert.strictEqual(sanitizeVerdictDetail('\u202Eraro   a\u0007b '), 'raro ab')
    assert.strictEqual(
      sanitizeVerdictDetail('y'.repeat(500)).length,
      PDF_TEMPLATE_DETAIL_MAX_LENGTH
    )
  })

  test('el generador es determinista: dos corridas producen bytes idénticos', async ({
    assert,
  }) => {
    for (const [name, build] of Object.entries(PDF_TEMPLATE_FIXTURES)) {
      const [first, second] = await Promise.all([build(), build()])
      assert.strictEqual(sha256(first), sha256(second), name)
    }
  }).timeout(20_000)
})
