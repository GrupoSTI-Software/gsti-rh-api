# Guía de implementación frontend — Certificaciones requeridas por puesto

Historia: **Asignar certificaciones requeridas a un puesto** (continuación de USRH1778472676460).

Todos los paths llevan prefijo **`/api`**. Todas las peticiones requieren **Bearer JWT**.  
Códigos de error en [`error_codes_documentation.md`](./error_codes_documentation.md) sección `PCR.*`.  
La documentación Swagger/OpenAPI vive en los JSDoc de `app/controllers/position_certification_requirement_controller.ts`.

---

## 1. Endpoints

### 1.1 `GET /api/positions/:positionId/certification-requirements`

Devuelve las certificaciones actualmente requeridas por el puesto.

**Parámetros:** `positionId` (path, entero).

**Respuesta 200:**

```json
{
  "type": "success",
  "title": "Certificaciones requeridas",
  "message": "…",
  "data": {
    "positionCertificationRequirements": [
      {
        "positionCertificationRequirementId": 1,
        "certificationId": 3,
        "certification": {
          "id": 3,
          "name": "AWS DevOps",
          "isExternal": true,
          "externalUrl": "https://aws.amazon.com/…",
          "renewalPeriodDays": 365,
          "category": {
            "id": 3,
            "key": "tecnico",
            "name": "Técnico"
          }
        }
      }
    ]
  }
}
```

### 1.2 `POST /api/positions/:positionId/certification-requirements`

Agrega una o varias certificaciones requeridas en una sola llamada.

**Body JSON:**

| Campo              | Tipo       | Regla                                        |
|--------------------|-----------|----------------------------------------------|
| `certificationIds` | `number[]` | Obligatorio, mínimo 1 elemento, enteros > 0. |

**Respuesta 201:** `data.positionCertificationRequirements[]` con la misma forma que el GET.

**Errores posibles:** ver tabla de la sección 3.

### 1.3 `DELETE /api/positions/:positionId/certification-requirements/:certificationId`

Quita (soft delete) la certificación del puesto. **No borra cumplimientos de empleados.**

**Respuesta 204:** Sin cuerpo.

---

## 2. Filtro silencioso de certificaciones compatibles (selector del modal)

Al abrir el selector de "Agregar certificaciones", el frontend debe mostrar solo las certificaciones aplicables al puesto.  
El catálogo completo viene de `GET /api/certifications` (historia anterior).

**Regla de filtrado client-side:**
- Si la certificación tiene `appliesToAllBusinessUnits: true` → siempre incluir.
- Si tiene `businessUnits[]` con elementos → incluir solo si la `businessUnitId` del puesto está en ese arreglo.

El backend también lo valida (responde 422 si no aplica), pero el filtro silencioso en el selector evita que el usuario vea opciones que siempre van a fallar.

Para obtener la unidad de negocio del puesto, leerla de los datos que ya cargaste del puesto (`businessUnitId`).

---

## 3. Tabla de errores (`errorCode`)

| HTTP | Código             | Cuándo                                                       | Campo extra        |
|------|--------------------|--------------------------------------------------------------|--------------------|
| 400  | `PCR.VAL.001`      | Vine / ID inválido                                           | —                  |
| 404  | `PCR.NF.POS.001`   | `positionId` no existe o está dado de baja                   | —                  |
| 404  | `PCR.NF.CERT.001`  | `certificationId` no existe en el catálogo                   | —                  |
| 404  | `PCR.NF.REQ.001`   | Relación no existe al intentar eliminar                      | —                  |
| 409  | `PCR.CONF.001`     | Certificación ya asignada al puesto                          | `key`, `detail`    |
| 422  | `PCR.UNAP.001`     | Certificación acotada a otra unidad de negocio               | `key`, `detail`    |
| 500  | `PCR.SYS.001`      | Error no tipado                                              | —                  |

### Cuerpo 409

```json
{
  "type": "error",
  "title": "Certificación duplicada en puesto",
  "key": "certificacion-ya-asignada",
  "detail": "Esta certificación ya está asignada al puesto.",
  "message": "Esta certificación ya está asignada al puesto.",
  "errorCode": "PCR.CONF.001",
  "data": null
}
```

