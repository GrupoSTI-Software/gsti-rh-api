# Prueba manual API — Reporte de asistencia sin departamento ni puesto

**Problema:** Cuando alguien pedía el reporte de asistencia de un colaborador que no tenía departamento o puesto asignado, el sistema truena y no entrega ningún archivo. Y cuando el departamento o el puesto sí tenían un nombre corto (alias) capturado, la columna salía vacía en vez de mostrarlo, aunque el dato sí existía.

**Solución:** Ahora el reporte siempre se genera, tenga o no el colaborador un departamento y un puesto asignados. Cuando sí los tiene, la columna muestra el nombre corto (alias) si la empresa lo capturó, o el nombre completo si no hay nombre corto; cuando no los tiene, la columna queda simplemente vacía, sin ningún texto que simule un dato.

Ejemplo: es como la lista de asistencia de un salón de clases — si a un alumno nuevo todavía no le asignan grupo, la lista no debe dejar de imprimirse por eso: solo esa casilla del grupo queda en blanco, en vez de tronar toda la lista o inventarle un grupo que no tiene.

Se prueba con un cliente de API (Postman, Insomnia, Bruno). La autenticación se asume resuelta por tu cliente: se envía el token del usuario en el header `Authorization: Bearer <token>`.

**URL base:** `http://127.0.0.1:3333`

**Header obligatorio en toda petición de este manual.** Además del token, cada endpoint exige el header `X-Business-Unit-Id` con el identificador público de la empresa desde la que actúa el usuario (a qué empresa le vas a pedir cosas). En Preparar están las consultas para resolverlo, una por usuario: el Usuario A y el Usuario B usan un valor distinto porque viven en empresas distintas.

El reporte se pide, se consulta su avance y se descarga en tres llamadas separadas (es asíncrono: no se entrega en la misma respuesta que lo pide). Los tres endpoints son:

| Paso | Endpoint |
|---|---|
| Pedir | `POST /api/v1/assists/reports` |
| Consultar estado | `GET /api/v1/assists/reports/:id/status` |
| Descargar | `GET /api/v1/assists/reports/:id/download` |

---

**Un dato de la historia no se puede observar tal cual en el Escenario 5.** La historia dice que la Exportación detallada de la empresa debería traer a los cuatro colaboradores de esta prueba. En el ambiente sembrado, ese reporte solo incluye colaboradores cuyo departamento y puesto siguen vigentes en el organigrama: es una regla ya existente, que esta corrección no toca ni amplía (la corrección solo cambia qué se imprime en la columna de un colaborador que SÍ aparece, nunca a quién se le arma fila). Por eso el Escenario 5 verifica a los dos colaboradores de esta prueba que sí tienen departamento y puesto vigentes, y deja anotado por qué los otros dos no aparecen en ese archivo — sin inventarles pasos.

Ningún escenario de este manual enciende una bandera global: no hay paso de limpieza.

