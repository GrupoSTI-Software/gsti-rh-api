# Display of all Error Codes Documentation --The GSTI Development Team

### SYS.CNFG.PRSS.014 - Image Read Error

**When it occurs:**
This error occurs when the system cannot read or process the uploaded image file at the file system level or during image processing.

**How it can happen:**
1. **File system errors:**
   - The temporary file path is invalid or inaccessible
   - File permissions prevent reading the file
   - The file was deleted before processing (race condition)
   - Disk I/O errors

2. **Image processing errors:**
   - The file is corrupted or incomplete
   - The file is not a valid image format (even if extension is .png)
   - The PNG file structure is malformed
   - Memory errors when loading large images
   - Sharp library cannot decode the image data

3. **Technical scenarios:**
   - Network interruption during file upload
   - File system corruption
   - Insufficient memory to load the image
   - Invalid PNG header or metadata

**Technical details:**
- Triggered when `fs.readFileSync()` fails
- Triggered when `sharp().metadata()` throws an exception
- Triggered when `sharp().stats()` throws an exception
- Triggered when `sharp().raw().toBuffer()` throws an exception

**User impact:**
The user sees a generic error message. They should try:
- Re-uploading the file
- Verifying the file is not corrupted
- Checking file permissions
- Using a different image file

**Resolution:**
- Verify file integrity
- Check server logs for specific error details
- Ensure sufficient disk space and memory
- Validate file is a valid PNG before upload

---

### SYS.CNFG.PRSS.015 - Dimensions Read Error

**When it occurs:**
This error occurs when the system successfully reads the image file but cannot extract or determine its width and height dimensions.

**How it can happen:**
1. **Metadata extraction failures:**
   - PNG metadata is missing or corrupted
   - Image header is incomplete
   - Sharp library cannot parse image dimensions
   - Image format is not standard PNG

2. **File structure issues:**
   - PNG file is truncated (incomplete download)
   - Image data is present but dimension headers are missing
   - File is a valid PNG but metadata section is corrupted

3. **Library processing errors:**
   - Sharp library version incompatibility
   - Image uses unsupported PNG variant
   - Memory issues during metadata extraction

**Technical details:**
- Triggered when `metadata.width` or `metadata.height` is `null` or `undefined`
- Occurs after successful file read but before dimension validation
- Indicates the file is readable but dimension data is unavailable

**User impact:**
The user uploaded a file that appears to be an image but the system cannot determine its size. They should:
- Verify the image opens correctly in an image viewer
- Re-save the image in a standard image editor
- Try exporting the image again

**Resolution:**
- Open and re-save the image in an image editor
- Verify PNG file integrity
- Check if image uses standard PNG format
- Try converting from another format to PNG

---

### SYS.CNFG.PRSS.016 - Upload Error

**When it occurs:**
This error occurs when the system successfully validates the image but fails to upload it to the cloud storage service (S3/DigitalOcean Spaces).

**How it can happen:**
1. **Network connectivity issues:**
   - Internet connection interrupted during upload
   - Timeout while uploading to S3
   - Network latency exceeds timeout limits
   - DNS resolution failures

2. **Storage service errors:**
   - S3/DigitalOcean Spaces service is down or unavailable
   - Storage quota exceeded
   - Bucket permissions misconfigured
   - AWS credentials expired or invalid
   - Storage service rate limiting

3. **Configuration errors:**
   - Incorrect AWS access keys or secret keys
   - Wrong bucket name or region
   - Incorrect endpoint configuration
   - ACL permissions not properly set

4. **File-related issues:**
   - File stream is corrupted during upload
   - File size exceeds service limits
   - Content-Type header is invalid

**Technical details:**
- Triggered when `uploadService.fileUpload()` returns `'S3Producer.fileUpload'` or `'file_not_found'`
- Occurs in the `catch` block of the upload service
- The file validation passed but storage upload failed

**User impact:**
The user's image was validated successfully but couldn't be saved. They should:
- Check their internet connection
- Try again after a few moments
- Contact support if the issue persists

**Resolution:**
- Retry the upload operation
- Verify network connectivity
- Check storage service status
- Verify AWS credentials and permissions
- Check server logs for specific S3 error messages

---

### SYS.CNFG.PRSS.017 - Delete Error

**When it occurs:**
This error occurs when updating an existing employee application icon. The new image uploads successfully, but the system cannot delete the previous/old image file from storage.

