import { test } from '@japa/runner'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
import ExcelJS from 'exceljs'
import {
  GetObjectAclCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import env from '#start/env'
import UploadService from '#services/upload_service'
import { FileIntakeError } from '#exceptions/file_intake_error'
import { FILE_INTAKE_ERROR_CODES } from '#constants/file_intake_error_codes'
import type { FileIntakeProfileName } from '#constants/file_intake'

/**
 * Smoke test de la cadena real de subida contra el almacenamiento configurado
 * (MinIO en desarrollo). Verifica sobre el OBJETO YA ESCRITO: clave, ACL,
 * ContentType y que el binario quedo re-encodeado y sin metadatos.
 *
 * No corre en la suite normal: requiere `RUN_STORAGE_SMOKE=1` y un
 * almacenamiento alcanzable, para no romper la suite en una maquina sin el
 * compose levantado.
 */

const inspector = new S3Client({
  region: env.get('AWS_DEFAULT_REGION') || 'us-east-1',
  endpoint: env.get('AWS_ENDPOINT'),
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: env.get('AWS_SECRET_ACCESS_KEY'),
  },
  maxAttempts: 1,
})

const BUCKET = env.get('AWS_BUCKET')
const ROOT = env.get('AWS_ROOT_PATH')
const CARPETA = 'smoke-intake'
const HABILITADO = process.env.RUN_STORAGE_SMOKE === '1'

async function buildMultipartFile(nombre: string, contenido: Buffer) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'smoke-'))
  const tmpPath = path.join(dir, nombre)
  await fs.writeFile(tmpPath, contenido)
  return {
    tmpPath,
    clientName: nombre,
    extname: nombre.split('.').pop() ?? '',
    size: contenido.length,
  }
}

async function buildPng(): Promise<Buffer> {
  return sharp({ create: { width: 48, height: 48, channels: 3, background: '#2e5fa3' } })
    .png()
    .toBuffer()
}

/**
 * Lee del bucket la metadata, el ACL y el cuerpo del objeto recien escrito.
 *
 * `público` vale `null` cuando el backend no implementa ACL por objeto: MinIO
 * acepta el `ACL: public-read` sin error pero `GetObjectAcl` siempre responde
 * `FULL_CONTROL` de `CanonicalUser`, sin grant de `AllUsers`. Verificado contra
 * el MinIO local. DigitalOcean Spaces si los reporta, así que ahí la aserción
 * de ACL efectivo si corre.
 */
async function inspectStoredObject(key: string) {
  const head = await inspector.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
  const obj = await inspector.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  const body = Buffer.from(await obj.Body!.transformToByteArray())
  const acl = await inspector.send(new GetObjectAclCommand({ Bucket: BUCKET, Key: key }))

  const grants = acl.Grants ?? []
  const reportaAcl = grants.some((g) => g.Grantee?.URI !== undefined)
  const publico = reportaAcl
    ? grants.some((g) => g.Grantee?.URI?.includes('AllUsers') && g.Permission === 'READ')
    : null

  return { contentType: head.ContentType, body, publico }
}

/** Ejecuta una subida real y devuelve la key del objeto escrito. */
async function uploadWithProfile(nombre: string, contenido: Buffer, perfil: FileIntakeProfileName) {
  const resultado = await new UploadService().fileUpload(
    await buildMultipartFile(nombre, contenido),
    perfil,
    CARPETA
  )
  // Un perfil público devuelve URL; uno privado devuelve la key directa.
  const key = resultado.startsWith('http')
    ? decodeURIComponent(new URL(resultado).pathname.replace(`/${BUCKET}/`, ''))
    : resultado
  return { resultado, key }
}