## 1. Preparar (una sola vez)

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Deja listos los dos usuarios y los cuatro colaboradores de esta prueba.

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-reporte-estructura-supervisor@gsti-tests.local` | `password` | Supervisor de la empresa de prueba, con permiso de descarga |
| **B** | `qa-reporte-estructura-otra-empresa@gsti-tests.local` | `password` | Usuario de otra empresa, con el mismo permiso de descarga |

| Código de nómina | Nombre en el archivo | Estructura |
|---|---|---|
| `QA-EST-01` | `Estructura Uno QA` | Sin departamento y sin puesto |
| `QA-EST-02` | `Estructura Dos QA` | Con departamento y puesto dados de baja del organigrama |
| `QA-EST-03` | `Estructura Tres QA` | Con departamento y puesto con alias (nombre corto) capturado |
| `QA-EST-04` | `Estructura Cuatro QA` | Con departamento y puesto sin alias |

Los identificadores que van en las peticiones no se inventan ni se hardcodean: resuélvelos con estas consultas. Cada vez que un escenario pida `<id de QA-EST-0X, resuelto en Preparar>`, sustitúyelo por el número que te devuelva esta consulta para ese código de nómina — nunca un número inventado.

El `id` de cada colaborador (sustituye el código de nómina de la tabla de arriba):

```sql
SELECT employee_id AS id FROM employees
WHERE employee_payroll_code = 'QA-EST-01' AND employee_deleted_at IS NULL;
```

El identificador de empresa que va en el header `X-Business-Unit-Id` del **Usuario A** (la empresa de prueba, la misma de los cuatro colaboradores):

```sql
SELECT bu.business_unit_public_id AS empresaId
FROM employees e
JOIN business_units bu ON bu.business_unit_id = e.business_unit_id
WHERE e.employee_payroll_code = 'QA-EST-01' AND e.employee_deleted_at IS NULL;
```

El identificador de empresa que va en el header `X-Business-Unit-Id` del **Usuario B** (su propia empresa, distinta de la de arriba):

```sql
SELECT bu.business_unit_public_id AS empresaId
FROM business_unit_users buu
JOIN business_units bu ON bu.business_unit_id = buu.business_unit_id
JOIN users u ON u.user_id = buu.user_id
WHERE u.user_email = 'qa-reporte-estructura-otra-empresa@gsti-tests.local'
  AND buu.business_unit_user_deleted_at IS NULL;
```

Fechas de prueba: usa siempre `"date": "2026-09-01"` y `"date-end": "2026-09-14"` en los pasos que las piden. Corre el seeder cerca de la fecha en la que vayas a probar este manual: si lo corres varias semanas después, adelanta ambas fechas al mismo rango de 14 días, terminando cerca de hoy.

**Límite de peticiones.** Cada usuario solo puede pedir 10 reportes en un lapso de 10 minutos. Si repites este manual varias veces seguidas con el mismo usuario, o reintentas un escenario muchas veces, puedes agotar esa cuota: la siguiente petición de `POST /api/v1/assists/reports` responde `429` con `{"errors": [{"message": "Too many requests", "retryAfter": <segundos que faltan para volver a intentar>}]}` en vez del `202` esperado. No es un defecto: espera los segundos que indica `retryAfter` y vuelve a intentar.

**Este manual asume español.** Los encabezados de las columnas del archivo y su nombre de descarga salen en el idioma que pida el cliente. Todos los pasos de abajo se describen en español, que es el idioma con el que nace toda petición si el cliente no pide otro explícitamente. Si tu cliente pide inglés, verás encabezados y nombre de archivo distintos a los que este manual documenta.

## 2. Escenario 1 — Sin departamento ni puesto: el archivo llega y las columnas quedan vacías

Usuario: **A**. Colaborador: `QA-EST-01`.

**Endpoint:** `POST /api/v1/assists/reports`

Headers: `Authorization: Bearer <token de A>`, `X-Business-Unit-Id: <empresaId de A>`

```json
{
  "date": "2026-09-01",
  "date-end": "2026-09-14",
  "reportType": "assistance_employee",
  "employeeId": <id de QA-EST-01, resuelto en Preparar>
}
```

**Response — 202:**

```json
{
  "type": "success",
  "title": "Recurso",
  "message": "El recurso fue creado con éxito",
  "data": {
    "reportJobId": "b3f1c2b0-....-....-....-............",
    "status": "pending"
  }
}
```

Qué significa cada dato:

- `date` / `date-end`: el periodo que cubre el reporte — desde qué día y hasta qué día se buscan checadas.
- `reportType`: qué reporte se pide. En este manual puede valer `assistance_employee` (el reporte de asistencia de un solo colaborador) o `assistance_all` (la exportación con todos los colaboradores de la empresa, ver Escenario 5). El contrato admite otros dos valores (`assistance_incident_summary` y `assistance_incident_summary_payroll`, el Resumen de incidencias) que no se observan en este manual: esta historia no los cambia.
- `employeeId`: el colaborador del que se pide el reporte. Solo aplica cuando `reportType` es `assistance_employee`.
- `reportJobId`: el folio con el que vas a consultar el avance y descargar el archivo en los pasos siguientes.
- `status`: en qué momento va la generación del archivo. Puede valer `pending` (se pidió y el sistema todavía no empieza a generarlo — el valor con el que siempre nace), `processing` (el sistema lo está generando en este momento), `completed` (el archivo ya está listo para descargarse) o `failed` (el sistema no pudo generar el archivo; no se provoca en este manual, ninguno de sus escenarios produce una falla de generación).

Ahora consulta el avance con el `reportJobId` que te devolvió el paso anterior:

**Endpoint:** `GET /api/v1/assists/reports/:id/status`

**Response — 200** (repite esta consulta cada pocos segundos hasta que `status` sea `completed`; el archivo es pequeño y puede que tu primera consulta ya lo muestre así, sin pasar visiblemente por `pending` o `processing`):

```json
{
  "type": "success",
  "title": "Recurso",
  "message": "El recurso fue encontrado con éxito",
  "data": {
    "reportJobId": "b3f1c2b0-....-....-....-............",
    "status": "completed",
    "progressCurrent": 1,
    "progressTotal": 1,
    "fileName": "Reporte de asistencias.xlsx",
    "errorMessage": null,
    "completedAt": "2026-09-14T12:00:00.000-06:00",
    "expiresAt": "2026-09-15T12:00:00.000-06:00"
  }
}
```

Qué significa lo nuevo aquí:

- `progressCurrent` / `progressTotal`: cuánto lleva listo el sistema de lo que tiene que generar en total (el avance). Cuando son iguales, terminó.
- `fileName`: el nombre con el que se va a descargar el archivo. Mientras `status` no es `completed`, este dato viene vacío (`null`).
- `errorMessage`: por qué falló la generación, si es que falló. Mientras no haya falla, viene vacío (`null`).
- `completedAt`: la fecha y hora en la que terminó de generarse el archivo (aquí sale con una fecha y hora reales, no este valor fijo). Mientras no termina, viene vacío (`null`).
- `expiresAt`: hasta qué fecha y hora queda disponible para descargarse — 24 horas después de `completedAt` (aquí también con una fecha y hora reales). Mientras no termina, viene vacío (`null`).

Con el reporte ya `completed`, descárgalo:

**Endpoint:** `GET /api/v1/assists/reports/:id/download`

**Response — 200:** el archivo, con encabezado de tipo de contenido `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (un Excel) y de nombre sugerido `Reporte de asistencias.xlsx`.

