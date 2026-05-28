Tipo


feat

Contexto


Qué es. Esta historia introduce una entidad nueva en el dominio de Valanserh: la empresa contratante. Hasta hoy todos los catálogos del producto giran alrededor de la propia empresa cliente (el tenant) y sus empleados — sucursales, puestos, áreas, jefes, contratos individuales de trabajo, etc. Aquí aparece por primera vez una entidad externa: la empresa a la que el tenant le presta servicio. Cada tenant prestador (la empresa registrada en el padrón REPSE — Registro de Prestadoras de Servicios Especializados u Obras Especializadas, administrado por la STPS) mantiene su propio catálogo aislado de empresas contratantes, con razón social, RFC, domicilio fiscal y datos básicos de contacto. Las empresas contratantes no son tenants Valanserh; son terceros que el cliente captura para usarlos después al levantar contratos de servicios especializados (cumpliendo el artículo 14 de la LFT — Ley Federal del Trabajo — que obliga a formalizar por escrito cada servicio especializado).

Razón de ser. El subdominio REPSE de Valanserh empieza por aquí. Sin este catálogo no se pueden modelar contratos de servicios especializados (la siguiente HU de la cadena), ni los anexos 15-D del contrato, ni los reportes cuatrimestrales ICSOE (al IMSS) y SISUB (al INFONAVIT) que el prestador está obligado a presentar. Hoy el tenant prestador no tiene dónde capturar a sus clientes corporativos dentro de Valanserh y termina en hojas de cálculo aparte. Esta HU es la entidad raíz de la cadena.

Impacto. Habilita la cadena REPSE completa de CAP-08-11-02 (contratos y anexo 15-D), CAP-08-11-03 (asignación de empleados a contratos), CAP-08-11-04 (PDF del contrato con anexo) y CAP-08-11-05 (informativas ICSOE/SISUB). Como entidad aislada también es útil por sí sola al tenant prestador para tener su agenda comercial estructurada, aunque el valor mayor se desbloquea cuando ESB-08-11-02-02 entrega la UI del catálogo en el Backoffice.

Alcance


Dentro:

Modelo BD multi-tenant de la tabla empresas_contratantes (catálogo propio del tenant prestador, no compartido entre tenants).
5 endpoints REST: create, list paginado con búsqueda por razón social y RFC, detail, patch, soft delete. El check de no borrar si tiene contratos asociados se agrega en ESB-08-11-02-03.
Validador de RFC reusable en app/shared/validators/: valida formato (12 chars persona moral, 13 chars persona física) y dígito verificador del SAT. Si ya existe en el repo, reusar; si no, crearlo aquí.
Validators VineJS por caso de uso.
Scope forTenant en el modelo Lucid para aislamiento multi-tenant en todos los queries.
Permiso compliance.contratantes.gestion registrado en el seeder de permisos.
Documentación OpenAPI de los 5 endpoints y JSDoc en controllers y use-cases.


Fuera:

UI Backoffice — va en ESB-08-11-02-02.
Clasificación por riesgo fiscal, listado SAT 69-B — esbozo futuro.
Validación en línea del RFC contra servicios públicos del SAT — esbozo futuro.
Importación masiva por CSV o Excel — esbozo futuro.
Histórico de cambios (auditoría por versión) — esbozo futuro.
Asociación con contratos (esa FK la modela ESB-08-11-02-03 desde el lado del contrato).


Criterios de aceptación


Dado un administrador del tenant con permiso compliance.contratantes.gestion, Cuando envía POST /api/empresas-contratantes con razonSocial, rfc válido (formato + dígito verificador SAT) y domicilioFiscal, Entonces el servidor responde 201 con la empresa registrada en el catálogo del tenant, incluyendo el id asignado y los campos enviados.
Dado un administrador con empresas registradas, Cuando envía GET /api/empresas-contratantes?q=ACME y paginación, Entonces el servidor responde 200 con la lista paginada filtrada por razón social o RFC que contenga ACME (case-insensitive), con meta de paginación.
Dado un administrador que envía un RFC con formato válido pero dígito verificador incorrecto, Cuando envía POST /api/empresas-contratantes, Entonces el servidor responde 400 con title RFC inválido, detail explicativo y key rfc-invalido.
Dado un administrador que intenta crear una empresa con un RFC que ya existe en su tenant (no soft-deleted), Cuando envía POST /api/empresas-contratantes, Entonces el servidor responde 409 con title RFC duplicado, detail Ya existe una empresa con ese RFC en su catálogo y key rfc-duplicado.
Dado un administrador del tenant A, Cuando envía GET /api/empresas-contratantes/:id donde el id pertenece al tenant B, Entonces el servidor responde 404 con title Empresa contratante no encontrada y key empresa-contratante-no-encontrada (no 403, para no filtrar existencia cross-tenant).


Contrato de API


POST /api/empresas-contratantes — Request body con razonSocial (3-255), rfc (12-13 chars, formato + dígito SAT), domicilioFiscal (10-500), representanteLegal opcional, correo opcional (email válido), telefono opcional (10-20). Response 201 con id asignado y todos los campos enviados más createdAt y updatedAt. Errores: 400 validación, 401 no autenticado, 403 sin permiso, 409 RFC duplicado.

GET /api/empresas-contratantes?q=&page=1&perPage=20 — Response 200 con data como array paginado y meta con total, page, perPage y lastPage.

GET /api/empresas-contratantes/:id — detalle.

PATCH /api/empresas-contratantes/:id — todos los campos opcionales; 409 si nuevo RFC choca con otro.