**How it can happen:**
1. **File not found scenarios:**
   - Previous file was already deleted manually
   - File path in database is incorrect or malformed
   - File was moved or renamed in storage
   - File never existed (data inconsistency)

2. **Storage service errors:**
   - S3/DigitalOcean Spaces service temporarily unavailable
   - Network timeout during delete operation
   - Storage service rate limiting
   - Insufficient permissions to delete files

3. **Path resolution errors:**
   - Incorrect file key/path extraction from URL
   - URL format changed (different storage provider)
   - Bucket name mismatch
   - Path encoding issues (special characters)

4. **Permission errors:**
   - AWS credentials don't have delete permissions
   - Bucket policy doesn't allow deletion
   - File is locked or in use

**Technical details:**
- Triggered when `uploadService.deleteFile()` returns status other than 200 or 404
- Only occurs during UPDATE operations (not CREATE)
- New file is already uploaded, but old file cleanup fails
- Status 404 is acceptable (file already deleted), but other errors trigger this code

**User impact:**
The new icon was successfully uploaded and is active, but the old file remains in storage. This doesn't affect functionality but:
- Uses unnecessary storage space
- May cause confusion if old file is accessed
- Should be cleaned up manually if error persists

**Resolution:**
- The new icon is already active (non-blocking error)
- Check storage service logs for specific error
- Manually delete old file if needed
- Verify AWS delete permissions
- Check file path format in database

---

### SYS.CNFG.PRSS.018 - File Too Large

**When it occurs:**
This error occurs when the uploaded image file exceeds the maximum allowed file size limit.

**How it can happen:**
1. **File size limits:**
   - Image file is larger than configured maximum (e.g., 5MB, 10MB)
   - High-resolution images with large file sizes
   - Uncompressed PNG files
   - Images with embedded metadata or thumbnails

2. **Server configuration:**
   - Server has file size upload limits (nginx, Apache)
   - Node.js body parser size limits
   - AdonisJS file upload size restrictions
   - Memory limits for file processing

3. **Storage considerations:**
   - Storage service has per-file size limits
   - Network bandwidth limitations
   - Processing timeouts for large files

**Technical details:**
- Currently prepared for future implementation
- Should be validated before file processing begins
- Can be checked via `file.size` property
- Recommended limit: 2-5MB for 512x512 PNG icons

**User impact:**
The user uploaded a file that is too large. They should:
- Compress the image
- Reduce image quality if needed
- Remove unnecessary metadata
- Use image optimization tools

**Resolution:**
- Compress PNG using tools like TinyPNG, ImageOptim
- Remove EXIF data and metadata
- Ensure image is exactly 512x512 (no larger)
- Use PNG optimization tools

---

## Error Codes: EXCPT.REQ.APPR.001

### EXCPT.REQ.APPR.001 - Sin días de vacaciones disponibles al aprobar solicitud

**Cuándo ocurre:**
Este error ocurre cuando se aprueba una solicitud de excepción de turno de tipo vacaciones (slug `vacation`) y el empleado no tiene ningún periodo de vacaciones con días disponibles según sus años trabajados.

**Cómo puede ocurrir:**
1. **Sin días disponibles en ningún periodo:**
   - El empleado ya consumió todos los días de vacaciones de todos sus periodos (por años de antigüedad).
   - No existe un periodo con cupo en el rango desde su año de ingreso hasta el año de la fecha solicitada.

2. **Configuración de vacaciones:**
   - No hay `VacationSetting` que aplique para los años de servicio del empleado.
   - Los periodos existentes ya tienen todas las plazas utilizadas (ShiftException con ese `vacation_setting_id`).

3. **Contexto de uso:**
   - Al aprobar una solicitud de excepción con estado `accepted` y tipo de excepción vacaciones, el sistema intenta asignar el día de vacaciones al periodo más antiguo con días disponibles; si no hay ninguno, se devuelve este código.

**Detalles técnicos:**
- Se dispara en `ExceptionRequestsController.updateStatus` cuando `status === 'accepted'` y el tipo de excepción es `vacation`.
- Se usa `EmployeeService.getOldestAvailableVacationPeriod(employee, vacationDate)` para obtener el periodo más antiguo con días disponibles.
- Si el método retorna `null`, se responde con HTTP 400 y `errorCode: 'EXCPT.REQ.APPR.001'`.