test.group('Smoke — subida real al almacenamiento', (group) => {
  group.tap((t) => t.skip(!HABILITADO, 'define RUN_STORAGE_SMOKE=1 para ejecutarlo'))

  test('foto de perfil: privada, JPEG real, sin EXIF y sin el nombre del cliente', async ({
    assert,
  }) => {
    const conExif = await sharp({
      create: { width: 48, height: 48, channels: 3, background: '#aa4455' },
    })
      .withMetadata({ exif: { IFD0: { Copyright: 'Identificante', Artist: 'Autor' } } })
      .jpeg()
      .toBuffer()

    const { key } = await uploadWithProfile('nomina secreta.jpg', conExif, 'profile-photo')
    const o = await inspectStoredObject(key)

    assert.isTrue(key.startsWith(`${ROOT}/${CARPETA}/`), `clave inesperada: ${key}`)
    assert.notInclude(key, 'nomina')
    assert.notInclude(key, ' ')
    assert.isTrue(key.endsWith('.jpg'))
    assert.equal(o.contentType, 'image/jpeg')
    assert.notEqual(o.publico, true, 'la foto de perfil NO debe ser publica')
    const metadatos = await sharp(o.body).metadata()
    assert.isUndefined(metadatos.exif, 'sobrevivio EXIF')
  })

  test('branding: publico y PNG aunque entre WebP', async ({ assert }) => {
    const webp = await sharp(await buildPng())
      .webp()
      .toBuffer()
    const { resultado, key } = await uploadWithProfile('logotipo.webp', webp, 'branding-asset')
    const o = await inspectStoredObject(key)

    // La señal observable del perfil público es que devuelve URL en lugar de key.
    assert.isTrue(resultado.startsWith('http'), 'un perfil publico devuelve URL')
    assert.isTrue(key.endsWith('.png'))
    assert.equal(o.contentType, 'image/png')
    if (o.publico !== null) {
      assert.isTrue(o.publico, 'el branding es el unico perfil publico')
    }
    const metadatos = await sharp(o.body).metadata()
    assert.equal(metadatos.format, 'png')
  })

  test('PDF: privado y sin metadatos de autor', async ({ assert }) => {
    const doc = await PDFDocument.create()
    doc.addPage()
    doc.setAuthor('Autor Identificante')
    doc.setTitle('Titulo Identificante')

    const { key } = await uploadWithProfile('acta.pdf', Buffer.from(await doc.save()), 'pdf-document')
    const o = await inspectStoredObject(key)

    assert.equal(o.contentType, 'application/pdf')
    assert.notEqual(o.publico, true)
    const recargado = await PDFDocument.load(new Uint8Array(o.body))
    assert.equal(recargado.getAuthor(), '')
    assert.equal(recargado.getTitle(), '')
  })

  test('firma: privada y PNG', async ({ assert }) => {
    const { key } = await uploadWithProfile('firma.png', await buildPng(), 'signature')
    const o = await inspectStoredObject(key)

    assert.isTrue(key.endsWith('.png'))
    assert.equal(o.contentType, 'image/png')
    assert.notEqual(o.publico, true)
  })

  test('evidencia: PDF e imagen conviven en el mismo perfil', async ({ assert }) => {
    const doc = await PDFDocument.create()
    doc.addPage()
    const comoPdf = await uploadWithProfile('evidencia.pdf', Buffer.from(await doc.save()), 'evidence-document')
    const comoImagen = await uploadWithProfile('evidencia.png', await buildPng(), 'evidence-document')

    const oPdf = await inspectStoredObject(comoPdf.key)
    const oImagen = await inspectStoredObject(comoImagen.key)

    assert.equal(oPdf.contentType, 'application/pdf')
    assert.equal(oImagen.contentType, 'image/jpeg')
  })

  test('hoja de calculo: se acepta sin alterar el binario', async ({ assert }) => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('hoja').addRow(['dato'])
    const xlsx = Buffer.from(await wb.xlsx.writeBuffer())

    const { key } = await uploadWithProfile('empleados.xlsx', xlsx, 'spreadsheet-import')
    const o = await inspectStoredObject(key)

    assert.equal(o.contentType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    assert.isTrue(o.body.equals(xlsx))
  })

  test('solo el perfil de branding devuelve URL publica; el resto devuelve key', async ({
    assert,
  }) => {
    const imagen = await buildPng()
    const branding = await uploadWithProfile('logotipo.png', imagen, 'branding-asset')
    const foto = await uploadWithProfile('foto.png', imagen, 'profile-photo')
    const firma = await uploadWithProfile('firma.png', imagen, 'signature')

    assert.isTrue(branding.resultado.startsWith('http'), 'branding debe devolver URL')
    assert.isFalse(foto.resultado.startsWith('http'), 'la foto debe devolver key, no URL')
    assert.isFalse(firma.resultado.startsWith('http'), 'la firma debe devolver key, no URL')
  })

  test('el payload pegado tras el fin del PNG no llega al bucket', async ({ assert }) => {
    const payload = Buffer.from('<?php system($_GET["c"]); ?>')
    const conPayload = Buffer.concat([await buildPng(), payload])

    const { key } = await uploadWithProfile('foto.png', conPayload, 'profile-photo')
    const o = await inspectStoredObject(key)

    assert.isFalse(o.body.includes(payload), 'el payload llego al bucket')
  })
})

