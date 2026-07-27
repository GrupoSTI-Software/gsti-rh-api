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
 *     AddendumAnexo15DRequest:
 *       type: object
 *       description: Subconjunto addendable del anexo 15-D (sin folioRepse).
 *       properties:
 *         numeroTrabajadoresAprox:
 *           type: integer
 *           minimum: 1
 *         objetoDetallado:
 *           type: string
 *           minLength: 20
 *           maxLength: 3000
 *         fechaInicioServicio:
 *           type: string
 *           format: date
 *         fechaFinServicio:
 *           type: string
 *           format: date
 *           nullable: true
 *         compromisosDocumentales:
 *           type: array
 *           minItems: 1
 *           items:
 *             $ref: '#/components/schemas/CompromisoDocumentalResource'
 *         responsabilidadSolidariaAceptada:
 *           type: boolean
 *         textoResponsabilidadSolidaria:
 *           type: string
 *           minLength: 50
 *           maxLength: 3000
 *
 *     AddendumContratoRequest:
 *       type: object
 *       required: [motivo, anexo]
 *       properties:
 *         motivo:
 *           type: string
 *           minLength: 3
 *           maxLength: 500
 *         anexo:
 *           $ref: '#/components/schemas/AddendumAnexo15DRequest'
 *
 *     VersionDocumentoRespaldoResource:
 *       type: object
 *       description: Metadatos del PDF de respaldo del snapshot (sin storage key).
 *       properties:
 *         id:
 *           type: integer
 *         nombreArchivo:
 *           type: string
 *         mimeType:
 *           type: string
 *         fechaVencimiento:
 *           type: string
 *           format: date
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
 *           description: ID interno legacy; preferir documentoVigente.
 *         documentoVigente:
 *           allOf:
 *             - $ref: '#/components/schemas/VersionDocumentoRespaldoResource'
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
 *     AddendumContratoData:
 *       type: object
 *       properties:
 *         anexo15d:
 *           $ref: '#/components/schemas/Anexo15DResource'
 *         version:
 *           $ref: '#/components/schemas/VersionContratoEspecializadoResource'
 *
 *     AddendumContratoSuccess:
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
 *           $ref: '#/components/schemas/AddendumContratoData'
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