**Impacto al usuario:**
El aprobador ve que la solicitud de vacaciones no pudo procesarse porque el empleado no tiene días disponibles. Debe:
- Revisar el balance de vacaciones del empleado por periodo (años trabajados).
- No aprobar la solicitud hasta que exista un periodo con días disponibles o ajustar la configuración de vacaciones.

**Resolución:**
- Verificar en el módulo de vacaciones los días por periodo y años de servicio del empleado.
- Confirmar que existan `VacationSetting` y que el empleado tenga al menos un periodo con días restantes.
- Si aplica, revisar que la fecha solicitada y la fecha de ingreso permitan al menos un periodo válido con cupo.

---

## Error Codes: Archivador de vacaciones (VAC.ARCH.xxx)

Estos códigos se utilizan en el módulo de **archivador de vacaciones** (evidencias de vacaciones de empleados: fotos y PDF subidos a S3).

### VAC.ARCH.001 - Archivador de vacaciones no encontrado

**Cuándo ocurre:** Al consultar o subir contenidos a un archivador que no existe o fue eliminado.

**Respuesta API:** Se devuelve `errorCode: 'VAC.ARCH.001'` junto con el mensaje genérico en las respuestas de error (HTTP 404).

---

### VAC.ARCH.002 - Empleado no encontrado

**Cuándo ocurre:** Al crear un archivador con un `employeeId` que no existe o fue eliminado.

**Respuesta API:** HTTP 404, `errorCode: 'VAC.ARCH.002'`.

---

### VAC.ARCH.003 - Excepción de turno no encontrada

**Cuándo ocurre:** Al crear un archivador y vincular un `shiftExceptionId` que no existe o fue eliminado, o la excepción no pertenece al empleado del archivador.

**Respuesta API:** HTTP 404 o 400, `errorCode: 'VAC.ARCH.003'`.

---

### VAC.ARCH.004 - Configuración de vacaciones no encontrada

**Cuándo ocurre:** Al crear un archivador con un `vacationSettingId` que no existe o fue eliminado.

**Respuesta API:** HTTP 404, `errorCode: 'VAC.ARCH.004'`.

---

### VAC.ARCH.005 - Archivo no proporcionado

**Cuándo ocurre:** Al subir evidencia (contenido) sin enviar el campo `file` en multipart/form-data.

**Respuesta API:** HTTP 400, `errorCode: 'VAC.ARCH.005'`.

---

### VAC.ARCH.006 - El archivo excede el tamaño máximo permitido

**Cuándo ocurre:** El archivo subido supera el límite de **5MB** para evidencias de vacaciones.

**Respuesta API:** HTTP 400, `errorCode: 'VAC.ARCH.006'`.

---

### VAC.ARCH.007 - Tipo de archivo no permitido

**Cuándo ocurre:** El archivo no es una imagen (jpg, jpeg, png, gif, webp) ni un PDF.

**Respuesta API:** HTTP 400, `errorCode: 'VAC.ARCH.007'`.

---

### VAC.ARCH.008 - Contenido del archivador no encontrado

**Cuándo ocurre:** Al consultar o eliminar un contenido (evidencia) por ID que no existe o fue eliminado.

**Respuesta API:** HTTP 404, `errorCode: 'VAC.ARCH.008'`.

---

### VAC.ARCH.009 - Excepción de turno no es de tipo vacaciones

**Cuándo ocurre:** Al crear un archivador y vincular un `shiftExceptionId` cuya excepción de turno no tiene tipo con slug `vacation`.

**Respuesta API:** HTTP 400, `errorCode: 'VAC.ARCH.009'`.

---

### VAC.ARCH.010 - Excepción de turno ya vinculada

**Cuándo ocurre:** La excepción de turno indicada ya está asociada a otro archivador de vacaciones (cada excepción solo puede estar en un archivador).

**Respuesta API:** HTTP 400, `errorCode: 'VAC.ARCH.010'`.

---

**Códigos reutilizados en este módulo:** En subida/eliminación de archivos al S3 se reutilizan `SYS.CNFG.PRSS.016` (error al subir), `SYS.CNFG.PRSS.017` (error al eliminar en S3). El límite de 5MB se valida con `VAC.ARCH.006`. El archivador se relaciona con **excepciones de turno** (tipo vacation) mediante tabla pivote, no con solicitudes de excepción.

---

## Módulo Sucursales (Branch offices) — API `/api/branch-offices`

