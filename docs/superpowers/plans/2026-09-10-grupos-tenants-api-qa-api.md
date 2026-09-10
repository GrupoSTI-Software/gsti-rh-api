# Prueba manual API — Grupos económicos de tenants (alta y administración base)

**Problema:** El panel cuenta cada cuenta técnica como si fuera un cliente distinto. Dos cuentas hermanas que se negocian y se cobran juntas aparecen como dos renglones parejos, así que nadie que mire el tablero puede ver que una tercera parte del ingreso depende de una sola relación comercial.

**Solución:** El sistema ahora guarda la etiqueta comercial que dice qué cuentas son el mismo cliente real. Esta prueba verifica que esa etiqueta se puede crear, renombrar, desactivar y dar de baja, y que el listado la devuelve con su vigencia y sus cuentas.

Ejemplo: es como si en la tienda de la esquina tuvieras dos libretas, una para los refrescos y otra para las botanas, pero las dos fueran del mismo vecino que te paga junto cada quincena. Ahora le pones una liga a las dos libretas con su nombre para saber cuánto te debe en total, sin mezclar las cuentas.

Se prueba con un cliente de API (Postman, Insomnia, Bruno). La autenticación se asume resuelta por tu cliente: se envía el token del usuario en el header `Authorization: Bearer <token>`.

**URL base:** `http://127.0.0.1:3333`

---

**Aviso antes del primer escenario.** La base es compartida: el listado trae también los grupos que dejen otras pruebas. Reconoces los tuyos porque todos empiezan con `QA-GRP-`. Ningún escenario de este manual toca un interruptor global: no hay paso de limpieza.

**Un caso de la historia no se puede provocar aquí.** La historia pide que una cuenta dada de baja no se liste ni se cuente como integrante aunque su pertenencia siga registrada, y que al restaurarse vuelva a su grupo. Dar de baja y restaurar cuentas desde el cliente de API no es parte de esta historia, así que ese comportamiento queda fuera del recorrido. También queda declarado que, hasta que entre la historia de asignación de cuentas, todo grupo creado aquí reporta `tenantsCount: 0` y `tenants: []`: ese es el estado correcto, no un defecto.

## 1. Preparar (una sola vez)

```bash
cd gsti-rh-api
node ace db:seed --files=database/seeders/_tmp_do_not_commit_qa_seeder.ts
```

Deja listos los dos usuarios de esta prueba.

| | Correo | Contraseña | Variante |
|---|---|---|---|
| **A** | `qa-tenant-groups-admin@gsti-tests.local` | `password` | Administrador de plataforma: debe crear, leer y modificar grupos |
| **B** | `qa-tenant-groups-sin-marca@gsti-tests.local` | `password` | Sin el marcador de plataforma: debe recibir `403` |

Los identificadores que van en las rutas no se inventan: resuelve el del grupo que crees con esta consulta (usa el nombre exacto que le diste en cada escenario):

```sql
SELECT platform_tenant_group_id AS id FROM platform_tenant_groups
WHERE platform_tenant_group_name = 'QA-GRP-Manny' AND platform_tenant_group_deleted_at IS NULL;
```

## 2. Escenario 1 — Crear un grupo

Usuario: **A**.

**Endpoint:** `POST /api/platform/tenant-groups`

```json
{ "nombre": "QA-GRP-Manny" }
```

**Response — 201:**

```json
{
  "type": "success",
  "data": {
    "platformTenantGroupId": 1,
    "nombre": "QA-GRP-Manny",
    "activo": true,
    "tenantsCount": 0,
    "tenants": []
  }
}
```

Qué significa cada dato:

- `platformTenantGroupId`: el número con el que el sistema identifica a este grupo de ahora en adelante.
- `nombre`: cómo lo llama el área comercial, con lo que se lee el tablero.
- `activo`: puede valer `true` (sí, el grupo está vigente y admite cuentas nuevas) o `false` (no, está desactivado: sigue existiendo y sigue viéndose, pero ya no admite cuentas nuevas).
- `tenantsCount`: cuántas cuentas tiene hoy el grupo.
- `tenants`: la lista de cuentas del grupo, una por una.

## 3. Escenario 2 — El nombre repetido se rechaza

Usuario: **A**. Con el grupo del Escenario 1 todavía vigente.

**Endpoint:** `POST /api/platform/tenant-groups`

