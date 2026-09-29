import { DateTime } from 'luxon'
import PDFDocument from 'pdfkit'
import { getBusinessTimeZone } from '#utils/business_date'
import { REPORT_NEUTRAL_HEX, REPORT_NEUTRAL_PDF_FONTS } from '#constants/report_neutral_theme'
import type { TenantFiscalIdentity } from '../../../interfaces/tenant_billing_profile_interface.js'
import { formatSeniority, type SeniorityParts } from './separation_letter_pdf.service.js'

/** Paleta neutral compartida por todos los descargables (sin marca). */
const PDF_COLORS = REPORT_NEUTRAL_HEX

/** Tipografía neutral: fuentes estándar de pdfkit (WinAnsi cubre acentos, ñ, «» y —). */
const FONT_REGULAR = REPORT_NEUTRAL_PDF_FONTS.regular
const FONT_BOLD = REPORT_NEUTRAL_PDF_FONTS.bold

/**
 * Leyenda de pie que el repo ya imprime en sus PDF. Se copia y no se importa
 * porque el servicio espejo (`separation_letter_pdf.service.ts`) la declara
 * privada y esa historia no se edita.
 */
const CONFIDENTIALITY_NOTE =
  'Documento confidencial — uso interno. Contiene datos personales protegidos por la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.'

/** Altura estimada del bloque de firmas: línea, etiqueta, detalle y leyenda. */
const SIGNATURES_BLOCK_H = 140

/** Altura de una fila del cuadro de datos. */
const FIELD_ROW_H = 28

/** Sin cargo capturado, el representante firma solo con ese carácter. */
const DEFAULT_REPRESENTATIVE_ROLE = 'representante legal'

/**
 * Leyenda declarativa del importe (USRH1789097550395, regla 6): no es
 * opcional ni configurable, acompaña también al cero, y es el valor del
 * campo combinable `amounts_disclaimer` (K-7) en la plantilla propia.
 * Constante del sistema, no clave i18n: el documento es en español siempre.
 */
export const AMOUNTS_DISCLAIMER =
  'El importe señalado corresponde a los conceptos capturados por la empresa en los pendientes del ' +
  'expediente de salida y no constituye un finiquito calculado conforme a la Ley Federal del Trabajo.'

/**
 * Plantilla FIJA del sistema del convenio de terminación (USRH1789097550394),
 * siempre en español: un solo bloque de constantes. Es un punto de partida,
 * no asesoría legal: la redacción que rige para cada empresa es la de su
 * plantilla propia (supuesto declarado de la HU).
 *
 * Lo que este texto NO dice, a propósito: ninguna afirmación de que el
 * convenio ya esté ratificado (regla 4), ningún desglose por concepto y
 * ninguna cifra que no sea la suma capturada (USRH1789097550395, regla 1).
 */
