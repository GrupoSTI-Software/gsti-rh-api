#!/usr/bin/env node
/**
 * Genera archivos Excel de prueba manual para importación de contratos
 * (USRH1785509296682) en `.gsti-kg/excel-import-pruebas/contratos-importacion/`.
 *
 * Uso: node scripts/generate-contrato-import-test-excels.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, '../.gsti-kg/excel-import-pruebas/contratos-importacion')

const CANONICAL_HEADERS = [
  'RFC contratante',
  'Número de contrato',
  'Fecha inicio',
  'Fecha fin',
  'Objeto del servicio',
  'Monto total',
  'Moneda',
  'Anexo - Objeto detallado',
  'Anexo - Número de trabajadores',
  'Anexo - Fecha inicio servicio',
  'Anexo - Fecha fin servicio',
  'Anexo - Compromisos documentales',
  'Anexo - Responsabilidad solidaria',
  'Servicios registrados',
]

const SAMPLE_ROW = [
  '<RFC_CONTRATANTE_EN_TENANT>',
  'CSE-MANUAL-001',
  '2026-01-15',
  '2026-12-31',
  'Prestación de servicios especializados de limpieza industrial en planta y áreas administrativas.',
  450000,
  'MXN',
  'Limpieza profunda de áreas productivas, sanitarios, pasillos y zonas comunes con personal capacitado, insumos y supervisión en sitio.',
  12,
  '2026-01-15',
  '2026-12-31',
  'cfdi_nomina|Entrega mensual de CFDI de nómina por cada trabajador asignado al servicio|mensual',
  'Las partes reconocen la responsabilidad solidaria prevista en el artículo 15-D de la Ley Federal del Trabajo cuando el prestador incumpla obligaciones laborales o de seguridad social.',
  '<NOMBRE_SERVICIO_REGISTRADO_EN_REPSE>',
]

async function writeWorkbook(filename, { headers, rows = [] }) {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Contratos')
  sheet.addRow(headers)
  for (const row of rows) {
    sheet.addRow(row)
  }
  const buffer = await workbook.xlsx.writeBuffer()
  const path = join(OUTPUT_DIR, filename)
  await writeFile(path, Buffer.from(buffer))
  return path
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true })

  const files = [
    {
      name: '01-import-contratos-cabeceras-validas-vacia.xlsx',
      headers: CANONICAL_HEADERS,
      rows: [],
    },
    {
      name: '02-import-contratos-fila-ejemplo.xlsx',
      headers: CANONICAL_HEADERS,
      rows: [SAMPLE_ROW],
    },
    {
      name: '03-import-contratos-cabeceras-invalidas.xlsx',
      headers: ['Columna A', 'Columna B'],
      rows: [SAMPLE_ROW],
    },
    {
      name: '04-import-contratos-numero-duplicado.xlsx',
      headers: CANONICAL_HEADERS,
      rows: [
        SAMPLE_ROW,
        [...SAMPLE_ROW.slice(0, 1), 'CSE-MANUAL-001', ...SAMPLE_ROW.slice(2)],
      ],
    },
    {
      name: '05-import-contratos-fila-vacia.xlsx',
      headers: CANONICAL_HEADERS,
      rows: [SAMPLE_ROW, Array(CANONICAL_HEADERS.length).fill('')],
    },
  ]

  for (const file of files) {
    const path = await writeWorkbook(file.name, file)
    console.log(`Generado: ${path}`)
  }

  const datosPrueba = {
    descripcion:
      'Reemplace los placeholders antes de importar manualmente contra su tenant local.',
    headersHttp: {
      Authorization: 'Bearer <access_token>',
      'X-Business-Unit-Id': '<business_unit_public_id>',
      'Accept-Language': 'es',
    },
    multipart: {
      campo: 'archivo',
      extension: '.xlsx',
      maxBytes: 10485760,
    },
    placeholders: {
      RFC_CONTRATANTE_EN_TENANT:
        'RFC de una empresa contratante existente en el catálogo REPSE del tenant',
      NOMBRE_SERVICIO_REGISTRADO_EN_REPSE:
        'Nombre exacto (case-insensitive) de un servicio registrado activo en REPSE',
    },
    archivos: files.map((file) => ({
      archivo: file.name,
      escenario: file.name.replace('.xlsx', '').replace(/^\d+-/, ''),
    })),
  }

  const jsonPath = join(OUTPUT_DIR, 'DATOS-PRUEBA.json')
  await writeFile(jsonPath, `${JSON.stringify(datosPrueba, null, 2)}\n`, 'utf8')
  console.log(`Generado: ${jsonPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
