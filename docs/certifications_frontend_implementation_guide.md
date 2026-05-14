# Guía de implementación frontend — Catálogo de certificaciones (valanserh-bo)

Documento pensado para el equipo de frontend (Vue/Nuxt) que consumirá estos endpoints desde `valanserh-bo`. Todos los path llevan prefijo **`/api`**. Todas las peticiones requieren **Bearer JWT** (misma autenticación que el resto de Valanserh).

La documentación OpenAPI/Swagger se mantiene en los **comentarios JSDoc del controlador** `app/controllers/certifications_controller.ts` (agregación vía `adonisjs-6-swagger`). Los códigos de error están detallados en [`error_codes_documentation.md`](./error_codes_documentation.md).

---

## 1. Endpoints

### 1.1 `GET /api/certification-categories`

Solo lectura. Lista categorías **activas** ordenadas por `displayOrder`.

**Respuesta 200** (envuelta como el resto de la API estándar; el payload útil llega según `StandardResponseFormatter`):

```json
{
  "type": "success",
  "title": "Certification Categories",
  "message": "…",
  "data": {
    "certificationCategories": [
      {
        "id": 1,
        "key": "seguridad",
        "name": "Seguridad",
        "displayOrder": 1,
        "isActive": true
      }
    ]
  }
}
```

### 1.2 `GET /api/certifications`

Listado paginado.

**Query (opcional):**

| Parámetro | Descripción                                   | Default |
|----------|------------------------------------------------|---------|
| `page`   | Número de página (`>= 1`)                      | `1`     |
| `limit`  | Tamaño de página (`1–500`; el servidor trunca)| `25`    |

**Respuesta 200:** Objeto tipo paginador Lucid en `data.certifications`:

- `meta`: `total`, `perPage`, `currentPage`, `lastPage`, etc.
- `data`: arreglo de certificaciones con la forma del contrato (ver abajo).

**Forma de cada ítem en `data[]`:**

| Campo JSON                    | Significado                                                                                                                                 |
|------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| `id`                         | ID numérico (`certificationId`)                                                                                                            |
| `name`                       | Nombre                                                                                                                                     |
| `category`                   | Objeto `{ id, key, name, displayOrder, isActive }` o `null` si no cargó relación (no debería ocurrir)                                       |
| `isExternal`                 | Si la certificación es externa (boolean)                                                                                                      |
| `externalUrl`                | URL o `null`                                                                                                                               |
| `renewalPeriodDays`          | Días hasta renovación, o `null` si no requiere                                                                                              |
| `businessUnits`              | `{ id, name, slug }[]` vacío si **no hay pivote** (aplica a todas)                                                                          |
| `appliesToAllBusinessUnits`  | `true` cuando `businessUnits.length === 0` (mensaje UX: “Todas”)                                                                            |

### 1.3 `POST /api/certifications`

**Cuerpo JSON:**

| Campo                | Regla                                                                                          |
|---------------------|-------------------------------------------------------------------------------------------------|
| `name`              | Obligatorio, 3–200 caracteres, sin comillas/punto y coma ni secuencias `--`, `/*`, `*/`.    |
| `categoryId`        | Entero positivo; categoría **activa**.                                                       |
| `isExternal`        | Obligatorio, tipo boolean                                                                     |
| `externalUrl`       | Opcional, `null` o string hasta 2048. Si viene valor: URL **HTTP/HTTPS válida**. Si `isExternal === false`, el servidor fuerza `null`. |
| `renewalPeriodDays` | Opcional, entero positivo o `null` (vacío ⇒ sin renovación).                                  |
| `businessUnitIds`   | Opcional, array de enteros positivos. **Ausente u omitido ⇒ aplica a todas las UU.NN.**        |

**201:** Misma forma de objeto que un elemento de lista, bajo la clave `data.certification` (singular).

### 1.4 `PUT /api/certifications/:id`

Mismo cuerpo que POST. `:id` entero (**no** debe ser texto no numérica).

**200:** Payload en `data.certification`.

### 1.5 `DELETE /api/certifications/:id`

**204:** Sin cuerpo.

**Errores:** Ver sección de códigos; 404 si el id no existe.

---

## 2. Validaciones (resumen cliente)

Implementar mismas reglas UX que backend para mejor experiencia:

