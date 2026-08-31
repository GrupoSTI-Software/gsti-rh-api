import { test } from '@japa/runner'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import ExcelJS from 'exceljs'
import FileIntakeService from '../../../app/services/file_intake_service.js'
import { FileIntakeError } from '../../../app/exceptions/file_intake_error.js'
import { FILE_INTAKE_ERROR_CODES } from '../../../app/constants/file_intake_error_codes.js'
import type { FileIntakeProfileName } from '../../../app/constants/file_intake.js'

/**
 * Archivo multipart minimo respaldado por un temporal real: el intake lee el
 * contenido del disco, no lo que declare el objeto.
 */
async function fakeMultipartFile(params: {
  content: Buffer
  clientName: string
  extname?: string
  size?: number
}) {
  const tmpPath = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), 'file-intake-')),
    params.clientName.split('/').pop() ?? 'archivo'
  )
  await fs.writeFile(tmpPath, params.content)

  return {
    tmpPath,
    clientName: params.clientName,
    extname: params.extname ?? params.clientName.split('.').pop() ?? '',
    size: params.size ?? params.content.length,
  }
}

async function buildPng(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 40, channels: 3, background: '#2e5fa3' } })
    .png()
    .toBuffer()
}

async function buildPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  doc.addPage()
  doc.setAuthor('Autor Identificante')
  doc.setTitle('Titulo Identificante')
  return Buffer.from(await doc.save())
}

async function buildXlsx(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('hoja').addRow(['dato'])
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

/** Ejecuta el intake esperando rechazo y devuelve el error de dominio. */
async function expectRejection(
  file: Awaited<ReturnType<typeof fakeMultipartFile>>,
  profile: FileIntakeProfileName
): Promise<FileIntakeError> {
  try {
    await new FileIntakeService().accept(file, profile)
  } catch (error) {
    if (error instanceof FileIntakeError) {
      return error
    }
    throw new Error(`Se esperaba FileIntakeError y llego ${String(error)}`)
  }
  throw new Error('Se esperaba un rechazo y el archivo fue aceptado')
}

test.group('FileIntakeService — familias prohibidas', () => {
  test('rechaza un SVG aunque se anuncie como imagen', async ({ assert }) => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    )
    const file = await fakeMultipartFile({ content: svg, clientName: 'logotipo.svg' })

    const error = await expectRejection(file, 'branding-asset')

    assert.equal(error.errorCode, FILE_INTAKE_ERROR_CODES.EXTENSION_BLOCKED)
    assert.isNotEmpty(error.title)
    assert.isNotEmpty(error.detail)
    assert.isNotEmpty(error.key)
  })

  test('rechaza un SVG renombrado a .png por su contenido real', async ({ assert }) => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')
    const file = await fakeMultipartFile({ content: svg, clientName: 'logotipo.png' })

    const error = await expectRejection(file, 'branding-asset')

    assert.equal(error.errorCode, FILE_INTAKE_ERROR_CODES.CONTENT_TYPE_INVALID)
  })

  test('rechaza la doble extension x.php.jpg', async ({ assert }) => {
    const png = await buildPng()
    const file = await fakeMultipartFile({ content: png, clientName: 'factura.php.jpg' })

    const error = await expectRejection(file, 'profile-photo')

    assert.equal(error.errorCode, FILE_INTAKE_ERROR_CODES.EXTENSION_BLOCKED)
    assert.equal(error.key, 'extension-bloqueada')
  })

  test('rechaza un binario declarado como imagen', async ({ assert }) => {
    const binario = Buffer.from('MZ\x90\x00\x03' + '\x00'.repeat(200), 'binary')
    const file = await fakeMultipartFile({ content: binario, clientName: 'foto.jpg' })

    const error = await expectRejection(file, 'profile-photo')

    assert.equal(error.errorCode, FILE_INTAKE_ERROR_CODES.CONTENT_TYPE_INVALID)
  })

  test('rechaza un ZIP renombrado a .xlsx antes de llegar al parser', async ({ assert }) => {
    const zip = Buffer.concat([Buffer.from('PK\x03\x04', 'binary'), Buffer.alloc(120)])
    const file = await fakeMultipartFile({ content: zip, clientName: 'empleados.xlsx' })

    const error = await expectRejection(file, 'spreadsheet-import')

    assert.equal(error.errorCode, FILE_INTAKE_ERROR_CODES.CONTENT_TYPE_INVALID)
  })

  test('rechaza un PDF en un perfil que solo acepta imagen', async ({ assert }) => {
    const pdf = await buildPdf()
    const file = await fakeMultipartFile({ content: pdf, clientName: 'documento.pdf' })

    const error = await expectRejection(file, 'profile-photo')

    assert.equal(error.errorCode, FILE_INTAKE_ERROR_CODES.EXTENSION_NOT_ALLOWED)
  })

  test('rechaza por tamano declarado antes de leer el contenido', async ({ assert }) => {
    const png = await buildPng()
    const file = await fakeMultipartFile({
      content: png,
      clientName: 'foto.png',
      size: 5 * 1024 * 1024,
    })

    const error = await expectRejection(file, 'profile-photo')

    assert.equal(error.errorCode, FILE_INTAKE_ERROR_CODES.FILE_TOO_LARGE)
  })

  test('rechaza la ausencia de archivo con el triplete, no con excepcion cruda', async ({
    assert,
  }) => {
    try {
      await new FileIntakeService().accept(null, 'pdf-document')
      throw new Error('Se esperaba un rechazo')
    } catch (error) {
      assert.instanceOf(error, FileIntakeError)
      assert.equal((error as FileIntakeError).errorCode, FILE_INTAKE_ERROR_CODES.FILE_MISSING)
    }
  })
})