test.group('Smoke — familias prohibidas rechazadas antes del bucket', (group) => {
  group.tap((t) => t.skip(!HABILITADO, 'define RUN_STORAGE_SMOKE=1 para ejecutarlo'))

  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
  const casos: Array<[string, string, Buffer, FileIntakeProfileName, string]> = [
    [
      'SVG',
      'logotipo.svg',
      Buffer.from(svg),
      'branding-asset',
      FILE_INTAKE_ERROR_CODES.EXTENSION_BLOCKED,
    ],
    [
      'SVG renombrado a .png',
      'logotipo.png',
      Buffer.from(svg),
      'branding-asset',
      FILE_INTAKE_ERROR_CODES.CONTENT_TYPE_INVALID,
    ],
    [
      'doble extension php.jpg',
      'factura.php.jpg',
      Buffer.from('cualquier cosa'),
      'profile-photo',
      FILE_INTAKE_ERROR_CODES.EXTENSION_BLOCKED,
    ],
    [
      'binario declarado imagen',
      'foto.jpg',
      Buffer.from('MZ'.padEnd(200, 'x')),
      'profile-photo',
      FILE_INTAKE_ERROR_CODES.CONTENT_TYPE_INVALID,
    ],
  ]

  for (const [etiqueta, nombre, contenido, perfil, codigo] of casos) {
    test(`${etiqueta}: error con triplete y nada escrito`, async ({ assert }) => {
      try {
        await uploadWithProfile(nombre, contenido, perfil)
        assert.fail(`${etiqueta} fue aceptado`)
      } catch (error) {
        assert.instanceOf(error, FileIntakeError, `${etiqueta} lanzo excepcion cruda`)
        const e = error as FileIntakeError
        assert.equal(e.errorCode, codigo)
        assert.isNotEmpty(e.title)
        assert.isNotEmpty(e.detail)
        assert.isNotEmpty(e.key)
        assert.equal(e.status, 422)
      }
    })
  }
})

test.group('Smoke — key propia del modulo', (group) => {
  group.tap((t) => t.skip(!HABILITADO, 'define RUN_STORAGE_SMOKE=1 para ejecutarlo'))

  test('la ruta determinista se respeta pero la extension refleja el contenido real', async ({
    assert,
  }) => {
    // Los modulos con expediente componen su key con el nombre del cliente, asi
    // que arrastraban una extension que podia mentir: un PNG que el perfil
    // convierte a JPEG se guardaba como `.png`.
    const keyPropia = `${CARPETA}/expediente/2026/evidencia-original.png`
    const resultado = await new UploadService().fileUpload(
      await buildMultipartFile('evidencia-original.png', await buildPng()),
      'evidence-document',
      '',
      { fileName: keyPropia }
    )

    assert.include(resultado, `${CARPETA}/expediente/2026/evidencia-original`)
    assert.isTrue(resultado.endsWith('.jpg'), `la key deberia terminar en .jpg: ${resultado}`)

    const o = await inspectStoredObject(resultado)
    assert.equal(o.contentType, 'image/jpeg')
  })

  test('un PDF conserva su extension porque no cambia de formato', async ({ assert }) => {
    const doc = await PDFDocument.create()
    doc.addPage()
    const keyPropia = `${CARPETA}/expediente/2026/acta.pdf`
    const resultado = await new UploadService().fileUpload(
      await buildMultipartFile('acta.pdf', Buffer.from(await doc.save())),
      'pdf-document',
      '',
      { fileName: keyPropia }
    )

    assert.isTrue(resultado.endsWith('.pdf'))
  })
})
