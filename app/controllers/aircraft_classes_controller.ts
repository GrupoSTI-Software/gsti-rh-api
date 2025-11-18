import { HttpContext } from '@adonisjs/core/http'
import AircraftClass from '../models/aircraft_class.js'
import {
  createAircraftClassValidator,
  updateAircraftClassValidator,
} from '../validators/aircraft_class.js'
import { formatResponse } from '../helpers/responseFormatter.js'
import { DateTime } from 'luxon'
import AWS, { S3 } from 'aws-sdk'
import fs from 'node:fs'
import Env from '#start/env'

function generateSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default class AircraftClassController {
  /**
   * @swagger
   * /api/aircraft-classes:
   *   get:
   *     tags:
   *       - Aircraft Classes
   *     summary: Get all aircraft classes
   *     security:
   *      - bearerAuth: []
   *     responses:
   *       '200':
   *         description: Aircraft classes fetched successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     meta:
   *                       type: object
   *                       properties:
   *                         total:
   *                           type: number
   *                         per_page:
   *                           type: number
   *                         current_page:
   *                           type: number
   *                         last_page:
   *                           type: number
   *                         first_page:
   *                           type: number
   *                     data:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: number
   *                           aircraftClassName:
   *                             type: string
   *                           aircraftClassShortDescription:
   *                             type: string
   *                           aircraftClassLongDescription:
   *                             type: string
   *                           aircraftClassBanner:
   *                             type: string
   *                           aircraftClassSlug:
   *                             type: string
   *                           aircraftClassStatus:
   *                             type: boolean
   */
  async index({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    const page = request.input('page', 1)
    const limit = request.input('limit', 10)
    const searchText = request.input('searchText', '')

    const query = AircraftClass.query().whereNull('aircraftClassDeletedAt')

    if (searchText) {
      query.where((builder) => {
        builder.where('aircraftClassName', 'like', `%${searchText}%`)
      })
    }
    const classes = await query.paginate(page, limit)

    const formattedResponse = formatResponse(
      'success',
      t('successfully_fetched'),
      t('resources_fetched'),
      classes.all(),
      {
        total: classes.total,
        per_page: classes.perPage,
        current_page: classes.currentPage,
        last_page: classes.lastPage,
        first_page: 1,
      }
    )

    return response.status(200).json(formattedResponse)
  }
  private s3Config: AWS.S3.ClientConfiguration = {
    accessKeyId: Env.get('AWS_ACCESS_KEY_ID'),
    secretAccessKey: Env.get('AWS_SECRET_ACCESS_KEY'),
    endpoint: Env.get('AWS_ENDPOINT'),
    s3ForcePathStyle: true, // Necesario para espacios de DigitalOcean
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
   * /api/aircraft-classes:
   *   post:
   *     tags:
   *       - Aircraft Classes
   *     summary: Create a new aircraft class
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               aircraftClassName:
   *                 type: string
   *               aircraftClassShortDescription:
   *                 type: string
   *               aircraftClassLongDescription:
   *                 type: string
   *               aircraftClassBanner:
   *                 type: string
   *               aircraftClassSlug:
   *                 type: string
   *               aircraftClassStatus:
   *                 type: boolean
   *     responses:
   *       '201':
   *         description: Aircraft class created successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: number
   *                     aircraftClassName:
   *                       type: string
   *                     aircraftClassShortDescription:
   *                       type: string
   *                     aircraftClassLongDescription:
   *                       type: string
   *                     aircraftClassBanner:
   *                       type: string
   *                     aircraftClassSlug:
   *                       type: string
   *                     aircraftClassStatus:
   *                       type: boolean
   *       '400':
   *         description: Invalid input, validation error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     message:
   *                       type: string
   */
  async store({ request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const data = await request.validateUsing(createAircraftClassValidator)

      const bannerFile = request.file('aircraftClassBanner')
      if (bannerFile) {
        const bannerUrl = await this.fileUpload(bannerFile)
        if (bannerUrl !== 'file_not_found' && bannerUrl !== 'S3Producer.fileUpload') {
          data.aircraftClassBanner = bannerUrl
        } else {
          return response
            .status(500)
            .json(formatResponse('error', t('upload_error'), t('failed_to_upload_file_to_s3'), bannerUrl))
        }
      }

      data.aircraftClassSlug = generateSlug(data.aircraftClassName)

      const aircraftClass = await AircraftClass.create(data)
      return response
        .status(201)
        .json(
          formatResponse(
            'success',
            t('successfully_action'),
            t('resource_created'),
            aircraftClass.toJSON()
          )
        )
    } catch (error) {
      return response
        .status(400)
        .json(
          formatResponse('error', t('validation_error'), t('invalid_input_validation_error_400'), error)
        )
    }
  }

  /**
   * @swagger
   * /api/aircraft-classes/{id}:
   *   get:
   *     tags:
   *       - Aircraft Classes
   *     summary: Get a specific aircraft class
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: number
   *     responses:
   *       '200':
   *         description: Aircraft class fetched successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: number
   *                     aircraftClassName:
   *                       type: string
   *                     aircraftClassShortDescription:
   *                       type: string
   *                     aircraftClassLongDescription:
   *                       type: string
   *                     aircraftClassBanner:
   *                       type: string
   *                     aircraftClassSlug:
   *                       type: string
   *                     aircraftClassStatus:
   *                       type: boolean
   *       '404':
   *         description: Aircraft class not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     message:
   *                       type: string
   */
  async show({ params, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const aircraftClass = await AircraftClass.query()
        .where('aircraftClassId', params.id)
        .whereNull('aircraftClassDeletedAt')
        .firstOrFail()
      return response
        .status(200)
        .json(
          formatResponse(
            'success',
            t('successfully_fetched'),
            t('resource_fetched'),
            aircraftClass.toJSON()
          )
        )
    } catch (error) {
      return response
        .status(404)
        .json(formatResponse('error', t('not_found'), t('resource_not_found'), error))
    }
  }

  /**
   * @swagger
   * /api/aircraft-classes/{id}:
   *   put:
   *     tags:
   *       - Aircraft Classes
   *     summary: Update a specific aircraft class
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: number
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               aircraftClassName:
   *                 type: string
   *               aircraftClassShortDescription:
   *                 type: string
   *               aircraftClassLongDescription:
   *                 type: string
   *               aircraftClassBanner:
   *                 type: string
   *               aircraftClassSlug:
   *                 type: string
   *               aircraftClassStatus:
   *                 type: boolean
   *     responses:
   *       '200':
   *         description: Aircraft class updated successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     id:
   *                       type: number
   *                     aircraftClassName:
   *                       type: string
   *                     aircraftClassShortDescription:
   *                       type: string
   *                     aircraftClassLongDescription:
   *                       type: string
   *                     aircraftClassBanner:
   *                       type: string
   *                     aircraftClassSlug:
   *                       type: string
   *                     aircraftClassStatus:
   *                       type: boolean
   *       '404':
   *         description: Aircraft class not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     message:
   *                       type: string
   *       '400':
   *         description: Invalid input, validation error
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     message:
   *                       type: string
   */
  async update({ params, request, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const data = await request.validateUsing(updateAircraftClassValidator)

      const aircraftClass = await AircraftClass.findOrFail(params.id)
      const bannerFile = request.file('aircraftClassBanner')
      if (bannerFile) {
        const bannerUrl = await this.fileUpload(bannerFile)
        if (bannerUrl !== 'file_not_found' && bannerUrl !== 'S3Producer.fileUpload') {
          data.aircraftClassBanner = bannerUrl
        } else {
          return response
            .status(500)
            .json(formatResponse('error', t('upload_error'), t('failed_to_upload_file_to_s3'), bannerUrl))
        }
      }
      if (data.aircraftClassName) {
        data.aircraftClassSlug = generateSlug(data.aircraftClassName)
      }
      aircraftClass.merge(data)
      await aircraftClass.save()
      return response
        .status(200)
        .json(
          formatResponse(
            'success',
            t('successfully_action'),
            t('resource_updated'),
            aircraftClass.toJSON()
          )
        )
    } catch (error) {
      return response
        .status(400)
        .json(
          formatResponse('error', t('validation_error'), t('invalid_input_validation_error_400'), error)
        )
    }
  }

  /**
   * @swagger
   * /api/aircraft-classes/{id}:
   *   delete:
   *     tags:
   *       - Aircraft Classes
   *     summary: Delete a specific aircraft class
   *     parameters:
   *       - name: id
   *         in: path
   *         required: true
   *         schema:
   *           type: number
   *     responses:
   *       '200':
   *         description: Aircraft class deleted successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     message:
   *                       type: string
   *       '404':
   *         description: Aircraft class not found
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 type:
   *                   type: string
   *                 title:
   *                   type: string
   *                 message:
   *                   type: string
   *                 data:
   *                   type: object
   *                   properties:
   *                     message:
   *                       type: string
   */
  async destroy({ params, response, i18n }: HttpContext) {
    const t = i18n.formatMessage.bind(i18n)
    try {
      const aircraftClass = await AircraftClass.findOrFail(params.id)
      aircraftClass.aircraftClassDeletedAt = DateTime.now()
      await aircraftClass.save()
      return response
        .status(200)
        .json(formatResponse('success', t('successfully_action'), t('resource_deleted'), {}))
    } catch (error) {
      return response
        .status(404)
        .json(formatResponse('error', t('not_found'), t('resource_not_found'), error))
    }
  }
}
