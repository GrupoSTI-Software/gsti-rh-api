import {
  PDFButton,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFDropdown,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFRef,
  PDFSignature,
  PDFTextField,
  type PDFField,
} from 'pdf-lib'
import { sanitizeRenderText } from '#modules/employee-offboarding/documents/separation_letter_pdf.service'

/**
 * Revisión ESTRUCTURAL de un PDF que quiere ser plantilla del documento de
 * salida (USRH1789097550387). Función pura: recibe el buffer TAL COMO quedó
 * almacenado (post-intake), no hace I/O, no traduce y no lanza — devuelve un
 * veredicto discriminado. Es la ÚNICA carga de `pdf-lib` del módulo: el
 * `PDFDocument` y los campos se entregan a ESB-05-07-08, que no vuelve a
 * cargar nada.
 *
 * El intake solo limpia metadatos: `/OpenAction`, `/AA`, `/Names`, `/XFA` y
 * las acciones de los widgets SOBREVIVEN al round-trip (verificado con
 * pdf-lib 1.17.1). Por eso esta revisión existe.
 *
 * NO conoce el catálogo de campos: todo lo que rechaza se decide con la
 * estructura del PDF, nunca con la semántica de los nombres.
 */

/** Topes estructurales del sistema (regla 8): iguales para todas las empresas. */
export const PDF_TEMPLATE_MAX_PAGES = 30
export const PDF_TEMPLATE_MAX_FIELDS = 200

/** Largo máximo del ofensor que se echa de vuelta al usuario o al dictamen (regla 7). */
export const PDF_TEMPLATE_DETAIL_MAX_LENGTH = 120

/** Motivos de rechazo estructural. `unvalidated_legacy` solo lo escribe el candado V-1. */
export type PdfTemplateRejectionReason =
  | 'encrypted'
  | 'xfa'
  | 'no_form_fields'
  | 'field_type'
  | 'active_content'
  | 'submit_action'
  | 'signature_field'
  | 'duplicate_field'
  | 'field_name_invalid'
  | 'too_complex'
  | 'unvalidated_legacy'

/** Parte estructural del dictamen. La escribe USRH1789097550387; ESB-05-07-08 la conserva. */
export interface DocumentTemplateStructuralVerdict {
  /** Hasta dónde llegó la revisión que produjo este dictamen. */
  stage: 'structural' | 'fields'
  /** Motivo del rechazo; `null` cuando la estructura pasó. */
  reason: PdfTemplateRejectionReason | null
  /** Ofensor mínimo, saneado con `sanitizeRenderText` y truncado a 120. `null` si no aplica. */
  detail: string | null
}

/** Tipo real del campo según su clase de `pdf-lib` (el `/FT` del AcroForm). */
export type PdfTemplateFieldKind =
  | 'text'
  | 'checkbox'
  | 'radio'
  | 'dropdown'
  | 'optionlist'
  | 'button'
  | 'signature'
  | 'unknown'

/** Campo del formulario tal como lo ve la revisión: nombre calificado y tipo real. */
export interface PdfTemplateField {
  name: string
  kind: PdfTemplateFieldKind
}

/** Motivos que el helper decide por sí mismo (sin catálogo ni candado). */
export type PdfTemplateStructuralRejection = Exclude<
  PdfTemplateRejectionReason,
  'field_type' | 'unvalidated_legacy'
>

/**
 * Veredicto del helper. `unreadable` no es un motivo de rechazo: el buffer ya
 * pasó el intake con la misma librería, así que un fallo de carga distinto
 * del cifrado es un objeto corrupto y el servicio lo trata como 500.
 */
export type PdfTemplateInspection =
  | {
      ok: true
      document: PDFDocument
      fields: readonly PdfTemplateField[]
      fieldNames: readonly string[]
      pageCount: number
    }
  | {
      ok: false
      reason: PdfTemplateStructuralRejection
      detail: string | null
      pageCount: number | null
      fieldCount: number | null
    }
  | { ok: false; reason: 'unreadable'; detail: null; pageCount: null; fieldCount: null }

/** Acciones de widget que sacan datos, importan o abren algo fuera del documento. */
const FORBIDDEN_WIDGET_ACTIONS: ReadonlySet<string> = new Set([
  'SubmitForm',
  'ImportData',
  'Launch',
  'GoToR',
  'JavaScript',
])