test.group('FileIntakeService — neutralizacion de contenido', () => {
  test('elimina el payload pegado despues del fin de un PNG', async ({ assert }) => {
    const payload = Buffer.from('<?php system($_GET["c"]); ?>')
    const conPayload = Buffer.concat([await buildPng(), payload])
    const file = await fakeMultipartFile({ content: conPayload, clientName: 'foto.png' })

    const result = await new FileIntakeService().accept(file, 'profile-photo')

    assert.isFalse(result.buffer.includes(payload), 'el payload sobrevivio al re-encode')
    assert.equal(result.mimeType, 'image/jpeg')
  })

  test('descarta los metadatos identificantes de un PDF', async ({ assert }) => {
    const file = await fakeMultipartFile({ content: await buildPdf(), clientName: 'acta.pdf' })

    const result = await new FileIntakeService().accept(file, 'pdf-document')
    const reloaded = await PDFDocument.load(new Uint8Array(result.buffer))

    assert.equal(reloaded.getAuthor(), '')
    assert.equal(reloaded.getTitle(), '')
  })

  test('descarta la orientacion y los metadatos EXIF de una foto', async ({ assert }) => {
    const conExif = await sharp({
      create: { width: 40, height: 40, channels: 3, background: '#aa4455' },
    })
      .withMetadata({ exif: { IFD0: { Copyright: 'Identificante', Artist: 'Autor' } } })
      .jpeg()
      .toBuffer()
    const file = await fakeMultipartFile({ content: conExif, clientName: 'foto.jpg' })

    const result = await new FileIntakeService().accept(file, 'profile-photo')
    const metadata = await sharp(result.buffer).metadata()

    assert.isUndefined(metadata.exif)
  })
})