```json
{ "nombre": "  qa-grp-manny  " }
```

**Response — 422:**

```json
{
  "title": "No fue posible crear el grupo de tenants",
  "detail": "Ya existe un grupo de tenants registrado con ese nombre.",
  "key": "nombre-de-grupo-ya-registrado",
  "code": "PLT.GRP.NAME_TAKEN"
}
```

Qué significa lo nuevo aquí: `title` y `detail` dicen en palabras simples que ese nombre ya está ocupado por otro grupo vigente (los espacios de más y las mayúsculas no lo hacen distinto); `key` y `code` son las claves cortas del error para reportarlo. (Los datos de grupo son los ya explicados en el Escenario 1.)

Verifica que no quedó un grupo duplicado a medias: vuelve a listar ahora mismo.

**Endpoint:** `GET /api/platform/tenant-groups?incluirInactivos=true`

**Response — 200:** entre tus grupos `QA-GRP-*` aparece un solo renglón con `nombre: "QA-GRP-Manny"` (puede haber más renglones de otras pruebas, pero ninguno duplicado con ese nombre).

## 4. Escenario 3 — Renombrar y desactivar sin perder nada

Usuario: **A**. Usa el `id` resuelto con la consulta de Preparar.

**Endpoint:** `PUT /api/platform/tenant-groups/:id`

```json
{ "nombre": "QA-GRP-Manny Corporativo", "activo": false }
```

**Response — 200:**

```json
{
  "type": "success",
  "data": {
    "platformTenantGroupId": 1,
    "nombre": "QA-GRP-Manny Corporativo",
    "activo": false,
    "tenantsCount": 0,
    "tenants": []
  }
}
```

(Los datos son los ya explicados en el Escenario 1.)

**Endpoint:** `PUT /api/platform/tenant-groups/:id`

```json
{}
```

**Response — 422:**

```json
{
  "title": "Grupos de tenants de plataforma",
  "detail": "Indica al menos el nombre o la vigencia para actualizar el grupo.",
  "key": "datos-invalidos",
  "code": "PLT.GRP.VAL_INPUT"
}
```

Qué significa lo nuevo aquí: `detail` dice que no mandaste ningún cambio (ni nombre ni vigencia), así que no hay nada que guardar.

## 5. Escenario 4 — Dar de baja libera el nombre y las cuentas quedan sueltas

Usuario: **A**. Crea primero un segundo grupo para este escenario.

**Endpoint:** `POST /api/platform/tenant-groups`

```json
{ "nombre": "QA-GRP-Baja" }
```

**Response — 201:** igual al Escenario 1 con ese nombre. (Sin datos nuevos.)

**Endpoint:** `DELETE /api/platform/tenant-groups/:id` (el `id` de `QA-GRP-Baja`)

**Response — 200:**

```json
{
  "type": "success",
  "data": { "platformTenantGroupId": 2, "tenantsLiberados": 0 }
}
```

Qué significa cada dato:

- `tenantsLiberados`: cuántas cuentas quedaron sueltas al dar de baja el grupo.

**Endpoint:** `POST /api/platform/tenant-groups`

```json
{ "nombre": "QA-GRP-Baja" }
```

**Response — 201:** igual al Escenario 1 con ese nombre. (Sin datos nuevos: verifica que el nombre liberado se puede volver a usar.)

Verifica además que el grupo dado de baja ya no aparece en el listado del Escenario 6.

## 6. Escenario 5 — Lo que ya no existe responde que no existe

Usuario: **A**.

**Endpoint:** `PUT /api/platform/tenant-groups/999999`

```json
{ "nombre": "QA-GRP-Fantasma" }
```

**Response — 404:**

```json
{
  "title": "Grupos de tenants de plataforma",
  "detail": "El grupo de tenants solicitado no existe o no está disponible.",
  "key": "grupo-no-encontrado",
  "code": "PLT.GRP.NOT_FOUND"
}
```

Qué significa cada dato aquí: `title` y `detail` dicen en palabras simples que ese grupo no existe (o ya fue dado de baja, que para quien consulta es lo mismo); `key` y `code` son las claves cortas del error para reportarlo.

**Endpoint:** `DELETE /api/platform/tenant-groups/999999`

**Response — 404:** el mismo cuerpo del `PUT` anterior. (Sin datos nuevos.)