/** Controles C0/C1 (por código de carácter: `no-control-regex` prohíbe el rango en literales). */
function isControlChar(code: number): boolean {
  return code <= 31 || (code >= 127 && code <= 159)
}

/** Marcas bidireccionales: un override U+202E muestra un nombre distinto del que es. */
const BIDI_CONTROLS = /[\u200E\u200F\u202A-\u202E\u2066-\u2069]/

/** Regla 7: lo que viene del archivo se cita saneado y acortado, nunca literal. */
export function sanitizeVerdictDetail(value: string): string {
  return sanitizeRenderText(value).slice(0, PDF_TEMPLATE_DETAIL_MAX_LENGTH)
}

function hasControlOrBidi(value: string): boolean {
  if (BIDI_CONTROLS.test(value)) return true
  for (const char of value) {
    if (isControlChar(char.codePointAt(0) ?? 0)) return true
  }
  return false
}

/** Clasifica el campo por su clase (`/FT` + banderas), sin casts. */
export function classifyField(field: PDFField): PdfTemplateFieldKind {
  if (field instanceof PDFTextField) return 'text'
  if (field instanceof PDFCheckBox) return 'checkbox'
  if (field instanceof PDFRadioGroup) return 'radio'
  if (field instanceof PDFDropdown) return 'dropdown'
  if (field instanceof PDFOptionList) return 'optionlist'
  if (field instanceof PDFButton) return 'button'
  if (field instanceof PDFSignature) return 'signature'
  return 'unknown'
}

/**
 * Entrada de un diccionario resuelta a `PDFDict`, en línea o por referencia.
 * `get` + `instanceof` en vez de `lookupMaybe`: este último LANZA cuando el
 * valor es de otro tipo, y un PDF malformado no debe tumbar la revisión.
 */
function resolveDict(dict: PDFDict, key: PDFName): PDFDict | undefined {
  const value = dict.get(key)
  const resolved = value instanceof PDFRef ? dict.context.lookup(value) : value
  return resolved instanceof PDFDict ? resolved : undefined
}

/** `/S` de un diccionario de acción, sin la barra; `null` si no es una acción. */
function actionSubtype(action: PDFDict): string | null {
  const subtype = action.get(PDFName.of('S'))
  return subtype instanceof PDFName ? subtype.decodeText() : null
}

function isForbiddenAction(action: PDFDict): boolean {
  const subtype = actionSubtype(action)
  return subtype !== null && FORBIDDEN_WIDGET_ACTIONS.has(subtype)
}

/**
 * Acciones de un diccionario de campo o de widget: `/A` (acción principal)
 * y cada disparador de `/AA` (/Fo, /Bl, /K, /F, /V, /C…). El campo y sus
 * widgets se revisan por separado: una acción `/AA` puede colgar del campo
 * padre y no aparecer en ningún widget (verificado con pdf-lib 1.17.1).
 */
function hasForbiddenAction(dict: PDFDict): boolean {
  const direct = resolveDict(dict, PDFName.of('A'))
  if (direct && isForbiddenAction(direct)) return true

  const additional = resolveDict(dict, PDFName.of('AA'))
  if (!additional) return false
  return additional.keys().some((trigger) => {
    const action = resolveDict(additional, trigger)
    return action !== undefined && isForbiddenAction(action)
  })
}

function reject(
  reason: PdfTemplateStructuralRejection,
  detail: string | null,
  counts: { pageCount: number | null; fieldCount: number | null }
): PdfTemplateInspection {
  return { ok: false, reason, detail, pageCount: counts.pageCount, fieldCount: counts.fieldCount }
}

/**
 * Orden de evaluación (no es estético): cifrado → `/XFA` sobre el diccionario
 * CRUDO del `/AcroForm` (getForm() lo borra con un warning) → tope de
 * páginas → contenido activo del catálogo → campos (vacío, tope, y por cada
 * campo: nombre, duplicado, firma, acciones del campo y de sus widgets).
 */