**Referencia JSON:** `docs/branch_offices_api_reference.json` (ejemplos de request/response, query, cuerpos y tabla de `errorCode`).

**Respuestas de error:** además de `message`, el cuerpo incluye **`errorCode`** (prefijo `BRCH.*`) para que el cliente pueda ramificar con un `switch` fijo sin depender del texto del mensaje ni de cadenas largas en memoria.

### BRCH.VAL.001 — Validación de entrada

**Cuándo ocurre:** Parámetros de query o cuerpo JSON no cumplen las reglas de Vine (tipos, rangos, enums).

**Cómo puede ocurrir:**
- `page`, `limit`, `businessUnitId` con valores no numéricos o fuera de rango
- `sortOrder` distinto de `asc` o `desc`
- `branchOfficeName` vacío en POST o longitud inválida
- Campos numéricos opcionales negativos

**Respuesta API:** HTTP **400**, `errorCode: 'BRCH.VAL.001'`, `message` con el primer error de validación.

**Acción cliente:** Corregir el payload o query; no reintentar el mismo cuerpo.

---

### BRCH.NOT.001 — Sucursal no disponible

**Cuándo ocurre:** No existe fila para el `id`, o la sucursal no pertenece a ninguna unidad de negocio cuyo slug esté en `SYSTEM_BUSINESS` (incluye eliminados lógicos fuera de consulta normal).

**Cómo puede ocurrir:**
- ID inexistente en `branch_offices`
- Instancia del API con `SYSTEM_BUSINESS` que no incluye la unidad de la sucursal
- Intento de GET/PUT/DELETE sobre recurso fuera de alcance

**Respuesta API:** HTTP **404**, `errorCode: 'BRCH.NOT.001'`.

**Acción cliente:** Refrescar listado; no tratar como error de servidor.

---

### BRCH.CFG.001 — Configuración SYSTEM_BUSINESS ausente

**Cuándo ocurre:** Al crear (o al validar unidad) la variable de entorno `SYSTEM_BUSINESS` está vacía o no define slugs tras separar por comas.

**Respuesta API:** HTTP **400**, `errorCode: 'BRCH.CFG.001'`.

**Acción cliente:** Escalar a administración de plataforma; revisar `.env`.

**Nota:** El listado GET con `SYSTEM_BUSINESS` vacío devuelve **200** con lista vacía (meta `total: 0`), sin `errorCode`.

---

### BRCH.BU.001 — Unidad de negocio no permitida

**Cuándo ocurre:** `businessUnitId` no existe, está inactiva, eliminada, o su `business_unit_slug` no está en la lista derivada de `SYSTEM_BUSINESS`.

**Respuesta API:** HTTP **400**, `errorCode: 'BRCH.BU.001'`.

**Acción cliente:** Usar solo IDs devueltos por `/api/business-units` (u origen equivalente filtrado por el sistema).

---

### BRCH.SYS.001 — Error no clasificado

**Cuándo ocurre:** Excepción en el controlador que no es `E_VALIDATION_ERROR`, `E_ROW_NOT_FOUND` ni `BranchOfficeServiceError`.

**Respuesta API:** HTTP según el endpoint (típicamente 400 en index/store/update; 404 en show/destroy si el fallback lo indica), `errorCode: 'BRCH.SYS.001'`.

**Acción cliente:** Registrar `message` y correlación; revisar logs del servidor.

---

## Error Code Summary Table

