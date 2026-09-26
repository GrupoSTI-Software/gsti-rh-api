/**
 * Schemas OpenAPI del módulo de documentos firmados de contratos REPSE.
 * Referenciados desde `documentos_contrato_especializado_controller` con `$ref`.
 */
export {}

/**
 * @swagger
 * components:
 *   schemas:
 *     DocumentoContratoEspecializadoResource:
 *       type: object
 *       properties:
 *         documentoId:
 *           type: integer
 *         contratoId:
 *           type: integer
 *         origen:
 *           type: string
 *           enum: [subido, firmado_canvas]
 *         vigente:
 *           type: boolean
 *         fechaInicioVigencia:
 *           type: string
 *           format: date
 *         fechaVencimiento:
 *           type: string
 *           format: date
 *         nombreArchivo:
 *           type: string
 *         mimeType:
 *           type: string
 *         tamanoBytes:
 *           type: integer
 *         subidoPor:
 *           type: integer
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         deletedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *
 *     DocumentoContratoEspecializadoSuccess:
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
 *             documentoContrato:
 *               $ref: '#/components/schemas/DocumentoContratoEspecializadoResource'
 *       example:
 *         type: success
 *         title: Documento del contrato
 *         message: Documento subido correctamente
 *         data:
 *           documentoContrato:
 *             documentoId: 1
 *             contratoId: 10
 *             origen: subido
 *             vigente: true
 *             fechaInicioVigencia: '2026-01-01'
 *             fechaVencimiento: '2026-12-31'
 *             nombreArchivo: contrato-firmado.pdf
 *             mimeType: application/pdf
 *             tamanoBytes: 245760
 *             subidoPor: 42
 *             createdAt: '2026-06-01T18:00:00.000Z'
 *             deletedAt: null
 *
 *     DocumentosContratoListSuccess:
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
 *             documentoContrato:
 *               type: object
 *               properties:
 *                 documentos:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DocumentoContratoEspecializadoResource'
 *       example:
 *         type: success
 *         title: Documento del contrato
 *         message: Documentos obtenidos correctamente
 *         data:
 *           documentoContrato:
 *             documentos:
 *               - documentoId: 1
 *                 contratoId: 10
 *                 origen: subido
 *                 vigente: true
 *                 fechaInicioVigencia: '2026-01-01'
 *                 fechaVencimiento: '2026-12-31'
 *                 nombreArchivo: contrato-firmado.pdf
 *                 mimeType: application/pdf
 *                 tamanoBytes: 245760
 *                 subidoPor: 42
 *                 createdAt: '2026-06-01T18:00:00.000Z'
 *                 deletedAt: null
 */