const AGREEMENT_TEXT = {
  title: 'CONVENIO DE TERMINACIÓN DE LA RELACIÓN DE TRABAJO',
  folioLabel: 'Folio:',
  intro: (data: { legalName: string; representative: string; employeeName: string }) =>
    `Convenio de terminación de la relación de trabajo que celebran, por una parte, ${data.legalName}, ` +
    `en lo sucesivo «la empresa», representada en este acto por ${data.representative}, y por la otra, ` +
    `${data.employeeName}, en lo sucesivo «la persona trabajadora», al tenor de las siguientes ` +
    'declaraciones y cláusulas:',
  declarationsHeading: 'DECLARACIONES',
  companyDeclaration: (data: { legalAddress: string; representative: string }) =>
    `I. Declara «la empresa», por conducto de su representante, que tiene su domicilio en ${data.legalAddress}, ` +
    `y que ${data.representative} cuenta con facultades suficientes para celebrar este convenio en su nombre.`,
  employeeDeclaration: (data: {
    positionName: string
    departmentOrUnit: string
    hireDate: string
  }) =>
    'II. Declara «la persona trabajadora» que prestó sus servicios a «la empresa» desempeñando el puesto de ' +
    `${data.positionName}, adscrita a ${data.departmentOrUnit}, a partir del ${data.hireDate}.`,
  /** Relación circunstanciada de los hechos (art. 33 LFT, regla 2). */
  statement: (data: { hireDate: string; referenceDate: string; seniority: string }) =>
    `III. Declaran ambas partes que la relación de trabajo inició el ${data.hireDate} y concluyó el ` +
    `${data.referenceDate}, acumulando una antigüedad de ${data.seniority}, y que es su voluntad dar por ` +
    'terminada dicha relación en los términos de este convenio, sin que medie coacción alguna.',
  clausesHeading: 'CLÁUSULAS',
  firstClause: (data: { referenceDate: string }) =>
    'PRIMERA. Las partes dan por terminada la relación de trabajo que las unió, con efectos a partir del ' +
    `${data.referenceDate}.`,
  secondClause:
    'SEGUNDA. Los conceptos y prestaciones derivados de la relación de trabajo son los que constan en el ' +
    'expediente de salida de «la persona trabajadora». Este convenio no contiene renuncia de salarios ' +
    'devengados, indemnizaciones ni demás prestaciones derivadas de los servicios prestados.',
  /** Bloque de importes (USRH1789097550395): la suma en número y en letra, del mismo valor. */
  amountsLabel: 'Importe total capturado:',
  /** Regla 4: la validez la da la ratificación, que ocurre fuera del sistema. */
  thirdClause:
    'TERCERA. De conformidad con el artículo 33 de la Ley Federal del Trabajo, este convenio se somete a ' +
    'ratificación ante el Centro de Conciliación o el Tribunal laboral competente, que lo aprobará siempre ' +
    'que no contenga renuncia de derechos de la persona trabajadora. Su validez deriva de dicha ' +
    'ratificación; la firma de este escrito no la sustituye ni la acredita.',
  fields: {
    legalName: 'Razón social',
    legalAddress: 'Domicilio fiscal',
    representative: 'Representante legal',
    employeeName: 'Nombre completo',
    positionName: 'Puesto',
    departmentOrUnit: 'Departamento o unidad',
    hireDate: 'Fecha de ingreso',
    referenceDate: 'Fecha de separación',
    seniority: 'Antigüedad',
  },
  signatures: {
    company: '«La empresa»',
    employee: '«La persona trabajadora»',
    autographNote: 'Las firmas deben ser autógrafas.',
  },
  footer: {
    folio: 'Folio',
    issuedAt: 'Emitido el',
    page: 'Página',
  },
  info: {
    title: 'Convenio de terminación',
    subject: 'Convenio de terminación de la relación de trabajo (LFT art. 33)',
  },
} as const

/**
 * Domicilio fiscal en una línea (contrato de USRH1789097550394 §9): calle y
 * número exterior, número interior si existe, colonia, municipio, estado y
 * código postal, separados por comas, con las partes vacías omitidas y sin
 * comas colgando. Sin calle no hay domicilio: el resultado queda vacío para
 * que la guarda de completitud bloquee en lugar de imprimir uno a medias.
 * Función pura, sin consultas.
 */
export function buildLegalAddressLine(
  identity: Pick<
    TenantFiscalIdentity,
    | 'street'
    | 'exteriorNumber'
    | 'interiorNumber'
    | 'neighborhood'
    | 'municipality'
    | 'state'
    | 'postalCode'
  >
): string {
  const clean = (value: string | null): string => (value ?? '').trim()
  const street = clean(identity.street)
  if (street.length === 0) return ''
  const interior = clean(identity.interiorNumber)
  const postalCode = clean(identity.postalCode)
  return [
    [street, clean(identity.exteriorNumber)].filter((part) => part.length > 0).join(' '),
    interior.length > 0 ? `Int. ${interior}` : '',
    clean(identity.neighborhood),
    clean(identity.municipality),
    clean(identity.state),
    postalCode.length > 0 ? `C.P. ${postalCode}` : '',
  ]
    .filter((part) => part.length > 0)
    .join(', ')
}

