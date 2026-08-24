import AWS, { S3 } from 'aws-sdk'
import Env from '#start/env'
import fs from 'node:fs'
import https from 'node:https'
import http from 'node:http'
import { Readable } from 'node:stream'
import logger from '@adonisjs/core/services/logger'

/**
 * Resultado de obtener un objeto de S3 como stream junto con metadata útil
 * para servirlo en una respuesta HTTP.
 */
export interface S3ObjectStream {
  stream: Readable
  contentType: string
  contentLength?: number
  etag?: string
  lastModified?: Date
}

export default class UploadService {
  private s3Config: AWS.S3.ClientConfiguration = {
    accessKeyId: Env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: Env.get('AWS_SECRET_ACCESS_KEY'),
    endpoint: Env.get('AWS_ENDPOINT'),
    s3ForcePathStyle: true, // Necesario para espacios de DigitalOcean
    // Sin estos límites el SDK v2 reintenta 3 veces esperando el timeout TCP
    // del SO (~75 s por intento), resultando en cuelgues de 4-5 minutos cuando
    // el endpoint no está accesible desde la red actual.
    maxRetries: 0,
    httpOptions: {
      connectTimeout: 10_000, // 10 s para establecer conexión TCP
      timeout: 120_000,       // 2 min máximo de transferencia (comprobante ≤ 10 MB)
    },
  }

  // private bucketConfig: any = {
  //   Bucket: Env.get('AWS_BUCKET'),
  //   CreateBucketConfiguration: {
  //     LocationConstraint: Env.get('AWS_DEFAULT_REGION'),
  //   },
  // }

  private BUCKET_NAME = Env.get('AWS_BUCKET')
  // private LOCATION = Env.get('AWS_DEFAULT_REGION')
  private APP_NAME = `${Env.get('AWS_ROOT_PATH')}/`

  constructor() {
    AWS.config.update(this.s3Config)
  }

  async fileUpload(
    file: any,
    folderName = '',
    fileName = '',
    permission = 'public-read'
  ): Promise<string> {
    try {
      if (!file) {
        return 'file_not_found'
      }

      const s3 = new AWS.S3()
      const fileContent = fs.createReadStream(file.tmpPath)

      const timestamp = new Date().getTime()
      const randomValue = Math.random().toFixed(10).toString().replace('.', '')
      const fileNameGenerated = fileName || `T${timestamp}R${randomValue}.${file.extname}`
      if (file.subtype === 'svg') {
        file.subtype = 'svg+xml'
      }
      const uploadParams = {
        Bucket: this.BUCKET_NAME,
        Key: `${this.APP_NAME}${folderName || 'files'}/${fileNameGenerated}`,
        Body: fileContent,
        ACL: permission,
        ContentType: `${file.type}/${file.subtype}`,
      } as S3.Types.PutObjectRequest
      const response = await s3.upload(uploadParams).promise()

      // Si el archivo es privado, retornar la Key (ruta del archivo) para guardar en BD
      // La URL temporal se generará bajo demanda con getDownloadLink()
      if (permission === 'private') {
        return response.Key
      }

      // Si es público, retornar la URL pública
      return response.Location
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
      const s3 = new AWS.S3()
      const key = relativeKey.startsWith(this.APP_NAME)
        ? relativeKey
        : `${this.APP_NAME}files/${relativeKey}`

      const response = await s3
        .upload({
          Bucket: this.BUCKET_NAME as string,
          Key: key,
          Body: body,
          ACL: 'private',
          ContentType: contentType,
        })
        .promise()

      return response.Key
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

    const s3 = new AWS.S3(this.s3Config)

    try {
      // Generar URL temporal firmada para archivos privados
      const temporalURL = await s3.getSignedUrl('getObject', {
        Bucket: this.BUCKET_NAME,
        Key: filePath,
        Expires: expireSeconds, // Por defecto 24 horas
      })

      return temporalURL
    } catch (error: any) {
      return { status: 500, data: null, message: `get_url_failed: ${error.message}` }
    }
  }

  /**
   * Descarga un archivo directamente desde S3 como Buffer
   * Más confiable que usar URLs firmadas cuando hay problemas de red
   */
  async downloadFileBuffer(filePath: string): Promise<Buffer | null> {
    if (!filePath || !this.BUCKET_NAME) return null

    const s3 = new AWS.S3(this.s3Config)

    try {
      const result = await s3
        .getObject({
          Bucket: this.BUCKET_NAME as string,
          Key: filePath,
        })
        .promise()

      if (result.Body) {
        return result.Body as Buffer
      }
      return null
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
      logger.warn({ key }, 'getObjectStream: bucket no resuelto (AWS_BUCKET no configurado y sin bucket explícito)')
      return null
    }

    const s3 = new AWS.S3(this.s3Config)
    const params = {
      Bucket: targetBucket,
      Key: key,
    } as S3.Types.GetObjectRequest

    try {
      // Verificar existencia y obtener metadata sin descargar el cuerpo.
      const head = await s3.headObject(params).promise()
      const stream = s3.getObject(params).createReadStream()

      return {
        stream,
        contentType: head.ContentType || 'application/octet-stream',
        contentLength: head.ContentLength,
        etag: head.ETag,
        lastModified: head.LastModified,
      }
    } catch (error: any) {
      if (
        error?.code === 'NotFound' ||
        error?.code === 'NoSuchKey' ||
        error?.statusCode === 404 ||
        error?.statusCode === 403
      ) {
        logger.warn(
          { bucket: targetBucket, key, code: error?.code, statusCode: error?.statusCode },
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
  async getDownloadLinks(filePaths: string[], expireSeconds = 60 * 60 * 24): Promise<{ [key: string]: string }> {
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

    const s3 = new AWS.S3(this.s3Config)
    const params = {
      Bucket: ref.bucket,
      Key: ref.key,
    } as S3.Types.DeleteObjectRequest

    try {
      await s3.headObject(params).promise()
      const delResponse = await s3.deleteObject(params).promise()
      return { status: 200, data: delResponse, message: 'file_deleted_successfully' }
    } catch (error: any) {
      if (error.code === 'NotFound') {
        return { status: 404, data: null, message: 'file_not_found' }
      }
      return { status: 500, data: null, message: `delete_failed: ${error.message}` }
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
    const s3 = new AWS.S3(this.s3Config)
    await s3.putObjectAcl({ Bucket: bucket, Key: key, ACL: acl }).promise()
  }
}