- **Nombre**: 3–200, trim; bloquear `'` `"` `;` `--` `/*` `*/`.
- **URL**: solo si tiene texto, validar protocolo **http/https** antes de enviar (`new URL(...)`) y mensaje esperado si falla: *«El link debe ser una URL válida con protocolo http o https.»*.
- **Duplicado nombre + categoría**: no distinguir mayúsculas ni espacios extremos/normalizar espacios dobles igual que servidor (opcional UX; servidor domina).

---

## 3. Respuestas de error (HTTP + `errorCode`)

El cliente debe priorizar **`errorCode`** frente al texto cuando exista (`StandardResponseFormatter.error` incluye string `CERT.*` aparte del `message`). El **409** de duplicado devuelve cuerpo enriquecido (ver siguiente sección).

| HTTP | Escenario habitual                           | Campo estable      | Mensajes típicos (español)                                                               |
|------|---------------------------------------------|--------------------|------------------------------------------------------------------------------------------|
| 400  | Vine / negocio (URL mal formada en servidor)| `CERT.VAL.001`     | Primer mensaje de validación; URL inválida con texto pactado anterior.                   |
| 404  | Categoría inactiva/inexistente              | `CERT.NF.CAT.001`  | *«La categoría… no existe o está inactiva.»*                                            |
| 404  | Business unit inválida o inactiva / baja | `CERT.NF.BU.001`   | *«Una o más unidades de negocio son inválidas o no están activas.»*                     |
| 404  | Certificación inexistente (PUT/DELETE)     | `CERT.NF.PSS.001`  | *«La certificación no existe.»*                                                         |
| 409  | Nombre duplicado en categoría              | `CERT.PSS.CONF.001`| Ver cuerpo extendido abajo.                                                              |
| 500  | No tipado / interno                        | `CERT.SYS.001`     | Mensaje genérico; revisar logs.                                                          |

### 3.1 Cuerpo `409` — `certificacion-duplicada`

```json
{
  "type": "error",
  "title": "Certificación duplicada",
  "key": "certificacion-duplicada",
  "detail": "Esta certificación ya existe en la categoría seleccionada.",
  "message": "Esta certificación ya existe en la categoría seleccionada.",
  "errorCode": "CERT.PSS.CONF.001",
  "data": null
}
```

El BO puede mapear `key === 'certificacion-duplicada'` o `errorCode === 'CERT.PSS.CONF.001'` al copy de aceptación.

---

## 4. Integración con unidades de negocio

- Consumir `GET /api/business-units` (existente) para armar el multi-select del modal.
- Enviar `businessUnitIds: []` o **omitir** el campo para “aplicar a todas”.
- La lista usa `appliesToAllBusinessUnits` y columnas de chips según story.

---

## 5. i18n sugerido (claves)

Sincronizar con `locales/es.json` y `locales/en.json` en el BO (valores orientativos):

| Clave sugerida                         | ES                              | EN                                   |
|----------------------------------------|---------------------------------|--------------------------------------|
| `certifications.title`                 | Catálogo de certificaciones     | Certification catalog                |
| `certifications.add`                   | Agregar certificación           | Add certification                    |
| `certifications.addFirst`              | Agregar la primera              | Add the first one                    |
| `certifications.empty`                 | Aún no hay certificaciones…     | There are no certifications yet…       |
| `certifications.columns.name`          | Nombre                          | Name                                 |
| `certifications.periodicityDays`       | Cada {{n}} días                 | Every {{n}} days                     |
| `certifications.noRenewal`           | Sin renovación                  | No renewal                           |
| `certifications.allBusinessUnits`      | Todas                           | All                                  |
| `certifications.errors.duplicate`      | (texto 409)                     | Same as API `detail` in EN if needed |

---

## 6. Checklist BO

- [ ] Entrada de menú en `layouts/default.vue` (permiso admin RH existente).
- [ ] Página `pages/certifications/index.vue` con tabla / tarjetas responsive.
- [ ] `CertificationFormModal` con multi-select inline de UU.NN.
- [ ] `DeleteCertificationModal` con confirmación.
- [ ] Composable `use-certifications.ts` + `use-business-units.ts` si no existe.
- [ ] Estados loading / empty / error / retry.