/** Datos YA RESUELTOS y saneados para el render; el servicio nunca consulta. */
export interface TerminationAgreementData {
  folio: string
  employeeName: string
  positionName: string
  departmentOrUnit: string
  legalName: string
  legalAddress: string
  legalRepresentativeName: string
  /** Cargo con el que firma; vacío = se imprime solo como representante legal. */
  legalRepresentativeRole: string
  /** Cifra impresa (`$43,250.80`), salida de `formatAmountMxn` (USRH1789097550395). */
  totalAmountText: string
  /** Cantidad con letra, salida de `amountInWords` sobre el MISMO valor. */
  totalAmountInWords: string
  hireDateIso: string
  referenceDateIso: string
  seniority: SeniorityParts
  issuedAt: DateTime
}

/**
 * Render de la plantilla del sistema del convenio de terminación
 * (USRH1789097550394) con `pdfkit`, espejo de `SeparationLetterPdfService`:
 * construcción del buffer, encabezado neutral, declaraciones, cláusulas,
 * cuadro de datos, firmas y pie por página. Recibe un objeto de datos, nunca
 * un id, y no ejecuta consultas.
 *
 * Censo de datos personales: lo impreso (nombre, puesto, adscripción,
 * fechas, antigüedad, razón social, domicilio fiscal y representante legal
 * con su cargo) NO está en `sensitive_fields.ts`; el nombre del
 * representante es dato personal ordinario (decisión D-10). Aquí no existe
 * RFC del patrón ni identificador fiscal, de población o de seguridad
 * social del colaborador, ni su salario ni importe alguno (reglas 5 y 10).
 *
 * Bloque de importes (USRH1789097550395): entre la cláusula SEGUNDA y la
 * TERCERA, la suma en número y en letra (recibidas ya derivadas del mismo
 * valor) con la leyenda declarativa. Nunca el desglose por concepto.
 */
