/**
 * Schemas OpenAPI compartidos del módulo Compliance REPSE (empresas contratantes y contratos 15-D).
 * Referenciados desde los controladores con `$ref: '#/components/schemas/...'`.
 */
export {}

/**
 * @swagger
 * components:
 *   schemas:
 *     ComplianceRepseApiError:
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
 *     ComplianceRepsePaginationMeta:
 *       type: object
 *       properties:
 *         total:
 *           type: integer
 *         perPage:
 *           type: integer
 *         currentPage:
 *           type: integer
 *         lastPage:
 *           type: integer
 *         firstPage:
 *           type: integer
 *         firstPageUrl:
 *           type: string
 *         lastPageUrl:
 *           type: string
 *         nextPageUrl:
 *           type: string
 *           nullable: true
 *         previousPageUrl:
 *           type: string
 *           nullable: true
 *
 *     EmpresaContratanteResource:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         razonSocial:
 *           type: string
 *         rfc:
 *           type: string
 *         domicilioFiscal:
 *           type: string
 *         representanteLegal:
 *           type: string
 *           nullable: true
 *         correo:
 *           type: string
 *           nullable: true
 *         telefono:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *
 *     EmpresaContratanteBasicaResource:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         razonSocial:
 *           type: string
 *         rfc:
 *           type: string
 *
 *     Anexo15DResource:
 *       type: object
 *       properties:
 *         folioRepse:
 *           type: string
 *           description: Autocompletado server-side desde el registro REPSE del tenant.
 *         objetoDetallado:
 *           type: string
 *         numeroTrabajadoresAprox:
 *           type: integer
 *         fechaInicioServicio:
 *           type: string
 *           format: date
 *         fechaFinServicio:
 *           type: string
 *           format: date
 *           nullable: true
 *         compromisosDocumentales:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CompromisoDocumental'
 *         responsabilidadSolidariaAceptada:
 *           type: boolean
 *         textoResponsabilidadSolidaria:
 *           type: string
 *
 *     CompromisoDocumental:
 *       type: object
 *       required: [tipo, descripcion, periodicidad]
 *       properties:
 *         tipo:
 *           type: string
 *           enum: [cfdi_nomina, comprobante_imss, comprobante_infonavit, otro]
 *         descripcion:
 *           type: string
 *         periodicidad:
 *           type: string
 *           enum: [mensual, bimestral, cuatrimestral, anual, por_evento]
 *
 *     Anexo15DCreate:
 *       type: object
 *       required:
 *         - objetoDetallado
 *         - numeroTrabajadoresAprox
 *         - fechaInicioServicio
 *         - compromisosDocumentales
 *         - textoResponsabilidadSolidaria
 *       properties:
 *         objetoDetallado:
 *           type: string
 *           minLength: 20
 *           maxLength: 3000
 *         numeroTrabajadoresAprox:
 *           type: integer
 *           minimum: 1
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
 *             $ref: '#/components/schemas/CompromisoDocumental'
 *         responsabilidadSolidariaAceptada:
 *           type: boolean
 *           default: true
 *         textoResponsabilidadSolidaria:
 *           type: string
 *           minLength: 50
 *           maxLength: 3000
 *
 *     ContratoServicioEspecializadoCreate:
 *       type: object
 *       required:
 *         - empresaContratanteId
 *         - numeroContrato
 *         - fechaInicio
 *         - objetoServicio
 *         - anexo15d
 *       properties:
 *         empresaContratanteId:
 *           type: integer
 *           description: ID de empresa contratante existente en el tenant
 *         numeroContrato:
 *           type: string
 *           minLength: 1
 *           maxLength: 50
 *         fechaInicio:
 *           type: string
 *           format: date
 *         fechaFin:
 *           type: string
 *           format: date
 *           nullable: true
 *         objetoServicio:
 *           type: string
 *           minLength: 10
 *           maxLength: 2000
 *         montoTotal:
 *           type: number
 *           minimum: 0
 *           nullable: true
 *         moneda:
 *           type: string
 *           minLength: 3
 *           maxLength: 3
 *           default: MXN
 *         estatus:
 *           type: string
 *           enum: [borrador, vigente, vencido, cancelado]
 *           default: borrador
 *         anexo15d:
 *           $ref: '#/components/schemas/Anexo15DCreate'
 *       example:
 *         empresaContratanteId: 1
 *         numeroContrato: CSE-2026-001
 *         fechaInicio: '2026-01-15'
 *         fechaFin: '2026-12-31'
 *         objetoServicio: Prestación de servicios especializados de limpieza industrial en planta y áreas administrativas.
 *         montoTotal: 450000
 *         moneda: MXN
 *         estatus: borrador
 *         anexo15d:
 *           objetoDetallado: Limpieza profunda de áreas productivas, sanitarios, pasillos y zonas comunes con personal capacitado, insumos y supervisión en sitio.
 *           numeroTrabajadoresAprox: 12
 *           fechaInicioServicio: '2026-01-15'
 *           fechaFinServicio: '2026-12-31'
 *           compromisosDocumentales:
 *             - tipo: cfdi_nomina
 *               descripcion: Entrega mensual de CFDI de nómina por cada trabajador asignado al servicio
 *               periodicidad: mensual
 *             - tipo: comprobante_imss
 *               descripcion: Comprobante de pago de cuotas obrero-patronales ante el IMSS
 *               periodicidad: bimestral
 *             - tipo: comprobante_infonavit
 *               descripcion: Comprobante de aportaciones al INFONAVIT conforme al contrato de subcontratación
 *               periodicidad: bimestral
 *           responsabilidadSolidariaAceptada: true
 *           textoResponsabilidadSolidaria: Las partes reconocen la responsabilidad solidaria prevista en el artículo 15-D de la Ley Federal del Trabajo cuando el prestador incumpla obligaciones laborales o de seguridad social.
 *
 *     ContratoServicioEspecializadoUpdate:
 *       type: object
 *       properties:
 *         numeroContrato:
 *           type: string
 *           minLength: 1
 *           maxLength: 50
 *         fechaInicio:
 *           type: string
 *           format: date
 *         fechaFin:
 *           type: string
 *           format: date
 *           nullable: true
 *         objetoServicio:
 *           type: string
 *           minLength: 10
 *           maxLength: 2000
 *         montoTotal:
 *           type: number
 *           minimum: 0
 *           nullable: true
 *         moneda:
 *           type: string
 *           minLength: 3
 *           maxLength: 3
 *         estatus:
 *           type: string
 *           enum: [borrador, vigente, vencido, cancelado]
 *         anexo15d:
 *           type: object
 *           properties:
 *             objetoDetallado:
 *               type: string
 *               minLength: 20
 *               maxLength: 3000
 *             numeroTrabajadoresAprox:
 *               type: integer
 *               minimum: 1
 *             fechaInicioServicio:
 *               type: string
 *               format: date
 *             fechaFinServicio:
 *               type: string
 *               format: date
 *               nullable: true
 *             compromisosDocumentales:
 *               type: array
 *               minItems: 1
 *               items:
 *                 $ref: '#/components/schemas/CompromisoDocumental'
 *             responsabilidadSolidariaAceptada:
 *               type: boolean
 *             textoResponsabilidadSolidaria:
 *               type: string
 *               minLength: 50
 *               maxLength: 3000
 *       example:
 *         estatus: vigente
 *         montoTotal: 475000
 *         anexo15d:
 *           numeroTrabajadoresAprox: 15
 *           compromisosDocumentales:
 *             - tipo: cfdi_nomina
 *               descripcion: CFDI de nómina mensual actualizado
 *               periodicidad: mensual
 *
 *     EmpresaContratanteCreate:
 *       type: object
 *       required: [businessUnitId, razonSocial, rfc, domicilioFiscal]
 *       properties:
 *         businessUnitId:
 *           type: integer
 *         razonSocial:
 *           type: string
 *           minLength: 3
 *           maxLength: 255
 *         rfc:
 *           type: string
 *           minLength: 12
 *           maxLength: 13
 *         domicilioFiscal:
 *           type: string
 *           minLength: 10
 *           maxLength: 500
 *         representanteLegal:
 *           type: string
 *           nullable: true
 *         correo:
 *           type: string
 *           format: email
 *           nullable: true
 *         telefono:
 *           type: string
 *           minLength: 10
 *           maxLength: 20
 *           nullable: true
 *       example:
 *         businessUnitId: 1
 *         razonSocial: Demo CSE - Manufacturas del Norte SA de CV
 *         rfc: DMN900101AA1
 *         domicilioFiscal: Av. Industrial 1200, Parque Industrial Norte, Monterrey, NL, CP 64000
 *         representanteLegal: Lic. Ana Patricia Ruiz
 *         correo: contratos@manufacturas-norte.demo
 *         telefono: '8181234567'
 *
 *     ContratoServicioEspecializadoResource:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         numeroContrato:
 *           type: string
 *         empresaContratante:
 *           $ref: '#/components/schemas/EmpresaContratanteBasicaResource'
 *         fechaInicio:
 *           type: string
 *           format: date
 *         fechaFin:
 *           type: string
 *           format: date
 *           nullable: true
 *         objetoServicio:
 *           type: string
 *         montoTotal:
 *           type: number
 *           nullable: true
 *         moneda:
 *           type: string
 *         estatus:
 *           type: string
 *           enum: [borrador, vigente, vencido, cancelado]
 *         anexo15d:
 *           $ref: '#/components/schemas/Anexo15DResource'
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *
 *     EmpresasContratantesListSuccess:
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
 *             empresasContratantes:
 *               type: object
 *               properties:
 *                 meta:
 *                   $ref: '#/components/schemas/ComplianceRepsePaginationMeta'
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/EmpresaContratanteResource'
 *
 *     EmpresaContratanteSuccess:
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
 *             empresaContratante:
 *               $ref: '#/components/schemas/EmpresaContratanteResource'
 *
 *     ContratosServiciosEspecializadosListSuccess:
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
 *             contratosServiciosEspecializados:
 *               type: object
 *               properties:
 *                 meta:
 *                   $ref: '#/components/schemas/ComplianceRepsePaginationMeta'
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ContratoServicioEspecializadoResource'
 *
 *     ContratoServicioEspecializadoSuccess:
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
 *             contratoServicioEspecializado:
 *               $ref: '#/components/schemas/ContratoServicioEspecializadoResource'
 *       example:
 *         type: success
 *         title: Contrato de Servicios Especializados
 *         message: Contrato creado correctamente
 *         data:
 *           contratoServicioEspecializado:
 *             id: 1
 *             numeroContrato: CSE-2026-001
 *             empresaContratante:
 *               id: 1
 *               razonSocial: Demo CSE - Manufacturas del Norte SA de CV
 *               rfc: DMN900101AA1
 *             fechaInicio: '2026-01-15'
 *             fechaFin: '2026-12-31'
 *             objetoServicio: Prestación de servicios especializados de limpieza industrial en planta y áreas administrativas.
 *             montoTotal: 450000
 *             moneda: MXN
 *             estatus: borrador
 *             anexo15d:
 *               folioRepse: REPSE-123456789
 *               objetoDetallado: Limpieza profunda de áreas productivas, sanitarios, pasillos y zonas comunes con personal capacitado, insumos y supervisión en sitio.
 *               numeroTrabajadoresAprox: 12
 *               fechaInicioServicio: '2026-01-15'
 *               fechaFinServicio: '2026-12-31'
 *               compromisosDocumentales:
 *                 - tipo: cfdi_nomina
 *                   descripcion: Entrega mensual de CFDI de nómina por cada trabajador asignado al servicio
 *                   periodicidad: mensual
 *               responsabilidadSolidariaAceptada: true
 *               textoResponsabilidadSolidaria: Las partes reconocen la responsabilidad solidaria prevista en el artículo 15-D de la Ley Federal del Trabajo cuando el prestador incumpla obligaciones laborales o de seguridad social.
 *             createdAt: '2026-06-01T15:00:00.000Z'
 *             updatedAt: '2026-06-01T15:00:00.000Z'
 */