| Code | Error Type | HTTP Status | User Action | System Action |
|------|------------|-------------|-------------|---------------|
| EXCPT.REQ.APPR.001 | Sin días de vacaciones disponibles al aprobar solicitud | 400 | Revisar balance de vacaciones del empleado, no aprobar hasta tener cupo | Validar periodos con getOldestAvailableVacationPeriod |
| SYS.CNFG.PRSS.014 | Image Read Error | 400 | Re-upload file, verify file integrity | Log error details, check file system |
| SYS.CNFG.PRSS.015 | Dimensions Read Error | 400 | Re-save image, verify PNG format | Check image metadata, validate PNG structure |
| SYS.CNFG.PRSS.016 | Upload Error | 500 | Retry upload, check connection | Verify S3 credentials, check storage service |
| SYS.CNFG.PRSS.017 | Delete Error | 500 | No action needed (non-blocking) | Log error, verify permissions, manual cleanup |
| SYS.CNFG.PRSS.018 | File Too Large | 400 | Compress image, optimize file | Validate file size before processing |
| VAC.ARCH.001 | Archivador de vacaciones no encontrado | 404 | Verificar ID del archivador | EmployeeVacationArchiveContentService.createContent |
| VAC.ARCH.002 | Empleado no encontrado | 404 | Verificar employeeId al crear archivador | EmployeeVacationArchiveService.validateArchivePayload |
| VAC.ARCH.003 | Excepción de turno no encontrada | 404/400 | Verificar shiftExceptionId y que sea del empleado | EmployeeVacationArchiveService.validateShiftExceptionsForArchive |
| VAC.ARCH.004 | Configuración de vacaciones no encontrada | 404 | Verificar vacationSettingId | EmployeeVacationArchiveService.validateArchivePayload |
| VAC.ARCH.005 | Archivo no proporcionado | 400 | Enviar campo file en multipart | EmployeeVacationArchiveContentService.createContent |
| VAC.ARCH.006 | Archivo excede 5MB | 400 | Comprimir archivo, máx. 5MB | EmployeeVacationArchiveContentService.createContent |
| VAC.ARCH.007 | Tipo de archivo no permitido (solo imagen/PDF) | 400 | Usar jpg, jpeg, png, gif, webp o pdf | EmployeeVacationArchiveContentService.createContent |
| VAC.ARCH.008 | Contenido del archivador no encontrado | 404 | Verificar ID del contenido | EmployeeVacationArchiveContentService.findById |
| VAC.ARCH.009 | Excepción de turno no es tipo vacaciones | 400 | Usar solo excepciones con tipo slug vacation | EmployeeVacationArchiveService.validateShiftExceptionsForArchive |
| VAC.ARCH.010 | Excepción de turno ya vinculada a otro archivador | 400 | No vincular la misma excepción dos veces | EmployeeVacationArchiveService.validateShiftExceptionsForArchive |
| BRCH.VAL.001 | Validación query/body sucursales (Vine) | 400 | Corregir parámetros o JSON | BranchOfficesController + resolveBranchOfficeApiError |
| BRCH.NOT.001 | Sucursal no encontrada o fuera de SYSTEM_BUSINESS | 404 | Verificar id y alcance de instancia | BranchOfficeService.getById / update / delete |
| BRCH.CFG.001 | SYSTEM_BUSINESS sin slugs al validar unidad | 400 | Configurar .env | BranchOfficeService.assertBusinessUnitExists |
| BRCH.BU.001 | Unidad inexistente, inactiva o slug no en SYSTEM_BUSINESS | 400 | Usar businessUnitId permitido | BranchOfficeService.assertBusinessUnitExists |
| BRCH.SYS.001 | Error no tipado en módulo sucursales | 400/404 | Revisar logs | BranchOfficesController catch fallback |

---

## Implementation Notes

### Error Handling Flow

1. **File Upload** → File system validation
2. **File Read** → SYS.CNFG.PRSS.014 (if fails)
3. **Metadata Extraction** → SYS.CNFG.PRSS.015 (if dimensions unavailable)
4. **Dimension Validation** → SYS.CNFG.VAL.010 (if wrong size)
5. **Format Validation** → SYS.CNFG.VAL.011, SYS.CNFG.VAL.012 (if invalid)
6. **Upload to Storage** → SYS.CNFG.PRSS.016 (if fails)
7. **Delete Old File** → SYS.CNFG.PRSS.017 (if fails, only on update)

### Best Practices

- Always log the underlying error for SYS.CNFG.PRSS.014 and SYS.CNFG.PRSS.016
- SYS.CNFG.PRSS.017 is non-critical (new file is already uploaded)
- Implement file size validation early (SYS.CNFG.PRSS.018)
- Provide user-friendly messages with actionable steps
- Monitor error rates to identify systemic issues

### Archivador de vacaciones (evidencias)

- Todas las respuestas de error incluyen el campo **errorCode** además del mensaje, para que el cliente pueda mapear a mensajes o acciones específicas.
- Flujo: crear archivador (POST `/api/employee-vacation-archives`) con `employeeId`, `vacationSettingId` y opcionalmente `shiftExceptionIds` (solo excepciones de turno con tipo slug `vacation`) → subir archivos (POST `.../contents`) con límite 5MB y tipos imagen/PDF.
- Los archivadores se vinculan a **excepciones de turno** (ShiftException) mediante tabla pivote `employee_vacation_archive_shift_exceptions`; cada excepción solo puede estar en un archivador.
- Códigos propios del módulo: VAC.ARCH.001–VAC.ARCH.010; se reutilizan SYS.CNFG.PRSS.016 y SYS.CNFG.PRSS.017 para fallos de S3.

