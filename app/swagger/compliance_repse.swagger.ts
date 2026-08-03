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
 *     ServicioRegistradoResumen:
 *       type: object
 *       required: [id, name]
 *       properties:
 *         id:
 *           type: integer
 *           description: ID del servicio en el catálogo REPSE del tenant.
 *         name:
 *           type: string
 *           description: Nombre del servicio especializado registrado.
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
 *         - serviciosRegistradosIds
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
 *         serviciosRegistradosIds:
 *           type: array
 *           minItems: 1
 *           description: |
 *             IDs de servicios del catálogo REPSE del tenant (GET /api/repse-specialized-services).
 *             Mínimo uno; vincula el contrato con las líneas registradas que lo amparan.
 *           items:
 *             type: integer
 *             minimum: 1
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
 *         serviciosRegistradosIds: [1, 2]
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
 *         serviciosRegistradosIds:
 *           type: array
 *           minItems: 1
 *           description: |
 *             Reemplaza el set de servicios vinculados al contrato (mínimo uno si se envía).
 *           items:
 *             type: integer
 *             minimum: 1
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
 *         serviciosRegistradosIds: [1]
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
 *           oneOf:
 *             - type: string
 *               format: uuid
 *             - type: integer
 *               minimum: 1
 *           description: |
 *             Código público UUID v4 de la empresa prestadora (preferido)
 *             o ID interno legacy. `businessScope` resuelve el UUID al ID interno.
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
 *         businessUnitId: 6f851b92-0ebf-4ad8-8a02-63e6ec72de76
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
 *           description: |
 *             Estatus efectivo derivado en lectura. Para contratos declarados vigente,
 *             puede ser vencido si fecha_fin o el documento firmado vigente ya venció (CDMX).
 *         vencidoPorFecha:
 *           type: boolean
 *           description: |
 *             true solo cuando el estatus efectivo es vencido por expiración de fecha
 *             (fecha_fin o documento firmado vigente) y el estatus declarado en BD sigue siendo vigente.
 *         anexo15d:
 *           $ref: '#/components/schemas/Anexo15DResource'
 *         serviciosRegistrados:
 *           type: array
 *           description: |
 *             Servicios del catálogo REPSE vinculados al contrato (id y nombre).
 *             Presente en POST 201, PATCH 200, GET list y GET detail.
 *           items:
 *             $ref: '#/components/schemas/ServicioRegistradoResumen'
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           nullable: true
 *       example:
 *         id: 1
 *         numeroContrato: CSE-2026-001
 *         empresaContratante:
 *           id: 1
 *           razonSocial: La casa
 *           rfc: MVGI541001RE6
 *         fechaInicio: '2026-01-23'
 *         fechaFin: '2026-01-23'
 *         objetoServicio: Prestación de servicios especializados de limpieza industrial.
 *         montoTotal: 450000
 *         moneda: MXN
 *         estatus: borrador
 *         anexo15d:
 *           folioRepse: Prueba12
 *           objetoDetallado: Limpieza profunda de áreas productivas y zonas comunes.
 *           numeroTrabajadoresAprox: 12
 *           fechaInicioServicio: '2026-01-15'
 *           fechaFinServicio: '2026-12-31'
 *           compromisosDocumentales:
 *             - tipo: cfdi_nomina
 *               descripcion: Entrega mensual de CFDI de nómina
 *               periodicidad: mensual
 *           responsabilidadSolidariaAceptada: true
 *           textoResponsabilidadSolidaria: Las partes reconocen la responsabilidad solidaria prevista en el artículo 15-D de la LFT.
 *         serviciosRegistrados:
 *           - id: 18
 *             name: Demo REPSE - Mantenimiento de aire acondicionado
 *         createdAt: '2026-06-04T18:14:04.868+00:00'
 *         updatedAt: '2026-06-04T18:14:04.868+00:00'
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
 *             serviciosRegistrados:
 *               - id: 18
 *                 name: Demo REPSE - Mantenimiento de aire acondicionado
 *             createdAt: '2026-06-04T18:14:04.868+00:00'
 *             updatedAt: '2026-06-04T18:14:04.868+00:00'
 *
 *     ContratoServicioEspecializadoImportacionRowError:
 *       type: object
 *       required: [row, motivo, key, code]
 *       properties:
 *         row:
 *           type: integer
 *           description: Número de fila del archivo Excel (1 = cabecera; primera fila de datos = 2).
 *         motivo:
 *           type: string
 *           description: Motivo legible del rechazo, en el idioma de `Accept-Language`.
 *         key:
 *           type: string
 *           description: Clave estable kebab-case del motivo.
 *         code:
 *           type: string
 *           description: Código estable del catálogo `CSE.*` (reusa códigos de dominio o `CSE.IMP.*`).
 *
 *     ContratoServicioEspecializadoImportacionResumen:
 *       type: object
 *       required: [totalRows, created, rejected]
 *       properties:
 *         totalRows:
 *           type: integer
 *           description: Filas de datos no vacías procesadas (excluye la cabecera).
 *         created:
 *           type: integer
 *           description: Contratos dados de alta exitosamente.
 *         rejected:
 *           type: integer
 *           description: Filas rechazadas (longitud de rowErrors).
 *
 *     ContratoServicioEspecializadoImportacionSuccess:
 *       type: object
 *       required: [type, title, message, data]
 *       properties:
 *         type:
 *           type: string
 *           enum: [success, warning]
 *           description: warning cuando rejected > 0; success cuando todas las filas se importaron.
 *         title:
 *           type: string
 *         message:
 *           type: string
 *         data:
 *           type: object
 *           required: [summary, rowErrors, warnings]
 *           properties:
 *             summary:
 *               $ref: '#/components/schemas/ContratoServicioEspecializadoImportacionResumen'
 *             rowErrors:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ContratoServicioEspecializadoImportacionRowError'
 *             warnings:
 *               type: array
 *               items:
 *                 type: string
 *       example:
 *         type: warning
 *         title: Importación de Contratos de Servicios Especializados
 *         message: 'Importación completada: 3 contrato(s) creado(s), 2 fila(s) rechazada(s).'
 *         data:
 *           summary:
 *             totalRows: 5
 *             created: 3
 *             rejected: 2
 *           rowErrors:
 *             - row: 4
 *               motivo: El contratante con RFC XAXX010101000 no existe en su catálogo.
 *               key: contratante-rfc-no-encontrado
 *               code: CSE.IMP.CONTRATANTE.001
 *             - row: 7
 *               motivo: Ya existe un contrato con ese número en su tenant.
 *               key: numero-contrato-duplicado
 *               code: CSE.CONFLICT.NUMERO.001
 *           warnings: []
 */