Repite el `DELETE` con el `id` del grupo que diste de baja en el Escenario 4: también responde `404` con el mismo cuerpo.

## 7. Escenario 6 — El listado trae solo los vigentes, con sus cuentas

Usuario: **A**.

**Endpoint:** `GET /api/platform/tenant-groups`

**Response — 200:**

```json
{
  "type": "success",
  "data": [
    {
      "platformTenantGroupId": 3,
      "nombre": "QA-GRP-Baja",
      "activo": true,
      "tenantsCount": 0,
      "tenants": []
    },
    { "...": "un objeto igual por cada otro grupo vigente y activo" }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "lastPage": 1 }
}
```

Qué significa lo nuevo aquí:

- `meta.total`: cuántos grupos vigentes y activos hay en total (sin el filtro de inactivos).
- `meta.page`: la página que estás viendo.
- `meta.limit`: cuántos grupos trae como máximo cada página.
- `meta.lastPage`: la última página disponible.

(Los datos de cada grupo son los ya explicados en el Escenario 1.)

Verifica que:

- Los grupos vienen ordenados por `nombre` de la A a la Z.
- El grupo dado de baja en el Escenario 4 no aparece.
- `QA-GRP-Manny Corporativo` (desactivado en el Escenario 3) **no** aparece en este listado sin filtro.

**Endpoint:** `GET /api/platform/tenant-groups?incluirInactivos=true`

**Response — 200:**

```json
{
  "type": "success",
  "data": [
    {
      "platformTenantGroupId": 3,
      "nombre": "QA-GRP-Baja",
      "activo": true,
      "tenantsCount": 0,
      "tenants": []
    },
    {
      "platformTenantGroupId": 1,
      "nombre": "QA-GRP-Manny Corporativo",
      "activo": false,
      "tenantsCount": 0,
      "tenants": []
    },
    { "...": "un objeto igual por cada otro grupo vigente" }
  ],
  "meta": { "total": 2, "page": 1, "limit": 20, "lastPage": 1 }
}
```

(Los datos de cada grupo y de `meta` son los ya explicados arriba.)

Verifica además que:

- Ningún integrante trae identificadores internos, RFC ni datos fiscales: cada uno trae solo su identificador público y su nombre.

## 8. Escenario 7 — Sin el marcador de plataforma no se ve ni se toca nada

Usuario: **B** (`qa-tenant-groups-sin-marca`).

**Endpoint:** `GET /api/platform/tenant-groups`

**Response — 403:**

```json
{
  "title": "Acceso restringido a plataforma",
  "detail": "...",
  "key": "AUTH.PLATFORM.FORBIDDEN"
}
```

Qué significa lo nuevo aquí: `title` dice en palabras simples que solo quien tiene el pase de plataforma puede acceder a estos recursos; `key` confirma que este usuario no lo tiene, así que no puede ver ni tocar los grupos y la respuesta no trae ningún grupo.

Verifica que la respuesta **no traiga campo `code`** (es una inconsistencia conocida del guard, no un defecto de esta historia) y repite con `POST`, `PUT` y `DELETE`: los cuatro responden el mismo `403`.

Y sin token, sin ningún `Authorization`:

**Response — 401** (no se valida cuerpo: es el manejo genérico de autenticación del framework, no un contrato de esta historia).

## 9. Checklist

- [ ] Escenario 1: crear `QA-GRP-Manny` responde `201`, nace vigente y con cero cuentas
- [ ] Escenario 2: repetir el nombre con espacios y minúsculas responde `422` con `PLT.GRP.NAME_TAKEN`, sin duplicado
- [ ] Escenario 3: renombrar y desactivar responde `200` conservando todo; cuerpo vacío responde `422` con `PLT.GRP.VAL_INPUT`
- [ ] Escenario 4: la baja responde `200` con `tenantsLiberados`, el nombre se puede volver a usar y las cuentas quedan intactas
- [ ] Escenario 5: id inexistente o dado de baja responde `404` con `PLT.GRP.NOT_FOUND` en `PUT` y `DELETE`
- [ ] Escenario 6: el listado trae solo vigentes ordenados por nombre, con vigencia, conteo e integrantes, y `meta` completa
- [ ] Escenario 7: sin el marcador de plataforma, los cuatro endpoints responden `403` sin campo `code`; sin token, `401`