Ábrelo y busca, en la hoja, el renglón cuya columna **Empleado Nombre** diga `Estructura Uno QA`. Verifica que las columnas **Departamento** y **Posición** de ese renglón están vacías — ninguna trae `"Sin departamento"`, `"Sin posición"`, `"N/A"` ni ningún otro texto de relleno. El resto del renglón (nombre, fechas, turno, checadas) viene completo.

## 3. Escenario 2 — Departamento y puesto dados de baja: mismo resultado que sin estructura

Usuario: **A**. Colaborador: `QA-EST-02`.

**Endpoint:** `POST /api/v1/assists/reports`

```json
{
  "date": "2026-09-01",
  "date-end": "2026-09-14",
  "reportType": "assistance_employee",
  "employeeId": <id de QA-EST-02, resuelto en Preparar>
}
```

**Response — 202:** igual al Escenario 1. (Los datos son los ya explicados en el Escenario 1.)

**Endpoint:** `GET /api/v1/assists/reports/:id/status` → **Response — 200:** igual al Escenario 1 una vez `completed`. (Los datos son los ya explicados en el Escenario 1.)

**Endpoint:** `GET /api/v1/assists/reports/:id/download` → **Response — 200:** mismo tipo de contenido y mismo nombre de archivo que el Escenario 1.

