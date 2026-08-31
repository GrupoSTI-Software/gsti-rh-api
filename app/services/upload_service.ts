import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectAclCommand,
  S3Client,
  type ObjectCannedACL,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import Env from '#start/env'
import FileIntakeService from '#services/file_intake_service'
import type { FileIntakeProfileName } from '#constants/file_intake'
import https from 'node:https'
import http from 'node:http'
import { Readable } from 'node:stream'
import logger from '@adonisjs/core/services/logger'

/**
 * Resultado de obtener un objeto de S3 como stream junto con metadata útil
 * para servirlo en una respuesta HTTP.
 */
/** Ajustes opcionales de una subida. */
export interface FileUploadOptions {
  /**
   * Key relativa dentro de la carpeta, cuando el modulo necesita una ruta
   * determinista propia. Si se omite, el intake genera un nombre no predecible
   * con la extension del MIME real.
   */
  readonly fileName?: string
}

export interface S3ObjectStream {
  stream: Readable
  contentType: string
  contentLength?: number
  etag?: string
  lastModified?: Date
}

/**
 * Cliente S3 compartido por todo el proceso.
 *
 * El SDK v2 creaba una instancia por llamada; v3 mantiene el pool de conexiones
 * en el cliente, así que reusarlo evita renegociar TLS en cada subida.
 *
 * `forcePathStyle` es obligatorio para DigitalOcean Spaces y para el MinIO de
 * desarrollo. Sin límites explícitos el SDK reintenta esperando el timeout TCP
 * del sistema operativo (~75 s por intento), lo que producía cuelgues de
 * minutos cuando el endpoint no era alcanzable desde la red actual.
 */
const s3Client = new S3Client({
  region: Env.get('AWS_DEFAULT_REGION') || 'us-east-1',
  endpoint: Env.get('AWS_ENDPOINT'),
  forcePathStyle: true,
  credentials: {
    accessKeyId: Env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: Env.get('AWS_SECRET_ACCESS_KEY'),
  },
  maxAttempts: 1,
  requestHandler: {
    connectionTimeout: 10_000,
    requestTimeout: 120_000,
  },
})

/** Forma mínima de un error del SDK que el servicio necesita interpretar. */
interface S3ErrorShape {
  name?: string
  message?: string
  $metadata?: { httpStatusCode?: number }
}

function asS3Error(error: unknown): S3ErrorShape {
  return typeof error === 'object' && error !== null ? (error as S3ErrorShape) : {}
}

/** Verdadero cuando el objeto no existe o las credenciales no alcanzan a verlo. */
function isMissingObjectError(error: unknown): boolean {
  const err = asS3Error(error)
  const status = err.$metadata?.httpStatusCode
  return (
    err.name === 'NotFound' ||
    err.name === 'NoSuchKey' ||
    err.name === 'AccessDenied' ||
    status === 404 ||
    status === 403
  )
}

/** Convierte el cuerpo de una respuesta de S3 en Buffer. */
async function bodyToBuffer(body: unknown): Promise<Buffer | null> {
  if (!body) return null

  const streamLike = body as { transformToByteArray?: () => Promise<Uint8Array> }
  if (typeof streamLike.transformToByteArray === 'function') {
    return Buffer.from(await streamLike.transformToByteArray())
  }

  return null
}

export default class UploadService {
  private BUCKET_NAME = Env.get('AWS_BUCKET')
  private APP_NAME = `${Env.get('AWS_ROOT_PATH')}/`