### Cuerpo 422

```json
{
  "type": "error",
  "title": "Certificación no aplicable",
  "key": "certificacion-no-aplicable",
  "detail": "Esta certificación está acotada a unidades de negocio distintas a la del puesto.",
  "message": "Esta certificación está acotada a unidades de negocio distintas a la del puesto.",
  "errorCode": "PCR.UNAP.001",
  "data": null
}
```

---

## 4. Componentes BO sugeridos

| Componente                                         | Responsabilidad                                              |
|----------------------------------------------------|--------------------------------------------------------------|
| `positionCertificationRequirementsModal/index.vue` | Modal principal: título, botón agregar, estados             |
| `positionCertificationRequirements/index.vue`      | Lista de tarjetas de requerimientos ya asignados            |
| `positionCertificationRequirementInfoCard/index.vue` | Tarjeta individual: nombre, categoría badge, externa icono, link, periodicidad, botón Quitar |
| `positionCertificationRequirementInfoForm/index.vue` | Selector múltiple con filtro por categoría y buscador; carga `GET /api/certifications` filtrado por BU del puesto |

**Botón/tab de acceso:** agregar en el componente de detalle del puesto del organigrama (probable `positionInfoFormIndex` o contenedor del drawer) un botón `Certificaciones requeridas` que abre el modal.

---

## 5. Flujo del modal — estados

| Estado  | Qué mostrar                                                                              |
|---------|------------------------------------------------------------------------------------------|
| loading | Skeleton / spinner en la lista de asignadas                                              |
| empty   | `"Este puesto aún no tiene certificaciones requeridas. Agrega la primera."` + botón CTA |
| default | Lista de `PositionCertificationRequirementInfoCard`                                      |
| error   | Mensaje del `message` del API + botón "Reintentar"                                       |

Al pulsar **Quitar** en una card: mostrar modal de confirmación antes del `DELETE`.  
Al pulsar **Guardar** en el formulario: llamar `POST` con el array de IDs seleccionados, actualizar la lista.

---

## 6. Claves i18n sugeridas

Agregar bajo `positions.required_certifications.*` en `es.json` y `en.json`:

| Clave                                                   | ES                                              | EN                                      |
|---------------------------------------------------------|-------------------------------------------------|-----------------------------------------|
| `positions.required_certifications.title`               | Certificaciones requeridas del puesto {name}    | Required certifications for {name}      |
| `positions.required_certifications.add`                 | Agregar certificaciones                         | Add certifications                      |
| `positions.required_certifications.empty`               | Este puesto aún no tiene certificaciones requeridas. Agrega la primera. | No required certifications yet. Add the first one. |
| `positions.required_certifications.remove`              | Quitar                                          | Remove                                  |
| `positions.required_certifications.confirm_remove`      | ¿Quitar esta certificación del puesto?          | Remove this certification from the position? |
| `positions.required_certifications.filter.category`     | Categoría                                       | Category                                |
| `positions.required_certifications.filter.all`          | Todas                                           | All                                     |
| `positions.required_certifications.errors.duplicate`    | Esta certificación ya está asignada al puesto.  | This certification is already assigned. |
| `positions.required_certifications.errors.not_applicable` | Esta certificación no aplica para la unidad de negocio del puesto. | This certification does not apply to the position's business unit. |

---

## 7. Checklist integración

- [ ] Conectar `composables/usePositionCertificationRequirements.ts` con los 3 endpoints.
- [ ] Filtrar certificaciones del catálogo por `businessUnitId` del puesto antes de mostrarlas en el selector.
- [ ] Mapear `errorCode === 'PCR.CONF.001'` al mensaje de duplicado en el formulario.
- [ ] Mapear `errorCode === 'PCR.UNAP.001'` al mensaje de no-aplicable.
- [ ] Confirmación antes de `DELETE`.
- [ ] i18n cubierto en `es` y `en`.
- [ ] Botón/tab "Certificaciones requeridas" visible en el detalle de puesto del organigrama.