Qué significa lo nuevo aquí: aunque `QA-EST-02` sí tiene un departamento y un puesto asignados, esos registros fueron dados de baja del organigrama de la empresa. El sistema los trata igual que si no tuviera ninguno de los dos.

Busca en el archivo el renglón de `Estructura Dos QA` y verifica que **Departamento** y **Posición** también están vacías, sin texto de relleno — el mismo resultado del Escenario 1, ahora por una causa distinta (baja del organigrama, no ausencia de asignación).

## 4. Escenario 3 — Con alias: las columnas muestran el nombre corto

Usuario: **A**. Colaborador: `QA-EST-03`.

**Endpoint:** `POST /api/v1/assists/reports`

```json
{
  "date": "2026-09-01",
  "date-end": "2026-09-14",
  "reportType": "assistance_employee",
  "employeeId": <id de QA-EST-03, resuelto en Preparar>
}
```

**Response — 202:** igual al Escenario 1. (Los datos son los ya explicados en el Escenario 1.)

**Endpoint:** `GET /api/v1/assists/reports/:id/status` → **Response — 200:** igual al Escenario 1 una vez `completed`. (Los datos son los ya explicados en el Escenario 1.)

**Endpoint:** `GET /api/v1/assists/reports/:id/download` → **Response — 200:** mismo tipo de contenido y mismo nombre de archivo que el Escenario 1.

Qué significa lo nuevo aquí: el alias es el nombre corto que la empresa capturó para un departamento o un puesto (por ejemplo, "RRHH" en vez de "Recursos Humanos"), para usarlo donde el nombre completo no cabe o estorba. Cuando existe, es lo que debe mostrarse — no el nombre completo.

Busca en el archivo el renglón de `Estructura Tres QA` y verifica que **Departamento** dice `QA-EST-ALIAS-DEPTO` y **Posición** dice `QA-EST-ALIAS-PUESTO` — el alias, no el nombre completo del departamento ni del puesto.

## 5. Escenario 4 — Sin alias: las columnas muestran el nombre completo

Usuario: **A**. Colaborador: `QA-EST-04`.

**Endpoint:** `POST /api/v1/assists/reports`

```json
{
  "date": "2026-09-01",
  "date-end": "2026-09-14",
  "reportType": "assistance_employee",
  "employeeId": <id de QA-EST-04, resuelto en Preparar>
}
```

**Response — 202:** igual al Escenario 1. (Los datos son los ya explicados en el Escenario 1.)

**Endpoint:** `GET /api/v1/assists/reports/:id/status` → **Response — 200:** igual al Escenario 1 una vez `completed`. (Los datos son los ya explicados en el Escenario 1.)

**Endpoint:** `GET /api/v1/assists/reports/:id/download` → **Response — 200:** mismo tipo de contenido y mismo nombre de archivo que el Escenario 1. (Sin datos nuevos: este colaborador no tiene alias capturado.)

Busca en el archivo el renglón de `Estructura Cuatro QA` y verifica que **Departamento** dice `QA Departamento Estructura PLAIN` y **Posición** dice `QA Puesto Estructura PLAIN` — el nombre completo, porque este departamento y este puesto no tienen alias capturado.

## 6. Escenario 5 — Exportación detallada de la empresa: cada quien con su columna correcta

Usuario: **A**. Sin `employeeId`: este reporte no es de un colaborador, es de toda la empresa.

**Endpoint:** `POST /api/v1/assists/reports`

```json
{
  "date": "2026-09-01",
  "date-end": "2026-09-14",
  "reportType": "assistance_all"
}
```

**Response — 202:** igual al Escenario 1. (Los datos son los ya explicados en el Escenario 1.)

**Endpoint:** `GET /api/v1/assists/reports/:id/status` → **Response — 200 una vez `completed`:** parecido al Escenario 1, pero con dos diferencias — el nombre del archivo y el avance:

```json
{
  "...": "los demás datos son los ya explicados en el Escenario 1",
  "progressCurrent": 9,
  "progressTotal": 9,
  "fileName": "datos.xlsx"
}
```