  /**
   * Sube un archivo multipart al bucket.
   *
   * TODO archivo pasa obligatoriamente por `FileIntakeService` antes de tocar
   * el bucket: el perfil decide que se acepta, en que se transforma, como se
   * llama el objeto y si es publico. Nada de esto se deriva ya de lo que
   * declara el cliente.
   *
   * @param file        Archivo tal como lo entrega `request.file()`.
   * @param profileName Perfil de uso. Obligatorio: no hay subida sin politica.
   * @param folderName  Carpeta logica bajo `{AWS_ROOT_PATH}/`.
   * @param options     `fileName` solo cuando el modulo construye su propia key
   *                    determinista (expediente REPSE, evidencias, adjuntos).
   *
   * @returns La Key del objeto si es privado, o su URL publica si el perfil lo
   *          declara publico. `'file_not_found'` cuando no llego archivo y
   *          `'S3Producer.fileUpload'` cuando falla el bucket, igual que antes.
   *
   * @throws {FileIntakeError} Si el archivo llego pero no pasa la politica del
   *         perfil. Es un 422 con triplete, no un fallo del servidor.
   */
  async fileUpload(
    file: unknown,
    profileName: FileIntakeProfileName,
    folderName = '',
    options: FileUploadOptions = {}
  ): Promise<string> {
    // Archivo ausente sigue siendo un caso valido: hay campos opcionales.
    if (!file) {
      return 'file_not_found'
    }

    const intake = await new FileIntakeService().accept(
      file as Parameters<FileIntakeService['accept']>[0],
      profileName
    )

    const fileNameGenerated = options.fileName || intake.storageFileName
    const key = `${this.APP_NAME}${folderName || 'files'}/${fileNameGenerated}`
    const permission: ObjectCannedACL = intake.storesPublicly ? 'public-read' : 'private'

    try {
      await new Upload({
        client: s3Client,
        params: {
          Bucket: this.BUCKET_NAME,
          Key: key,
          Body: intake.buffer,
          ACL: permission,
          // El ContentType sale del contenido real, nunca de `file.type`.
          ContentType: intake.mimeType,
        },
      }).done()

      return intake.storesPublicly ? this.buildPublicUrl(key) : key
    } catch (err) {
      logger.error(
        {
          err,
          bucket: this.BUCKET_NAME,
          endpoint: Env.get('AWS_ENDPOINT'),
          folder: folderName,
        },
        'Fallo al subir archivo a S3'
      )
      return 'S3Producer.fileUpload'
    }
  }

  /**
   * Sube un buffer ya sanitizado como objeto privado en S3.
   * Devuelve la Key completa del objeto (misma convención que `fileUpload`).
   */
  async uploadPrivateBuffer(
    relativeKey: string,
    body: Buffer,
    contentType: string
  ): Promise<string | null> {
    try {
      const key = relativeKey.startsWith(this.APP_NAME)
        ? relativeKey
        : `${this.APP_NAME}files/${relativeKey}`

      await new Upload({
        client: s3Client,
        params: {
          Bucket: this.BUCKET_NAME,
          Key: key,
          Body: body,
          ACL: 'private',
          ContentType: contentType,
        },
      }).done()

      return key
    } catch (err) {
      logger.error(
        {
          err,
          bucket: this.BUCKET_NAME,
          endpoint: Env.get('AWS_ENDPOINT'),
          key: relativeKey,
        },
        'Fallo al subir buffer privado a S3'
      )
      return null
    }
  }