export default class TerminationAgreementPdfService {
  async render(data: TerminationAgreementData): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: 60, bottom: 70, left: 48, right: 48 },
        bufferPages: true,
        info: {
          Title: AGREEMENT_TEXT.info.title,
          Author: data.legalName,
          Subject: AGREEMENT_TEXT.info.subject,
          Producer: 'PDFKit',
        },
      })

      const chunks: Uint8Array[] = []
      doc.on('data', (chunk: Uint8Array) => chunks.push(chunk))
      doc.on('end', () => resolve(Buffer.concat(chunks)))
      doc.on('error', reject)

      this.renderContent(doc, data)

      const pageRange = doc.bufferedPageRange()
      for (let i = pageRange.start; i < pageRange.start + pageRange.count; i++) {
        doc.switchToPage(i)
        this.renderPageHeader(doc)
        this.renderPageFooter(doc, data, i - pageRange.start + 1, pageRange.count)
      }

      doc.end()
    })
  }

  /** "Nombre, en su carácter de Cargo" — el cargo viaja en el texto, no como campo (spec §11). */
  private representativeLine(data: TerminationAgreementData): string {
    const role =
      data.legalRepresentativeRole.length > 0
        ? data.legalRepresentativeRole
        : DEFAULT_REPRESENTATIVE_ROLE
    return `${data.legalRepresentativeName}, en su carácter de ${role}`
  }

  private renderContent(doc: PDFKit.PDFDocument, data: TerminationAgreementData) {
    const margin = doc.page.margins.left
    const pageW = doc.page.width - margin * 2
    const hireDate = this.formatDate(data.hireDateIso)
    const referenceDate = this.formatDate(data.referenceDateIso)
    const seniority = formatSeniority(data.seniority)
    const representative = this.representativeLine(data)

    doc.y = doc.page.margins.top

    // Título + folio
    doc
      .font(FONT_BOLD)
      .fontSize(14)
      .fillColor(PDF_COLORS.text)
      .text(AGREEMENT_TEXT.title, margin, doc.y, { width: pageW, align: 'center' })
    doc.moveDown(0.2)
    doc
      .font(FONT_REGULAR)
      .fontSize(8)
      .fillColor(PDF_COLORS.textMuted)
      .text(`${AGREEMENT_TEXT.folioLabel} ${data.folio}`, margin, doc.y, {
        width: pageW,
        align: 'center',
      })
    doc.moveDown(1.2)

    // Proemio: las dos partes
    this.paragraph(
      doc,
      margin,
      pageW,
      AGREEMENT_TEXT.intro({
        legalName: data.legalName,
        representative,
        employeeName: data.employeeName,
      })
    )

    // Declaraciones: domicilio y facultades, servicios prestados y relación circunstanciada
    this.heading(doc, margin, pageW, AGREEMENT_TEXT.declarationsHeading)
    this.paragraph(
      doc,
      margin,
      pageW,
      AGREEMENT_TEXT.companyDeclaration({ legalAddress: data.legalAddress, representative })
    )
    this.paragraph(
      doc,
      margin,
      pageW,
      AGREEMENT_TEXT.employeeDeclaration({
        positionName: data.positionName,
        departmentOrUnit: data.departmentOrUnit,
        hireDate,
      })
    )
    this.paragraph(
      doc,
      margin,
      pageW,
      AGREEMENT_TEXT.statement({ hireDate, referenceDate, seniority })
    )

    // Cláusulas
    this.heading(doc, margin, pageW, AGREEMENT_TEXT.clausesHeading)
    this.paragraph(doc, margin, pageW, AGREEMENT_TEXT.firstClause({ referenceDate }))
    this.paragraph(doc, margin, pageW, AGREEMENT_TEXT.secondClause)
    this.renderAmounts(doc, margin, pageW, data)
    this.paragraph(doc, margin, pageW, AGREEMENT_TEXT.thirdClause)
    doc.moveDown(0.6)

    // Cuadro de datos: razón social, domicilio y representante a ancho
    // completo (un domicilio no cabe en media página sin truncarse en silencio)
    this.renderFieldRows(doc, margin, pageW, [
      { label: AGREEMENT_TEXT.fields.legalName, value: data.legalName, full: true },
      { label: AGREEMENT_TEXT.fields.legalAddress, value: data.legalAddress, full: true },
      { label: AGREEMENT_TEXT.fields.representative, value: representative, full: true },
      { label: AGREEMENT_TEXT.fields.employeeName, value: data.employeeName, full: true },
      { label: AGREEMENT_TEXT.fields.positionName, value: data.positionName, full: true },
      { label: AGREEMENT_TEXT.fields.departmentOrUnit, value: data.departmentOrUnit },
      { label: AGREEMENT_TEXT.fields.seniority, value: seniority },
      { label: AGREEMENT_TEXT.fields.hireDate, value: hireDate },
      { label: AGREEMENT_TEXT.fields.referenceDate, value: referenceDate },
    ])

    this.renderSignatures(doc, margin, pageW, data, representative)
  }

  /**
   * Bloque de importes (USRH1789097550395, reglas 2 y 6): cifra, debajo la
   * cantidad con letra entre paréntesis y, en el mismo bloque, la leyenda
   * declarativa completa. Los textos llegan derivados del mismo valor y no
   * pasan por saneado: son salida del sistema sobre un número.
   */
  private renderAmounts(
    doc: PDFKit.PDFDocument,
    margin: number,
    pageW: number,
    data: TerminationAgreementData
  ) {
    doc
      .font(FONT_REGULAR)
      .fontSize(10)
      .fillColor(PDF_COLORS.text)
      .text(`${AGREEMENT_TEXT.amountsLabel} `, margin, doc.y, { continued: true })
      .font(FONT_BOLD)
      .text(data.totalAmountText, { continued: false })
    doc
      .font(FONT_BOLD)
      .fontSize(10)
      .fillColor(PDF_COLORS.text)
      .text(`(${data.totalAmountInWords})`, margin, doc.y, { width: pageW, align: 'left' })
    doc.moveDown(0.3)
    doc
      .font(FONT_REGULAR)
      .fontSize(9)
      .fillColor(PDF_COLORS.textMuted)
      .text(AMOUNTS_DISCLAIMER, margin, doc.y, { width: pageW, align: 'justify', lineGap: 1 })
    doc.moveDown(0.6)
  }

  private heading(doc: PDFKit.PDFDocument, margin: number, pageW: number, text: string) {
    doc.moveDown(0.4)
    doc
      .font(FONT_BOLD)
      .fontSize(10.5)
      .fillColor(PDF_COLORS.text)
      .text(text, margin, doc.y, { width: pageW, align: 'center' })
    doc.moveDown(0.5)
  }

  /** Párrafo justificado; pdfkit salta de página solo cuando el texto no cabe. */
  private paragraph(doc: PDFKit.PDFDocument, margin: number, pageW: number, text: string) {
    doc
      .font(FONT_REGULAR)
      .fontSize(10)
      .fillColor(PDF_COLORS.text)
      .text(text, margin, doc.y, { width: pageW, align: 'justify', lineGap: 2 })
    doc.moveDown(0.6)
  }

  /**
   * Filas etiqueta + valor con cursor PROPIO (`rowTop`), como en la
   * constancia: `doc.text(x, y)` avanza `doc.y` tras cada llamada y con dos
   * columnas la segunda quedaría desalineada. `full` ocupa el ancho de página;
   * si no, van de dos en dos. Si el cuadro no cabe, se abre página antes.
   */
  private renderFieldRows(
    doc: PDFKit.PDFDocument,
    margin: number,
    pageW: number,
    rows: Array<{ label: string; value: string; full?: boolean }>
  ) {
    const fullRows = rows.filter((row) => row.full).length
    const halfRows = Math.ceil((rows.length - fullRows) / 2)
    const gridH = (fullRows + halfRows) * FIELD_ROW_H
    if (doc.y + gridH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
      doc.y = doc.page.margins.top
    }

    const halfW = pageW / 2
    let rowTop = doc.y
    let col = 0

    const paint = (x: number, width: number, row: { label: string; value: string }) => {
      doc
        .font(FONT_REGULAR)
        .fontSize(8)
        .fillColor(PDF_COLORS.textMuted)
        .text(row.label, x, rowTop, { width: width - 8, lineBreak: false, ellipsis: true })
      doc
        .font(FONT_BOLD)
        .fontSize(9.5)
        .fillColor(PDF_COLORS.text)
        .text(row.value, x, rowTop + 11, { width: width - 8, lineBreak: false, ellipsis: true })
    }

    for (const row of rows) {
      if (row.full) {
        if (col === 1) {
          rowTop += FIELD_ROW_H
          col = 0
        }
        paint(margin, pageW, row)
        rowTop += FIELD_ROW_H
        continue
      }
      paint(margin + col * halfW, halfW, row)
      if (col === 1) {
        rowTop += FIELD_ROW_H
        col = 0
      } else {
        col = 1
      }
    }
    if (col === 1) {
      rowTop += FIELD_ROW_H
    }
    doc.y = rowTop
    doc.moveDown(0.8)
  }

  /** Dos columnas: la empresa por su representante (nombre y cargo) y la persona trabajadora. */
  private renderSignatures(
    doc: PDFKit.PDFDocument,
    margin: number,
    pageW: number,
    data: TerminationAgreementData,
    representative: string
  ) {
    if (doc.y + SIGNATURES_BLOCK_H > doc.page.height - doc.page.margins.bottom) {
      doc.addPage()
      doc.y = doc.page.margins.top
    }

    const colW = pageW / 2
    const sigLineY = doc.y + 48
    const columns: Array<{ label: string; detail: string; secondary: string }> = [
      {
        label: AGREEMENT_TEXT.signatures.company,
        detail: data.legalName,
        secondary: representative,
      },
      { label: AGREEMENT_TEXT.signatures.employee, detail: data.employeeName, secondary: '' },
    ]

    columns.forEach((column, idx) => {
      const x = margin + colW * idx
      doc
        .moveTo(x + 10, sigLineY)
        .lineTo(x + colW - 10, sigLineY)
        .lineWidth(0.8)
        .strokeColor(PDF_COLORS.border)
        .stroke()
      doc
        .font(FONT_BOLD)
        .fontSize(8.5)
        .fillColor(PDF_COLORS.text)
        .text(column.label, x, sigLineY + 5, { width: colW, align: 'center', lineBreak: false })
      doc
        .font(FONT_REGULAR)
        .fontSize(8)
        .fillColor(PDF_COLORS.textMuted)
        .text(column.detail, x + 6, sigLineY + 18, {
          width: colW - 12,
          align: 'center',
          lineBreak: false,
          ellipsis: true,
        })
      if (column.secondary) {
        doc
          .font(FONT_REGULAR)
          .fontSize(8)
          .fillColor(PDF_COLORS.textMuted)
          .text(column.secondary, x + 6, sigLineY + 30, {
            width: colW - 12,
            align: 'center',
            lineBreak: false,
            ellipsis: true,
          })
      }
    })

    doc.y = sigLineY + 52
    doc
      .font(FONT_REGULAR)
      .fontSize(8)
      .fillColor(PDF_COLORS.textMuted)
      .text(AGREEMENT_TEXT.signatures.autographNote, margin, doc.y, {
        width: pageW,
        align: 'center',
      })
  }

  /**
   * Encabezado neutral de cada página: solo la línea delgada gris. El nombre
   * comercial es membrete de la constancia (C-4) y no entra al convenio. El
   * cursor `doc.y` se restaura al terminar.
   */
  private renderPageHeader(doc: PDFKit.PDFDocument) {
    const margin = doc.page.margins.left
    const pageW = doc.page.width - margin * 2
    const ruleY = 38
    const savedY = doc.y

    doc.save()
    doc
      .moveTo(margin, ruleY)
      .lineTo(margin + pageW, ruleY)
      .lineWidth(0.5)
      .strokeColor(PDF_COLORS.border)
      .stroke()
    doc.restore()
    doc.y = savedY
  }

  /** Pie: folio + emisión a la izquierda, página a la derecha, leyenda centrada. */
  private renderPageFooter(
    doc: PDFKit.PDFDocument,
    data: TerminationAgreementData,
    currentPage: number,
    totalPages: number
  ) {
    const margin = doc.page.margins.left
    const pageW = doc.page.width - margin * 2
    const bottomY = doc.page.height - 60
    const savedY = doc.y
    const issuedAt = data.issuedAt.setZone(getBusinessTimeZone()).toFormat('dd/LL/yyyy HH:mm')

    doc.save()
    doc
      .moveTo(margin, bottomY)
      .lineTo(margin + pageW, bottomY)
      .lineWidth(0.5)
      .strokeColor(PDF_COLORS.border)
      .stroke()
    doc
      .font(FONT_REGULAR)
      .fontSize(7.5)
      .fillColor(PDF_COLORS.textMuted)
      .text(
        `${AGREEMENT_TEXT.footer.folio} ${data.folio} · ${AGREEMENT_TEXT.footer.issuedAt} ${issuedAt}`,
        margin,
        bottomY + 8,
        { width: pageW / 2, align: 'left', lineBreak: false, height: 10 }
      )
    doc
      .font(FONT_BOLD)
      .fontSize(7.5)
      .fillColor(PDF_COLORS.textMuted)
      .text(
        `${AGREEMENT_TEXT.footer.page} ${currentPage} / ${totalPages}`,
        margin + pageW / 2,
        bottomY + 8,
        { width: pageW / 2, align: 'right', lineBreak: false, height: 10 }
      )
    doc
      .font(FONT_REGULAR)
      .fontSize(6.5)
      .fillColor(PDF_COLORS.textMuted)
      .text(CONFIDENTIALITY_NOTE, margin, bottomY + 22, {
        width: pageW,
        align: 'center',
        lineBreak: false,
        height: 10,
      })
    doc.restore()
    doc.y = savedY
  }

  /** `YYYY-MM-DD` civil → `dd/MM/aaaa` (numérico, sin depender de locale). */
  private formatDate(iso: string): string {
    return DateTime.fromISO(iso, { zone: getBusinessTimeZone() }).toFormat('dd/LL/yyyy')
  }
}