### Sucursales (branch offices)

- `StandardResponseFormatter.error` acepta `errorCode` opcional; el módulo sucursales lo envía en todos los errores HTTP del controlador.
- Constantes: `app/constants/branch_office_error_codes.ts`; resolución: `app/helpers/branch_office_api_error.ts`; dominio: `BranchOfficeServiceError` en `app/exceptions/branch_office_service_error.ts`.

---

## Módulo Demo — Endpoint POST /api/generate-demo-v2

Este endpoint **solo existe en el servidor demo** (`APP_MODE=demo`). En producción el módulo se excluye físicamente del build y el endpoint responde `404`. Los errores del middleware de protección se documentan a continuación.

Los errores se devuelven como `{ type: 'error', title: string, data: { key: string } }`.

### demo-https-requerido — HTTPS obligatorio

**HTTP 403**

**Cuándo ocurre:** El request llega por HTTP plano (no HTTPS) en un entorno `NODE_ENV=production`.

**Respuesta:** `{ title: 'HTTPS requerido', data: { key: 'demo-https-requerido' } }`

**Acción cliente:** Usar HTTPS en todas las peticiones al servidor demo.

---

### demo-rol-root-requerido — Permisos insuficientes

**HTTP 403**

**Cuándo ocurre:** El usuario autenticado tiene un rol distinto a `root`.

**Respuesta:** `{ title: 'Permisos insuficientes', data: { key: 'demo-rol-root-requerido' } }`

**Acción cliente:** Autenticarse con un usuario de rol `root` antes de invocar el endpoint.

---

### demo-db-no-autorizada — Conexión de DB no autorizada

**HTTP 403**

**Cuándo ocurre:** El nombre de la base de datos activa (`DB_DATABASE`) no contiene el patrón configurado en `DEMO_ALLOWED_DB_PATTERN` (valor por defecto: `"demo"`). Protege contra ejecución accidental en una DB de producción.

**Respuesta:** `{ title: 'Conexión de base de datos no autorizada', data: { key: 'demo-db-no-autorizada' } }`

**Acción:** El administrador debe verificar que `DB_DATABASE` apunte a una base de datos demo.

---

### demo-password-invalida — Password de demo incorrecta

**HTTP 401**

**Cuándo ocurre:** La password enviada en el body no coincide con el hash `DEMO_PASSWORD_HASH` del servidor (verificación timing-safe con argon2id).

**Respuesta:** `{ title: 'Password de demo incorrecta', data: { key: 'demo-password-invalida' } }`

**Acción cliente:** Verificar la password correcta en 1Password. Los intentos fallidos se registran en el correo de auditoría.

---

### demo-rate-limit — Demasiados intentos

**HTTP 429**

**Cuándo ocurre:** Se superaron los 3 intentos permitidos por IP en una ventana de 15 minutos. La IP queda bloqueada por 1 hora.

**Respuesta:** `{ title: 'Demasiados intentos', data: { key: 'demo-rate-limit' } }`

**Acción cliente:** Esperar que se libere el bloqueo (mínimo 15 minutos desde el último intento, hasta 1 hora). El equipo de desarrollo recibe un correo de auditoría con `resultado=rate_limit`.

---

### Tabla de resumen — Módulo Demo

| Key | HTTP | Descripción |
|-----|------|-------------|
| `demo-https-requerido` | 403 | Request por HTTP en producción |
| `demo-rol-root-requerido` | 403 | Usuario sin rol root |
| `demo-db-no-autorizada` | 403 | DB activa no contiene el patrón demo |
| `demo-password-invalida` | 401 | Password argon2 incorrecta |
| `demo-rate-limit` | 429 | Más de 3 intentos en 15 min |
| `server-error` | 500 | `DEMO_PASSWORD_HASH` no configurado u otro error inesperado |

### Audit email

Cada intento al endpoint (exitoso o fallido) dispara un correo a la dirección configurada en `DEMO_AUDIT_EMAIL` con los siguientes datos: timestamp ISO, IP origen, user-agent, GID del usuario autenticado, resultado y motivo. La password y el hash nunca se incluyen en el correo.


