/**
 * Schemas OpenAPI del módulo de versiones históricas de contratos REPSE.
 */
export {}

/**
 * @swagger
 * components:
 *   schemas:
 *     RenovarContratoRequest:
 *       type: object
 *       required: [fechaInicio, fechaFin, motivo]
 *       properties:
 *         fechaInicio:
 *           type: string
 *           format: date
 *         fechaFin:
 *           type: string
 *           format: date
 *         motivo:
 *           type: string
 *           minLength: 3
 *           maxLength: 500
 *
 *     VersionContratoSnapshotResource:
 *       type: object
 *       properties:
 *         fechaInicio:
 *           type: string
 *           format: date
 *           nullable: true
 *         fechaFin:
 *           type: string
 *           format: date
 *           nullable: true
 *         anexo15d:
 *           $ref: '#/components/schemas/Anexo15DResource'
 *         documentoVigenteId:
 *           type: integer
 *           nullable: true
 *
 *     VersionContratoEspecializadoResource:
 *       type: object
 *       properties:
 *         numeroVersion:
 *           type: integer
 *         tipoCambio:
 *           type: string
 *           enum: [renovacion, addendum]
 *         motivo:
 *           type: string
 *         fechaCambio:
 *           type: string
 *           format: date-time
 *         snapshot:
 *           $ref: '#/components/schemas/VersionContratoSnapshotResource'
 *         creadoPor:
 *           type: integer
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *
 *     RenovacionContratoData:
 *       type: object
 *       properties:
 *         contrato:
 *           $ref: '#/components/schemas/ContratoServicioEspecializado'
 *         version:
 *           $ref: '#/components/schemas/VersionContratoEspecializadoResource'
 *
 *     RenovacionContratoSuccess:
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
 *           $ref: '#/components/schemas/RenovacionContratoData'
 *
 *     VersionesContratoListSuccess:
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
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/VersionContratoEspecializadoResource'
 *
 *     VersionContratoEspecializadoSuccess:
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
 *           $ref: '#/components/schemas/VersionContratoEspecializadoResource'
 */
