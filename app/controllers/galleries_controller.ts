import { HttpContext } from '@adonisjs/core/http'
import { isFileIntakeError } from '#helpers/file_intake_api_error'
import Gallery from '../models/gallery.js'
import { createGalleryValidator, updateGalleryValidator } from '../validators/gallery.js'
import { formatResponse } from '../helpers/responseFormatter.js'
import AWS, { S3 } from 'aws-sdk'
import fs from 'node:fs'
import Env from '#start/env'

export default class GalleriesController {
  private s3Config: AWS.S3.ClientConfiguration = {
    accessKeyId: Env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: Env.get('AWS_SECRET_ACCESS_KEY'),
    endpoint: Env.get('AWS_ENDPOINT'),
    s3ForcePathStyle: true,
  }
  private BUCKET_NAME = Env.get('AWS_BUCKET')
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

      const uploadParams = {
        Bucket: this.BUCKET_NAME,
        Key: `${this.APP_NAME}${folderName || 'files'}/${fileNameGenerated}`,
        Body: fileContent,
        ACL: permission,
        ContentType: `${file.type}/${file.subtype}`,
      } as S3.Types.PutObjectRequest

      const response = await s3.upload(uploadParams).promise()
      return response.Location
    } catch (err) {
      return 'S3Producer.fileUpload'
    }
  }
  /**
   * @swagger
   * /galleries:
   *   get:
   *     summary: Get all galleries
   *     tags:
   *       - Galleries
   *     parameters:
   *       - in: query
   *         name: page
   *         required: false
   *         schema:
   *           type: integer
   *           default: 1
   *         description: Page number
   *       - in: query
   *         name: limit
   *         required: false
   *         schema:
   *           type: integer
   *           default: 10
   *         description: Number of items per page
   *       - in: query
   *         name: galeryIdTable
   *         required: false
   *         schema:
   *           type: integer
   *         description: Filter galleries by galeryIdTable
   *       - in: query
   *         name: galeryNameTable
   *         required: false
   *         schema:
   *           type: string
   *         description: Filter galleries by galeryNameTable
   *     responses:
   *       200:
   *         description: Successfully fetched resources
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                   example: success
   *                 title:
   *                   type: string
   *                   example: Successfully fetched
   *                 message:
   *                   type: string
   *                   example: Resources fetched
   *                 data:
   *                   type: object
   *                   properties:
   *                     meta:
   *                       type: object
   *                       properties:
   *                         total:
   *                           type: integer
   *                           example: 100
   *                         per_page:
   *                           type: integer
   *                           example: 10
   *                         current_page:
   *                           type: integer
   *                           example: 1
   *                         last_page:
   *                           type: integer
   *                           example: 10
   *                         first_page:
   *                           type: integer
   *                           example: 1
   *                     data:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: integer
   *                           galeryPath:
   *                             type: string
   *                           galeryCategory:
   *                             type: string
   *                             nullable: true
   *                           galeryIdTable:
   *                             type: integer
   *                           galeryNameTable:
   *                             type: string
   *                             nullable: true
   *                           createdAt:
   *                             type: string
   *                             format: date-time
   *                           updatedAt:
   *                             type: string
   *                             format: date-time
   *                           deletedAt:
   *                             type: string
   *                             format: date-time
   */

  async index({ request, response }: HttpContext) {
    const page = request.input('page', 1)
    const limit = request.input('limit', 10)

    const galeryIdTable = request.input('galeryIdTable')
    const galeryNameTable = request.input('galeryNameTable')
    const query = Gallery.query()

    if (galeryIdTable) {
      query.where('galeryIdTable', galeryIdTable)
    }
    if (galeryNameTable) {
      query.where('galeryNameTable', galeryNameTable)
    }

    const galleries = await query.paginate(page, limit)
    const formattedResponse = formatResponse(
      'success',
      'Successfully fetched',
      'Resources fetched',
      galleries.all(),
      {
        total: galleries.total,
        per_page: galleries.perPage,
        current_page: galleries.currentPage,
        last_page: galleries.lastPage,
        first_page: 1,
      }
    )
    return response.status(200).json(formattedResponse)
  }
  /**
   * @swagger
   * /galleries:
   *   post:
   *     summary: Crear galería
   *     tags:
   *       - Galleries
   *     description: Crea una nueva galería.
   *     consumes:
   *       - multipart/form-data
   *     parameters:
   *       - name: galeryPath
   *         in: formData
   *         type: string
   *         description: URL de la imagen de la galería.
   *         required: true
   *       - name: galeryCategory
   *         in: formData
   *         type: string
   *         description: Categoría de la galería.
   *         required: true
   *       - name: galeryIdTable
   *         in: formData
   *         type: integer
   *         required: true
   *         description: ID relacionado con la galería.
   *       - name: galeryNameTable
   *         in: formData
   *         type: string
   *         description: Nombre relacionado con la galería.
   *         required: true
   *       - name: galleryImage
   *         in: formData
   *         type: file
   *         description: Imagen de la galería.
   *         required: true
   *     responses:
   *       201:
   *         description: Galería creada exitosamente.
   *       400:
   *         description: Error de validación.
   */
  async store({ request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(createGalleryValidator)

      const imageFile = request.file('galleryImage')
      if (imageFile) {
        const imageUrl = await this.fileUpload(imageFile)
        if (imageUrl !== 'file_not_found' && imageUrl !== 'S3Producer.fileUpload') {
          data.galeryPath = imageUrl
          console.error(imageUrl)
        } else {
          return response
            .status(500)
            .json(formatResponse('error', 'Upload error', 'Failed to upload file to S3', imageUrl))
        }
      }

      const gallery = await Gallery.create(data)
      return response
        .status(201)
        .json(
          formatResponse('success', 'Successfully created', 'Resource created', gallery.toJSON())
        )
    } catch (error) {
      // Un rechazo de la entrada de archivos es 422 con triplete, no un fallo del
      // servidor: se relanza para que lo formatee el handler global.
      if (isFileIntakeError(error)) throw error

      return response
        .status(400)
        .json(formatResponse('error', 'Validation error', 'Invalid input, validation error', error))
    }
  }
  /**
   * @swagger
   * /galleries/{id}:
   *   get:
   *     summary: Obtener galería
   *     tags:
   *       - Galleries
   *     description: Obtiene la información de una galería específica.
   *     parameters:
   *       - name: id
   *         in: path
   *         type: integer
   *         required: true
   *         description: ID de la galería.
   *     responses:
   *       200:
   *         description: Galería obtenida exitosamente.
   *       404:
   *         description: Galería no encontrada.
   */
  async show({ params, response }: HttpContext) {
    try {
      const gallery = await Gallery.findOrFail(params.id)
      return response
        .status(200)
        .json(
          formatResponse('success', 'Successfully fetched', 'Resource fetched', gallery.toJSON())
        )
    } catch (error) {
      return response
        .status(404)
        .json(formatResponse('error', 'Not Found', 'Resource not found', 'NO DATA'))
    }
  }
  /**
   * @swagger
   * /galleries/{id}:
   *   put:
   *     summary: Actualizar galería
   *     tags:
   *       - Galleries
   *     description: Actualiza los datos de una galería existente.
   *     consumes:
   *       - multipart/form-data
   *     parameters:
   *       - name: id
   *         in: path
   *         type: integer
   *         required: true
   *         description: ID de la galería.
   *       - name: galeryPath
   *         in: formData
   *         type: string
   *         description: URL de la imagen de la galería.
   *       - name: galeryCategory
   *         in: formData
   *         type: string
   *         description: Categoría de la galería.
   *       - name: galeryIdTable
   *         in: formData
   *         type: integer
   *         description: ID relacionado con la galería.
   *       - name: galeryNameTable
   *         in: formData
   *         type: string
   *         description: Nombre relacionado con la galería.
   *       - name: galleryImage
   *         in: formData
   *         type: file
   *         description: Imagen de la galería.
   *     responses:
   *       200:
   *         description: Galería actualizada exitosamente.
   *       400:
   *         description: Error de validación.
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const data = await request.validateUsing(updateGalleryValidator)
      const gallery = await Gallery.findOrFail(params.id)

      const imageFile = request.file('galleryImage')
      if (imageFile) {
        const imageUrl = await this.fileUpload(imageFile, 'galleries')
        if (imageUrl !== 'file_not_found' && imageUrl !== 'S3Producer.fileUpload') {
          data.galeryPath = imageUrl
        } else {
          return response
            .status(500)
            .json(formatResponse('error', 'Upload error', 'Failed to upload file to S3', imageUrl))
        }
      }

      gallery.merge(data)
      await gallery.save()

      return response
        .status(200)
        .json(
          formatResponse('success', 'Successfully updated', 'Resource updated', gallery.toJSON())
        )
    } catch (error) {
      // Un rechazo de la entrada de archivos es 422 con triplete, no un fallo del
      // servidor: se relanza para que lo formatee el handler global.
      if (isFileIntakeError(error)) throw error

      return response
        .status(400)
        .json(formatResponse('error', 'Validation error', 'Invalid input, validation error', error))
    }
  }
  /**
   * @swagger
   * /galleries/{id}:
   *   delete:
   *     summary: Eliminar galería
   *     tags:
   *       - Galleries
   *     description: Elimina una galería existente.
   *     parameters:
   *       - name: id
   *         in: path
   *         type: integer
   *         required: true
   *         description: ID de la galería.
   *     responses:
   *       200:
   *         description: Galería eliminada exitosamente.
   *       404:
   *         description: Galería no encontrada.
   */
  async destroy({ params, response }: HttpContext) {
    try {
      const gallery = await Gallery.findOrFail(params.id)
      await gallery.delete()

      return response
        .status(200)
        .json(
          formatResponse('success', 'Successfully deleted', 'Resource deleted', gallery.toJSON())
        )
    } catch (error) {
      return response
        .status(404)
        .json(formatResponse('error', 'Not Found', 'Resource not found', 'NO DATA'))
    }
  }
}