test.group('FileIntakeService — formatos aceptados por perfil', () => {
  test('normaliza a JPEG la foto de perfil llegue como llegue', async ({ assert }) => {
    const png = await buildPng()
    const entradas: Array<[string, Buffer]> = [
      ['foto.png', png],
      ['foto.jpg', await sharp(png).jpeg().toBuffer()],
      ['foto.webp', await sharp(png).webp().toBuffer()],
    ]

    for (const [clientName, content] of entradas) {
      const file = await fakeMultipartFile({ content, clientName })
      const result = await new FileIntakeService().accept(file, 'profile-photo')

      assert.equal(result.mimeType, 'image/jpeg', `fallo con ${clientName}`)
      assert.isTrue(result.storageFileName.endsWith('.jpg'))
      assert.isFalse(result.storesPublicly)
    }
  })

  test('normaliza a PNG el branding y lo marca como publico', async ({ assert }) => {
    const webp = await sharp(await buildPng())
      .webp()
      .toBuffer()
    const file = await fakeMultipartFile({ content: webp, clientName: 'logotipo.webp' })

    const result = await new FileIntakeService().accept(file, 'branding-asset')

    assert.equal(result.mimeType, 'image/png')
    assert.isTrue(result.storageFileName.endsWith('.png'))
    assert.isTrue(result.storesPublicly, 'el branding es el unico perfil publico')
  })

  test('acepta la hoja OOXML real del importador sin alterarla', async ({ assert }) => {
    const xlsx = await buildXlsx()
    const file = await fakeMultipartFile({ content: xlsx, clientName: 'empleados.xlsx' })

    const result = await new FileIntakeService().accept(file, 'spreadsheet-import')

    assert.equal(
      result.mimeType,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    assert.isTrue(result.buffer.equals(xlsx), 'la hoja no debe alterarse')
  })

  test('acepta PDF y foto en el perfil de evidencia', async ({ assert }) => {
    const pdf = await fakeMultipartFile({ content: await buildPdf(), clientName: 'evidencia.pdf' })
    const foto = await fakeMultipartFile({ content: await buildPng(), clientName: 'evidencia.png' })
    const service = new FileIntakeService()

    const pdfResult = await service.accept(pdf, 'evidence-document')
    const fotoResult = await service.accept(foto, 'evidence-document')

    assert.equal(pdfResult.mimeType, 'application/pdf')
    assert.equal(fotoResult.mimeType, 'image/jpeg')
  })

  test('el nombre de almacenamiento no repite el del cliente ni es predecible', async ({
    assert,
  }) => {
    const service = new FileIntakeService()
    const primero = await service.accept(
      await fakeMultipartFile({ content: await buildPng(), clientName: 'nomina secreta.png' }),
      'profile-photo'
    )
    const segundo = await service.accept(
      await fakeMultipartFile({ content: await buildPng(), clientName: 'nomina secreta.png' }),
      'profile-photo'
    )

    assert.notInclude(primero.storageFileName, 'nomina')
    assert.notInclude(primero.storageFileName, ' ')
    assert.notEqual(primero.storageFileName, segundo.storageFileName)
  })
})

test.group('FileIntakeService — perfil del buzon de quejas', () => {
  test('conserva el formato de imagen de origen', async ({ assert }) => {
    const png = await buildPng()
    const service = new FileIntakeService()

    const comoPng = await service.accept(
      await fakeMultipartFile({ content: png, clientName: 'adjunto.png' }),
      'complaint-attachment'
    )
    const comoWebp = await service.accept(
      await fakeMultipartFile({
        content: await sharp(png).webp().toBuffer(),
        clientName: 'adjunto.webp',
      }),
      'complaint-attachment'
    )

    assert.equal(comoPng.mimeType, 'image/png')
    assert.equal(comoWebp.mimeType, 'image/webp')
  })

  test('mantiene bloqueadas las extensiones de script', async ({ assert }) => {
    const png = await buildPng()
    const file = await fakeMultipartFile({ content: png, clientName: 'evidencia.exe.png' })

    const error = await expectRejection(file, 'complaint-attachment')

    assert.equal(error.errorCode, FILE_INTAKE_ERROR_CODES.EXTENSION_BLOCKED)
  })
})
