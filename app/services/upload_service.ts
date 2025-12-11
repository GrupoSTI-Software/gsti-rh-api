import AWS, { S3 } from 'aws-sdk'
import Env from '#start/env'
import fs from 'node:fs'

export default class UploadService {
  private s3Config: AWS.S3.ClientConfiguration = {
    accessKeyId: Env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: Env.get('AWS_SECRET_ACCESS_KEY'),
    endpoint: Env.get('AWS_ENDPOINT'),
    s3ForcePathStyle: true, // Necesario para espacios de DigitalOcean
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
      return 'S3Producer.fileUpload'
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

  async deleteFile(fileUrlOrKey = '') {
    if (!fileUrlOrKey) {
      return { status: 404, data: null, message: 'file_path_not_found' }
    }
    let objectKey = fileUrlOrKey;

    // Si es una URL completa de DigitalOcean Spaces
    if (fileUrlOrKey.includes('digitaloceanspaces.com')) {
      try {
        const url = new URL(fileUrlOrKey);
        const fullPath = url.pathname;

        if (fullPath.startsWith(`/${this.BUCKET_NAME}/`)) {
          objectKey = fullPath.substring((this.BUCKET_NAME?.length || 0) + 2);
        } else {
          return { status: 400, data: null, message: 'invalid_url_format' }
        }
      } catch (error) {
        return { status: 400, data: null, message: 'invalid_url' }
      }
    }
    // Si incluye el bucket name pero no es URL completa
    else if (fileUrlOrKey.startsWith(this.BUCKET_NAME + '/')) {
      objectKey = fileUrlOrKey.substring((this.BUCKET_NAME?.length || 0) + 1);
    }
    // Si es una Key directa (ruta del archivo en S3), usarla directamente
    // Esto permite eliminar archivos usando la Key que se guarda en la BD
    else {
      objectKey = fileUrlOrKey;
    }

    objectKey = decodeURIComponent(objectKey);



    const s3 = new AWS.S3(this.s3Config)
    const params = {
      Bucket: this.BUCKET_NAME,
      Key: objectKey,
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
    } finally {
    }
  }
}