DELETE /api/empresas-contratantes/:id — soft delete; 204.

Archivos / módulos afectados


Tomar los siguientes números secuenciales en database/migrations/; ejecutar ls database/migrations/ tail -5 antes de crear.

database/migrations/NNNN_create_empresas_contratantes_table.ts (nuevo)
app/models/empresa-contratante.ts (nuevo)
app/modules/compliance-repse/empresas-contratantes/create-empresa-contratante/ (nuevo: controller + use-case + repository)
app/modules/compliance-repse/empresas-contratantes/list-empresas-contratantes/ (nuevo)
app/modules/compliance-repse/empresas-contratantes/get-empresa-contratante/ (nuevo)
app/modules/compliance-repse/empresas-contratantes/update-empresa-contratante/ (nuevo)
app/modules/compliance-repse/empresas-contratantes/delete-empresa-contratante/ (nuevo)
app/validators/compliance-repse/empresa-contratante.validator.ts (nuevo)
app/shared/validators/rfc.validator.ts (revisar si existe — si sí, reusar; si no, crear con dígito verificador SAT)
start/routes.ts (5 rutas nuevas en sección compliance-repse)
database/seeders/NNNN_permisos_seeder.ts (agregar compliance.contratantes.gestion)
docs/openapi.yaml (5 entradas + schema EmpresaContratante)


Base de datos


Una tabla nueva, multi-tenant, con soft delete. Migración reversible.

empresas_contratantes:

id bigint PK
tenant_id bigint NOT NULL, FK tenants(id), INDEX
razon_social varchar(255) NOT NULL
rfc varchar(13) NOT NULL
domicilio_fiscal varchar(500) NOT NULL
representante_legal varchar(255) NULL
correo varchar(255) NULL
telefono varchar(20) NULL
created_at, updated_at, deleted_at (soft delete)
UNIQUE (tenant_id, rfc) — soft-deleted no cuenta para unicidad si el motor lo permite
INDEX (tenant_id, deleted_at)
INDEX (tenant_id, razon_social) — para búsquedas LIKE rápidas


UI


No aplica. Esta HU es solo API. La UI Backoffice se entrega en ESB-08-11-02-02.

Seguridad


Todos los endpoints requieren autenticación y permiso compliance.contratantes.gestion (validar nomenclatura vigente; si no existe, registrar en seeder).
Multi-tenant: cada query Lucid usa forTenant(auth.user.tenantId). Nunca confiar en tenantId del body, query o header — siempre del usuario autenticado.
Soft delete obligatorio: la SAT exige conservar documentación fiscal 5 años; los datos del contratante son parte del expediente del contrato.
Validador de RFC con formato y dígito verificador SAT — si se implementa mal, el catálogo se contamina y los reportes ICSOE/SISUB futuros fallan.
Rate limit por defecto (middleware base).
Logs estructurados: enmascarar RFC completo si se loguea para debug. Nunca loguear razón social completa.
Responses nunca exponen tenant_id.


Definition of Done


Migración implementada, reversible, con UNIQUE e índices declarados.
Modelo Lucid con scope forTenant aplicado por defecto.
5 endpoints implementados con arquitectura hexagonal (controller delgado, use-case, repository).
Validators VineJS por caso de uso (create, update).
Validador de RFC con dígito verificador SAT funcionando en app/shared/validators/.
Permiso compliance.contratantes.gestion registrado en seeder.
OpenAPI actualizado con 5 entradas y schema reusable EmpresaContratante.
JSDoc en controllers y use-cases.
Validación manual con Postman: caso feliz + 5 casos de error + cross-tenant isolation.
Checklist pre-PR completo.
PR aprobado por Wilvardo.
Desplegado a staging y validado.
Desplegado a producción.


Nota técnica para el dev: el DELETE de esta HU no valida si la empresa tiene contratos asociados (la tabla contratos_servicios_especializados no existe todavía). En ESB-08-11-02-03 se extenderá el DELETE para devolver 409 si hay contratos activos. No agregar el check aquí.

Estimación


Horas estimadas: 5 h
Story points: 2 (rango 5-8h, piso del rango)
Complejidad: M
Modelo sugerido: Sonnet


Justificación de 5h: si el validador RFC con dígito verificador SAT ya existe en el repo, la HU baja a 4h/1SP. Como no se confirmó, se asume implementación nueva. Al refinar ejecutar grep -r rfc app/shared/validators/ para confirmar.

Dependencias / bloqueos


Depende formal de USRH1779835142718 Construir catálogo de servicios especializados en el módulo REPSE BO (ya completa). La cadena CAP-08-11-02 arranca desde la rama de esa HU para mantener el módulo REPSE amarrado hasta merge final a develop.
Bloquea a ESB-08-11-02-02 Gestionar catálogo de empresas contratantes en módulo REPSE (BO).
Bloquea transitivamente a ESB-08-11-02-03 y ESB-08-11-02-04.


Branch chain: Target Branch feature/USRH1779835142718-repse-bo-catalogo-servicios. Branch Name feature/USRH1779980311120-catalogo-empresas-contratantes-api.

Nota técnica cross-repo: la rama base vive físicamente en valanserh-bo. Esta HU se trabaja en valanserh-api. El dev crea la rama localmente en valanserh-api partiendo del HEAD del módulo REPSE en API o de develop si las HUs API previas ya están mergeadas. El Target Branch en Asana opera como id de dependencia, no como referencia git literal entre repos.

Asignado a


Dev: Noé Abel Vargas López
Reviewer: Wilvardo Ramírez Colunga