Qué significa lo nuevo aquí:

- `fileName`: cambia de nombre según qué reporte pediste — aquí es `datos.xlsx` porque es la exportación de toda la empresa, no el reporte de un solo colaborador.
- `progressCurrent` / `progressTotal`: en este reporte cuentan colaboradores, no archivos. Aquí traen el número real de colaboradores que la exportación recorrió en la empresa de prueba — el `9` de arriba es solo un ejemplo, el tuyo puede salir distinto según cuántos colaboradores tenga sembrados la empresa al momento de correr el manual —, nunca `1` como en el reporte de un solo colaborador de los Escenarios 1 a 4.

**Endpoint:** `GET /api/v1/assists/reports/:id/download` → **Response — 200:** mismo tipo de contenido que el Escenario 1, con nombre sugerido `datos.xlsx`.

Abre el archivo y busca los renglones de `Estructura Tres QA` y `Estructura Cuatro QA`: cada uno debe traer su columna **Departamento** y **Posición** con el mismo valor que verificaste en los Escenarios 3 y 4 (alias uno, nombre completo el otro).

`Estructura Uno QA` (sin departamento ni puesto) y `Estructura Dos QA` (con departamento y puesto dados de baja) **no aparecen en este archivo**: como se explicó al inicio del manual, la exportación de toda la empresa solo arma renglón para colaboradores cuyo departamento y puesto siguen vigentes en el organigrama — una regla que ya existía antes de esta corrección y que esta historia no cambia. No es un defecto de este escenario ni algo que debas reportar.

## 7. Escenario 6 — Colaborador de otra empresa: responde igual que si no existiera

Usuario: **B** (`qa-reporte-estructura-otra-empresa`). Pide el reporte de `QA-EST-01`, que pertenece a la empresa del Usuario A, no a la suya.

**Endpoint:** `POST /api/v1/assists/reports`

Headers: `Authorization: Bearer <token de B>`, `X-Business-Unit-Id: <empresaId de B>` (la propia empresa de B, **no** la de A).

```json
{
  "date": "2026-09-01",
  "date-end": "2026-09-14",
  "reportType": "assistance_employee",
  "employeeId": <id de QA-EST-01, el mismo resuelto en Preparar y usado en el Escenario 1>
}
```

**Response — 400:**

```json
{
  "type": "warning",
  "title": "No se encontró Empleado",
  "message": "No se encontró Empleado con el ID ingresado",
  "data": { "key": "empleado-no-encontrado" }
}
```

Qué significa lo nuevo aquí: esta es exactamente la misma respuesta que si `employeeId` no existiera en ningún lado — el sistema no distingue entre "no existe" y "existe pero es de otra empresa", para no confirmarle a quien pregunta que ese colaborador existe en otro lado. `key` es la clave corta del error, para reportarlo si hace falta.

No hay `reportJobId`: la solicitud se rechaza antes de crear el job, así que no hay nada que consultar ni descargar, y no se genera ningún archivo.

## 8. Checklist

- [ ] Escenario 1: `QA-EST-01` (sin departamento ni puesto) — el archivo llega y las columnas Departamento y Posición quedan vacías, sin texto de relleno
- [ ] Escenario 2: `QA-EST-02` (departamento y puesto dados de baja) — mismo resultado que el Escenario 1
- [ ] Escenario 3: `QA-EST-03` (con alias) — las columnas Departamento y Posición muestran el alias
- [ ] Escenario 4: `QA-EST-04` (sin alias) — las columnas Departamento y Posición muestran el nombre completo
- [ ] Escenario 5: exportación detallada de la empresa — `QA-EST-03` y `QA-EST-04` salen con su columna correcta en el mismo archivo; `QA-EST-01` y `QA-EST-02` no aparecen (esperado, no es un defecto)
- [ ] Escenario 6: Usuario B pidiendo `QA-EST-01` — responde `400` igual que un colaborador inexistente, sin generar archivo
