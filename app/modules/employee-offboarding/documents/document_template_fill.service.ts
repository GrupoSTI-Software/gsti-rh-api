import { PDFDocument, PDFTextField, StandardFonts, type PDFFont } from 'pdf-lib'
import {
  fieldsForDocumentType,
  type OffboardingDocumentField,
  type OffboardingDocumentFieldKey,
} from './document_fields.constants.js'
import type { EmployeeOffboardingDocumentType } from './documents.constants.js'

/**
 * Llenado y aplanado de la plantilla propia de la empresa (USRH1789097550389)
 * con `pdf-lib`. Recibe el buffer de la versión vigente y los MISMOS valores
 * ya saneados que imprime la plantilla del sistema; devuelve el PDF fijado o
 * un fallo tipado que `DocumentsService` traduce a su error de dominio. No
 * consulta, no traduce y no lanza: cualquier excepción de la librería sale
 * como `library_error`.
 *
 * Censo de datos: solo escribe los `key` del catálogo cerrado de
 * USRH1788579938623. Aquí no existe ningún identificador fiscal, de
 * población ni de seguridad social, ni dato de nómina (regla 2).
 */

/** Un valor por cada `key` del catálogo; derivado de la tupla: una entrada nueva sin valor no compila. */
export type DocumentTemplateFieldValues = Readonly<Record<OffboardingDocumentFieldKey, string>>

export type DocumentTemplateFillFailure =
  /** Un valor no es codificable con la tipografía estándar (WinAnsi); no se escribió nada. */
  | { reason: 'unrenderable_text'; fieldKey: OffboardingDocumentFieldKey }
  /** Un campo OBLIGATORIO del catálogo está en la plantilla pero no admite texto. */
  | { reason: 'required_field_unwritable'; fieldKey: OffboardingDocumentFieldKey }
  /** Tras aplanar quedaron campos vivos: el documento sería editable (regla 3). */
  | { reason: 'fields_left_after_flatten'; fieldCount: number }
  /** `pdf-lib` lanzó al cargar, escribir o aplanar, o el resultado quedó vacío. */
  | { reason: 'library_error' }

export type DocumentTemplateFillResult =
  | { ok: true; buffer: Buffer; skippedFieldKeys: OffboardingDocumentFieldKey[] }
  | { ok: false; failure: DocumentTemplateFillFailure }

/** Tamaño nominal solo para sondear la codificación; la apariencia usa el tamaño de cada campo. */
const PROBE_FONT_SIZE = 10

interface WritableField {
  key: OffboardingDocumentFieldKey
  field: OffboardingDocumentField
  textField: PDFTextField
}

function fail(failure: DocumentTemplateFillFailure): DocumentTemplateFillResult {
  return { ok: false, failure }
}

export default class DocumentTemplateFillService {
  /**
   * Orden (regla 7): clasificar huecos → comprobar que TODOS los valores son
   * codificables → escribir campo por campo → apariencias con la fuente
   * estándar → aplanar → verificar cero campos → serializar. Un fallo en
   * cualquier paso devuelve el motivo y ningún byte.
   */
  async fill(
    template: Buffer,
    documentType: EmployeeOffboardingDocumentType,
    values: DocumentTemplateFieldValues
  ): Promise<DocumentTemplateFillResult> {
    try {
      return await this.fillOrFail(template, documentType, values)
    } catch {
      return fail({ reason: 'library_error' })
    }
  }

  private async fillOrFail(
    template: Buffer,
    documentType: EmployeeOffboardingDocumentType,
    values: DocumentTemplateFieldValues
  ): Promise<DocumentTemplateFillResult> {
    const document = await PDFDocument.load(new Uint8Array(template), { updateMetadata: false })
    const form = document.getForm()
    const font = await document.embedFont(StandardFonts.Helvetica)

    // 1. Qué huecos existen y admiten texto. Un campo AUSENTE no es fallo:
    //    qué exige la plantilla lo decide la guarda de completitud sobre su
    //    dictamen (USRH1789097550392). Un hueco presente que no admite texto
    //    tumba la emisión si es obligatorio y se omite (y reporta) si no.
    const writable: WritableField[] = []
    const skippedFieldKeys: OffboardingDocumentFieldKey[] = []
    for (const field of fieldsForDocumentType(documentType)) {
      // La interfaz del catálogo tipa `key` como string; la unión la deriva la tupla
      const key = field.key as OffboardingDocumentFieldKey
      const candidate = form.getFieldMaybe(key)
      if (candidate === undefined) continue
      if (candidate instanceof PDFTextField) {
        writable.push({ key, field, textField: candidate })
        continue
      }
      if (field.requiredInTemplate) {
        return fail({ reason: 'required_field_unwritable', fieldKey: key })
      }
      skippedFieldKeys.push(key)
    }

    // 2. Codificación ANTES de escribir el primer campo: nunca un documento a
    //    medio llenar ni con un carácter sustituido en silencio (regla 7).
    for (const { key } of writable) {
      if (!this.isEncodable(font, values[key])) {
        return fail({ reason: 'unrenderable_text', fieldKey: key })
      }
    }

    // 3. Escritura por campo: un obligatorio que no admite el valor (tope de
    //    largo, peine) tumba la emisión; un opcional se omite y se reporta.
    for (const { key, field, textField } of writable) {
      try {
        textField.setText(values[key])
      } catch {
        if (field.requiredInTemplate) {
          return fail({ reason: 'required_field_unwritable', fieldKey: key })
        }
        skippedFieldKeys.push(key)
      }
    }

    // 4. Apariencias con la fuente estándar y aplanado VERIFICABLE (regla 3)
    form.updateFieldAppearances(font)
    form.flatten()
    const remaining = document.getForm().getFields().length
    if (remaining > 0) {
      return fail({ reason: 'fields_left_after_flatten', fieldCount: remaining })
    }

    const buffer = Buffer.from(await document.save())
    if (buffer.byteLength === 0) {
      return fail({ reason: 'library_error' })
    }
    return { ok: true, buffer, skippedFieldKeys }
  }

  /** WinAnsi no cubre alfabetos fuera del latino occidental: `pdf-lib` lanza al medir. */
  private isEncodable(font: PDFFont, value: string): boolean {
    try {
      font.widthOfTextAtSize(value, PROBE_FONT_SIZE)
      return true
    } catch {
      return false
    }
  }
}