  async getDownloadLink(filePath: string, expireSeconds = 60 * 60 * 24) {
    if (!filePath) {
      return { status: 404, data: null, message: 'file_path_not_found' }
    }

    try {
      // Generar URL temporal firmada para archivos privados
      const temporalURL = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: this.BUCKET_NAME,
          Key: filePath,
        }),
        { expiresIn: expireSeconds }
      )

      return temporalURL
    } catch (error: unknown) {
      const err = asS3Error(error)
      return { status: 500, data: null, message: `get_url_failed: ${err.message ?? 'unknown'}` }
    }
  }

  /**
   * Descarga un archivo directamente desde S3 como Buffer
   * Más confiable que usar URLs firmadas cuando hay problemas de red
   */
  async downloadFileBuffer(filePath: string): Promise<Buffer | null> {
    if (!filePath || !this.BUCKET_NAME) return null

    try {
      const result = await s3Client.send(
        new GetObjectCommand({
          Bucket: this.BUCKET_NAME,
          Key: filePath,
        })
      )

      return await bodyToBuffer(result.Body)
    } catch {
      return null
    }
  }

  /**
   * Obtiene un objeto de S3 como stream listo para hacer pipe a la respuesta HTTP.
   * Devuelve null cuando el objeto no existe (NoSuchKey / NotFound / 403).
   * Lanza cualquier otro error del SDK para que la capa superior lo mapee.
   */
  async getObjectStream(key: string, bucket?: string): Promise<S3ObjectStream | null> {
    const targetBucket = bucket || this.BUCKET_NAME

    if (!key) {
      logger.warn({ key }, 'getObjectStream: key vacía')
      return null
    }
    if (!targetBucket) {
      logger.warn(
        { key },
        'getObjectStream: bucket no resuelto (AWS_BUCKET no configurado y sin bucket explícito)'
      )
      return null
    }

    const params = { Bucket: targetBucket, Key: key }

    try {
      // Verificar existencia y obtener metadata sin descargar el cuerpo.
      const head = await s3Client.send(new HeadObjectCommand(params))
      const object = await s3Client.send(new GetObjectCommand(params))

      return {
        stream: object.Body as Readable,
        contentType: head.ContentType || 'application/octet-stream',
        contentLength: head.ContentLength,
        etag: head.ETag,
        lastModified: head.LastModified,
      }
    } catch (error: unknown) {
      if (isMissingObjectError(error)) {
        const err = asS3Error(error)
        logger.warn(
          {
            bucket: targetBucket,
            key,
            code: err.name,
            statusCode: err.$metadata?.httpStatusCode,
          },
          'getObjectStream: objeto no encontrado o sin acceso en S3'
        )
        return null
      }
      throw error
    }
  }

  /**
   * Genera URLs temporales para múltiples archivos
   * Útil para cuando se obtienen listados de registros con archivos privados
   */
  async getDownloadLinks(
    filePaths: string[],
    expireSeconds = 60 * 60 * 24
  ): Promise<{ [key: string]: string }> {
    const urls: { [key: string]: string } = {}

    for (const filePath of filePaths) {
      if (filePath && typeof filePath === 'string') {
        try {
          const url = await this.getDownloadLink(filePath, expireSeconds)
          // Solo agregar si es una URL válida (string)
          if (typeof url === 'string') {
            urls[filePath] = url
          }
        } catch (error) {
          // Continuar con el siguiente archivo si uno falla
          continue
        }
      }
    }

    return urls
  }

  /**
   * Punto de entrada unificado para hacer stream de un archivo guardado en BD.
   *
   * - Path es URL pública (legacy, ACL public-read): hace HTTP GET directo a la URL.
   *   No requiere credenciales S3; funciona aunque las claves del env no tengan acceso
   *   al bucket donde se subió originalmente el archivo.
   * - Path es Key directa (archivos nuevos, ACL private): usa el SDK de S3 con las
   *   credenciales del env para obtener el stream de un objeto privado.
   *
   * Devuelve `null` si el archivo no existe o no es accesible.
   */
  async streamStoredFile(storedPath: string): Promise<S3ObjectStream | null> {
    if (!storedPath) return null

    if (storedPath.startsWith('http://') || storedPath.startsWith('https://')) {
      return this.streamFromPublicUrl(storedPath)
    }

    return this.getObjectStream(storedPath)
  }

  /**
   * Hace stream de un archivo accesible públicamente via HTTP/HTTPS.
   * Usado para expedientes legacy subidos con ACL public-read.
   */
  private streamFromPublicUrl(publicUrl: string): Promise<S3ObjectStream | null> {
    return new Promise((resolve, reject) => {
      const protocol = publicUrl.startsWith('https://') ? https : http

      const req = protocol.get(publicUrl, (res) => {
        if (res.statusCode === 404 || res.statusCode === 403) {
          logger.warn(
            { url: publicUrl, statusCode: res.statusCode },
            'streamFromPublicUrl: archivo no encontrado o sin acceso'
          )
          res.resume()
          resolve(null)
          return
        }

        if (!res.statusCode || res.statusCode >= 400) {
          logger.warn(
            { url: publicUrl, statusCode: res.statusCode },
            'streamFromPublicUrl: respuesta inesperada del servidor de origen'
          )
          res.resume()
          resolve(null)
          return
        }

        const contentLength = res.headers['content-length']
          ? Number.parseInt(res.headers['content-length'], 10)
          : undefined
        const lastModifiedHeader = res.headers['last-modified']

        resolve({
          stream: res as unknown as Readable,
          contentType: res.headers['content-type'] || 'application/octet-stream',
          contentLength,
          etag: res.headers['etag'],
          lastModified: lastModifiedHeader ? new Date(lastModifiedHeader) : undefined,
        })
      })

      req.on('error', (err) => {
        logger.error({ url: publicUrl, err }, 'streamFromPublicUrl: error de red')
        reject(err)
      })
    })
  }

  /**
   * Resuelve la referencia S3 completa (bucket + key) desde cualquier forma en que
   * se almacena un archivo en la base de datos:
   *
   * - URL path-style:     https://region.digitaloceanspaces.com/bucket/key
   *                       → { bucket: "bucket", key: "key" }
   * - URL virtual-hosted: https://bucket.region.digitaloceanspaces.com/key
   *                       → { bucket: "bucket", key: "key" }
   * - Con prefijo bucket: bucket/key  (coincide con BUCKET_NAME del env)
   *                       → { bucket: BUCKET_NAME, key: "key" }
   * - Key directa:        app/folder/file.pdf
   *                       → { bucket: BUCKET_NAME, key: "app/folder/file.pdf" }
   *
   * Para URLs de DO Spaces el bucket se extrae de la propia URL, por lo que funciona
   * correctamente aunque AWS_BUCKET en el env apunte a un bucket diferente (filas legacy).
   *
   * Devuelve `null` si la cadena es una URL irreconocible o si el path resultante es vacío.
   */
  resolveS3Ref(storedPath: string): { bucket: string; key: string } | null {
    if (!storedPath) return null

    if (storedPath.includes('digitaloceanspaces.com')) {
      try {
        const url = new URL(storedPath)
        const hostLabels = url.hostname.split('.').length
        const rawPath = url.pathname.replace(/^\//, '')

        let bucket: string
        let key: string

        if (hostLabels <= 3) {
          // path-style: region.digitaloceanspaces.com/bucket/key
          const slash = rawPath.indexOf('/')
          if (slash === -1) return null
          bucket = rawPath.slice(0, slash)
          key = decodeURIComponent(rawPath.slice(slash + 1))
        } else {
          // virtual-hosted: bucket.region.digitaloceanspaces.com/key
          bucket = url.hostname.split('.')[0]
          key = decodeURIComponent(rawPath)
        }

        if (!bucket || !key) return null
        return { bucket, key }
      } catch {
        return null
      }
    }

    // No es URL: key directa o con prefijo de bucket
    let key = storedPath
    if (this.BUCKET_NAME && storedPath.startsWith(this.BUCKET_NAME + '/')) {
      key = storedPath.slice(this.BUCKET_NAME.length + 1)
    }

    return { bucket: this.BUCKET_NAME || '', key: decodeURIComponent(key) }
  }

  /**
   * @deprecated Usar resolveS3Ref para obtener bucket + key juntos.
   * Mantenido por compatibilidad con código existente que solo necesita la key.
   */
  resolveObjectKey(storedPath: string): string | null {
    const ref = this.resolveS3Ref(storedPath)
    return ref ? ref.key : null
  }

  async deleteFile(fileUrlOrKey = '') {
    if (!fileUrlOrKey) {
      return { status: 404, data: null, message: 'file_path_not_found' }
    }

    const ref = this.resolveS3Ref(fileUrlOrKey)
    if (!ref) {
      return { status: 400, data: null, message: 'invalid_url_format' }
    }

    const params = { Bucket: ref.bucket, Key: ref.key }

    try {
      await s3Client.send(new HeadObjectCommand(params))
      const delResponse = await s3Client.send(new DeleteObjectCommand(params))
      return { status: 200, data: delResponse, message: 'file_deleted_successfully' }
    } catch (error: unknown) {
      const err = asS3Error(error)
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return { status: 404, data: null, message: 'file_not_found' }
      }
      return { status: 500, data: null, message: `delete_failed: ${err.message ?? 'unknown'}` }
    }
  }

  /**
   * Determina si un archivo almacenado en BD fue subido con ACL public-read.
   *
   * No llama a `getObjectAcl` del SDK porque DO Spaces y otros proveedores
   * S3-compatibles no devuelven los grants de AllUsers de forma fiable.
   *
   * La heurística es segura: si `storedPath` es una URL pública
   * (`http://` / `https://`) el archivo se subió con `public-read` (legacy).
   * Si es una Key directa (sin esquema) se subió como `private`.
   */
  isStoredPathPublic(storedPath: string): boolean {
    return storedPath.startsWith('http://') || storedPath.startsWith('https://')
  }

  /**
   * Aplica la ACL indicada a un objeto existente en S3 sin re-subirlo.
   * Lanza error si el objeto no existe o si las credenciales no tienen
   * permiso para cambiar el ACL.
   *
   * @param bucket - Nombre del bucket.
   * @param key    - Key del objeto dentro del bucket.
   * @param acl    - Valor de ACL, p.ej. 'private' o 'public-read'.
   */
  async setObjectAcl(bucket: string, key: string, acl: string): Promise<void> {
    await s3Client.send(
      new PutObjectAclCommand({ Bucket: bucket, Key: key, ACL: acl as ObjectCannedACL })
    )
  }

  /**
   * URL pública de un objeto. El SDK v3 no devuelve `Location` en el resultado
   * de `Upload`, así que se compone desde el endpoint configurado usando
   * path-style, que es el esquema que habla tanto Spaces como el MinIO local.
   */
  private buildPublicUrl(key: string): string {
    const endpoint = Env.get('AWS_ENDPOINT').replace(/\/+$/, '')
    return `${endpoint}/${this.BUCKET_NAME}/${key.split('/').map(encodeURIComponent).join('/')}`
  }
}
