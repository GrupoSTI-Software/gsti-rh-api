/**
 * Schemas OpenAPI del módulo Repse Registrations.
 * Referenciados desde el controlador con `$ref: '#/components/schemas/...'`.
 */
export {}

/**
 * @swagger
 * components:
 *   schemas:
 *     RepseRegistrationApiError:
 *       type: object
 *       required: [type, title, message, errorCode, data]
 *       properties:
 *         type:
 *           type: string
 *           enum: [error]
 *         title:
 *           type: string
 *         message:
 *           type: string
 *         detail:
 *           type: string
 *         key:
 *           type: string
 *         errorCode:
 *           type: string
 *         data:
 *           nullable: true
 *
 *     RepseRegistrationResource:
 *       type: object
 *       properties:
 *         repseRegistrationId:
 *           type: integer
 *         businessUnitId:
 *           type: integer
 *         folio:
 *           type: string
 *         registeredAt:
 *           type: string
 *           format: date
 *         expiresAt:
 *           type: string
 *           format: date
 *         status:
 *           type: string
 *           enum: [active]
 *         repseRegistrationCreatedAt:
 *           type: string
 *           format: date-time
 *         repseRegistrationUpdatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *
 *     RepseRegistrationCreate:
 *       type: object
 *       required: [businessUnitId, folio, registeredAt, expiresAt]
 *       properties:
 *         businessUnitId:
 *           type: integer
 *           minimum: 1
 *           description: Empresa prestadora del tenant
 *         folio:
 *           type: string
 *           minLength: 1
 *           maxLength: 50
 *           pattern: '^[A-Za-z0-9-]+$'
 *         registeredAt:
 *           type: string
 *           format: date
 *         expiresAt:
 *           type: string
 *           format: date
 *           description: Debe ser posterior a registeredAt
 *         status:
 *           type: string
 *           enum: [active]
 *           default: active
 *       example:
 *         businessUnitId: 1
 *         folio: REPSE-2026-001
 *         registeredAt: '2026-01-01'
 *         expiresAt: '2026-12-31'
 *         status: active
 *
 *     RepseRegistrationUpdate:
 *       type: object
 *       properties:
 *         businessUnitId:
 *           type: integer
 *           minimum: 1
 *         folio:
 *           type: string
 *           minLength: 1
 *           maxLength: 50
 *           pattern: '^[A-Za-z0-9-]+$'
 *         registeredAt:
 *           type: string
 *           format: date
 *         expiresAt:
 *           type: string
 *           format: date
 *         status:
 *           type: string
 *           enum: [active]
 *       example:
 *         folio: REPSE-2026-001-REV
 *         expiresAt: '2027-06-30'
 *
 *     RepseRegistrationsListSuccess:
 *       type: object
 *       required: [type, title, message, data]
 *       properties:
 *         type:
 *           type: string
 *           enum: [success]
 *         title:
 *           type: string
 *         message:
 *           type: string
 *         data:
 *           type: object
 *           properties:
 *             repseRegistrations:
 *               type: object
 *               properties:
 *                 meta:
 *                   $ref: '#/components/schemas/ComplianceRepsePaginationMeta'
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/RepseRegistrationResource'
 *       example:
 *         type: success
 *         title: Repse
 *         message: Repse obtenidos correctamente
 *         data:
 *           repseRegistrations:
 *             meta:
 *               total: 1
 *               perPage: 20
 *               currentPage: 1
 *               lastPage: 1
 *               firstPage: 1
 *             data:
 *               - repseRegistrationId: 1
 *                 businessUnitId: 1
 *                 folio: REPSE-2026-001
 *                 registeredAt: '2026-01-01'
 *                 expiresAt: '2026-12-31'
 *                 status: active
 *                 repseRegistrationCreatedAt: '2026-06-01T15:00:00.000Z'
 *                 repseRegistrationUpdatedAt: '2026-06-01T15:00:00.000Z'
 *
 *     RepseRegistrationSuccess:
 *       type: object
 *       required: [type, title, message, data]
 *       properties:
 *         type:
 *           type: string
 *           enum: [success]
 *         title:
 *           type: string
 *         message:
 *           type: string
 *         data:
 *           type: object
 *           properties:
 *             repseRegistration:
 *               $ref: '#/components/schemas/RepseRegistrationResource'
 *       example:
 *         type: success
 *         title: Repse Registration
 *         message: Registro REPSE encontrado correctamente
 *         data:
 *           repseRegistration:
 *             repseRegistrationId: 1
 *             businessUnitId: 1
 *             folio: REPSE-2026-001
 *             registeredAt: '2026-01-01'
 *             expiresAt: '2026-12-31'
 *             status: active
 *             repseRegistrationCreatedAt: '2026-06-01T15:00:00.000Z'
 *             repseRegistrationUpdatedAt: '2026-06-01T15:00:00.000Z'
 *
 *     RepseFolioExpirationRow:
 *       type: object
 *       required:
 *         - repseRegistrationId
 *         - businessUnitId
 *         - folio
 *         - expiresAt
 *         - status
 *         - daysToExpire
 *       properties:
 *         repseRegistrationId:
 *           type: integer
 *         businessUnitId:
 *           type: integer
 *         businessUnitName:
 *           type: string
 *           nullable: true
 *         folio:
 *           type: string
 *         expiresAt:
 *           type: string
 *           format: date
 *         status:
 *           type: string
 *           enum: [active]
 *         daysToExpire:
 *           type: integer
 *           description: Días hasta el vencimiento; negativo si ya venció
 *
 *     RepseFolioExpirationsSuccess:
 *       type: object
 *       required: [type, title, message, data]
 *       properties:
 *         type:
 *           type: string
 *           enum: [success]
 *         title:
 *           type: string
 *         message:
 *           type: string
 *         data:
 *           type: object
 *           properties:
 *             repseFolioExpirations:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RepseFolioExpirationRow'
 *       example:
 *         type: success
 *         title: Vencimientos del folio REPSE
 *         message: Vencimientos del folio REPSE obtenidos correctamente
 *         data:
 *           repseFolioExpirations:
 *             - repseRegistrationId: 1
 *               businessUnitId: 1
 *               businessUnitName: SAE
 *               folio: REPSE-2026-001
 *               expiresAt: '2026-04-15'
 *               status: active
 *               daysToExpire: 45
 */