export async function inspectPdfTemplate(buffer: Buffer): Promise<PdfTemplateInspection> {
  const none = { pageCount: null, fieldCount: null }

  // `ignoreEncryption` + `isEncrypted`: la clase `EncryptedPDFError` no
  // sobrevive al build de pdf-lib (el catch recibe un Error plano), así que
  // no se lanza ni se discrimina por mensaje. `updateMetadata: false` evita
  // que la carga re-estampe fechas: la revisión no muta nada.
  let document: PDFDocument
  try {
    document = await PDFDocument.load(new Uint8Array(buffer), {
      ignoreEncryption: true,
      updateMetadata: false,
    })
  } catch {
    return { ok: false, reason: 'unreadable', detail: null, pageCount: null, fieldCount: null }
  }
  if (document.isEncrypted) {
    return reject('encrypted', null, none)
  }

  try {
    return inspectLoadedDocument(document)
  } catch {
    // Un catálogo malformado que pasó el intake es un objeto corrupto, no un rechazo
    return { ok: false, reason: 'unreadable', detail: null, pageCount: null, fieldCount: null }
  }
}

function inspectLoadedDocument(document: PDFDocument): PdfTemplateInspection {
  const none = { pageCount: null, fieldCount: null }

  // /XFA ANTES del primer getForm(): pdf-lib lo elimina del diccionario al construir el formulario
  const acroForm = resolveDict(document.catalog, PDFName.of('AcroForm'))
  if (acroForm?.has(PDFName.of('XFA'))) {
    return reject('xfa', null, none)
  }

  // Tope de páginas antes que el de campos, que es el más caro
  const pageCount = document.getPageCount()
  if (pageCount > PDF_TEMPLATE_MAX_PAGES) {
    return reject('too_complex', `${pageCount}/${PDF_TEMPLATE_MAX_PAGES}`, {
      pageCount,
      fieldCount: null,
    })
  }

  // Contenido activo del documento
  const catalog = document.catalog
  if (catalog.has(PDFName.of('OpenAction'))) {
    return reject('active_content', '/OpenAction', { pageCount, fieldCount: null })
  }
  if (catalog.has(PDFName.of('AA'))) {
    return reject('active_content', '/AA', { pageCount, fieldCount: null })
  }
  const names = resolveDict(catalog, PDFName.of('Names'))
  if (names?.has(PDFName.of('JavaScript'))) {
    return reject('active_content', '/Names/JavaScript', { pageCount, fieldCount: null })
  }
  if (names?.has(PDFName.of('EmbeddedFiles'))) {
    return reject('active_content', '/Names/EmbeddedFiles', { pageCount, fieldCount: null })
  }

  // Campos: sin AcroForm, getForm().getFields() devuelve [] sin lanzar
  const fields = document.getForm().getFields()
  const fieldCount = fields.length
  const counts = { pageCount, fieldCount }
  if (fieldCount === 0) {
    return reject('no_form_fields', null, counts)
  }
  if (fieldCount > PDF_TEMPLATE_MAX_FIELDS) {
    return reject('too_complex', `${fieldCount}/${PDF_TEMPLATE_MAX_FIELDS}`, counts)
  }

  const seen = new Set<string>()
  for (const field of fields) {
    const rawName = field.getName()
    const detail = sanitizeVerdictDetail(rawName)
    if (hasControlOrBidi(rawName)) {
      return reject('field_name_invalid', detail, counts)
    }
    // Dos ENTRADAS con el mismo nombre calificado; un campo con dos widgets es un solo PDFField
    if (seen.has(rawName)) {
      return reject('duplicate_field', detail, counts)
    }
    seen.add(rawName)
    if (classifyField(field) === 'signature' || field.acroField.FT() === PDFName.of('Sig')) {
      return reject('signature_field', detail, counts)
    }
    // Se nombra el campo, nunca el destino de la acción
    if (hasForbiddenAction(field.acroField.dict)) {
      return reject('submit_action', detail, counts)
    }
    for (const widget of field.acroField.getWidgets()) {
      if (hasForbiddenAction(widget.dict)) {
        return reject('submit_action', detail, counts)
      }
    }
  }

  const classified: PdfTemplateField[] = fields.map((field) => ({
    name: field.getName(),
    kind: classifyField(field),
  }))
  return {
    ok: true,
    document,
    fields: classified,
    fieldNames: classified.map((field) => field.name),
    pageCount,
  }
}
