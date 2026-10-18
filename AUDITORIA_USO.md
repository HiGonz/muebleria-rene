# AUDITORÍA DE USO REAL — Mueblería René

> Fecha: 2026-10-16 · Modo: solo lectura (código + BD local `backend/database/database.sqlite`). No se levantó la app; el recorrido se simuló leyendo rutas, controladores, migraciones, seeders, stores y pantallas.
> Alcance: `backend/` (Laravel 11 + Sanctum), `frontend/` (Next.js + Zustand + react-three-fiber). Se ignoró `backend/.worktrees/` (copias de ramas).

## 0. Lo que entendí del sistema (10 líneas)

1. **Stack:** Laravel + Sanctum (API) con SQLite local / Postgres+S3 en Railway; Next.js (App Router) + Zustand + Three.js en el front.
2. **Producto real:** un **diseñador 3D / cotizador de cocinas y clósets** (`/kitchen`, `/closet`), no un ERP de taller. Calcula material (hojas, cortes, herrajes) desde los módulos dibujados.
3. **Roles:** `admin`, `seller`, `taller` (gates en `AppServiceProvider`). Sin permisos más finos.
4. **Entidad central:** `kitchen_projects` (cliente = 2 columnas de texto en el proyecto) + `kitchen_modules` (JSON de opciones).
5. **Estados del proyecto:** Borrador → En diseño → Cotizado → Aprobado → En producción → Entregado (`KitchenProjectStateMachine`), con historial (`kitchen_project_status_history`) y notificaciones a taller/vendedor.
6. **Dos cotizaciones:** `kitchen_quotes` (interna: material + 30 % mano de obra + 20 % utilidad, folio `KIT-00001`) y `kitchen_client_quotes` (versiones de monto escrito a mano + “incluye” + notas).
7. **Salidas:** PDF (html2canvas) del reporte, enlace público de solo lectura `/viewer/{token}`, imagen de preview (og:image) y “AI preview” subida a mano.
8. **Catálogo:** `materials` (con `stock` manual) y `finishes`; solo admin.
9. **Legado:** módulo viejo `projects/quotes/project_materials` (+ `/dashboard/stats`, `/quotes`) sigue vivo y alimenta el dashboard.
10. **Datos reales en BD local:** 3 usuarios demo, 31 proyectos (casi todos “Cocina nueva” en Borrador), **0 cotizaciones internas, 0 cotizaciones al cliente**, 28 materiales con stock casi todo en 0.

---

## 1. Resumen ejecutivo

**Veredicto:** el sistema es un **muy buen diseñador/cotizador de producto**, pero **todavía no es un sistema para operar la mueblería**. Cubre bien “dibujar la cocina y calcular material”; casi no cubre “cobrar, comprar, fabricar y entregar”. Hoy el dueño seguiría usando Excel/libreta/WhatsApp para todo lo que ocurre después de que el cliente dice “sí”.

Qué tan listo está (estimación honesta): **Diseño y cotización 70 %**, **Venta/CRM 15 %**, **Pagos 0 %**, **Producción 15 %**, **Inventario/compras 5 %**, **Dueño/KPIs 5 %**, **Postventa 0 %**.

**Los 5 problemas más graves**

1. **Vendedor y taller no pueden leer el catálogo (403).** `GET /materials` y `/finishes` están bajo `manage-catalog` (solo admin), pero el builder los llama (`useKitchenStore.loadMaterialCosts`) y el `catch` es silencioso → el vendedor cotiza con **precios hardcodeados de respaldo**, no con los del catálogo, y la lista de herrajes sale vacía. Los tests lo fijan como “correcto” (`CatalogAndOldProjectRoleAccessTest`). *(Alta confianza por lectura de código; confirmar entrando como `seller@demo.com`.)*
2. **No existe dinero:** ni anticipos, abonos, saldo, método de pago ni recibos. No se sabe quién debe qué.
3. **Dashboard ciego:** `DashboardController` lee las tablas **legadas** (`Project`, `Quote`), no `kitchen_projects`. Con la operación real, “Proyectos activos”, “Ventas estimadas” y “Material más usado” muestran 0/“Sin datos”.
4. **Cotización interna inservible y sin integridad:** la BD tiene **0 `kitchen_quotes`**; el porcentaje de mano de obra/utilidad está fijo en 30/20 en código; el endpoint `quote` **confía en los totales que manda el navegador**, fuerza el estado a “Cotizado” desde **cualquier** estado (incluso “En producción”) y sin registrar historial.
5. **Producción sin proceso:** el taller solo ve el proyecto y puede marcarlo “Entregado”. No hay etapas (corte/armado/barniz/QA), fecha compromiso, prioridad, fotos, incidencias, retrabajos, ni congelamiento de diseño: **el vendedor puede cambiar medidas en un proyecto “En producción” y el taller no se entera**.

Otros graves: no hay cancelación/rechazo (un proyecto Aprobado no se puede borrar), no hay cliente como entidad, no hay folio de pedido/orden de producción, no hay bitácora de cambios del diseño.

---

## 2. Recorrido narrado por persona

### 2.1 Dueño del taller (admin)

> “Llego, abro el sistema. Quiero saber **cómo voy** sin preguntarle a nadie. Dashboard… ‘Proyectos activos: 0’. ¿Cero? Si tengo como 12 cocinas en el taller. *Achis*: esto lee los viejos ‘projects’, no las cocinas.”

> “Ok, voy a **Proyectos**. Hay un Kanban con las 6 columnas. Eso sí me gusta: veo qué está en diseño, cotizado, en producción. ¿Pero **atrasados**? No hay fecha de entrega, así que nada puede estar ‘atrasado’. ¿**Por cobrar**? No hay pagos. ¿**Utilidad por pedido**? La cotización interna calcula 20 % fijo, pero nunca se guardó (0 registros) y no hay costo real, así que no sé la utilidad real. ¿**Qué vendedor vende más**? Cada proyecto tiene `user_id` pero ningún reporte lo agrega.”

> “Quiero **autorizar un descuento**. ¿Dónde? La cotización al cliente es un monto escrito a mano: el vendedor pone el número que quiera y no hay aprobación ni se ve contra el costo. *Ah sí*, la versión queda guardada (`kitchen_client_quotes` es append-only, eso está bien), pero no sé si el 15 % de descuento lo autoricé yo.”

> “Cliente cancela. Muevo el proyecto… no hay ‘Cancelado’. Como admin puedo arrastrarlo a ‘Borrador’ y borrarlo — y con eso **desaparece el registro de que hubo un anticipo y trabajo hecho**. ¿Y ahora qué sigue?”

> “**Trazabilidad:** el historial de estados dice quién movió qué y cuándo (bien). Pero quién cambió una medida, un precio de herraje (`hardware_price_overrides`) o el monto de una cotización… eso no queda. Y el catálogo: si subo la melamina de 210 a 260, ¿se reprecian cotizaciones viejas? No hay snapshot de precios: el costo se recalcula en el navegador cada vez.”

> “Usuarios: puedo crear/desactivar. No puedo ver quién entró ni cuándo. Contraseñas demo `admin@demo.com / password` están en el seeder — *ojo* si se corrió en producción.”

### 2.2 Vendedor / empleado

> “Entra un cliente al mostrador. Creo proyecto: nombre del cliente y teléfono, sí. ¿Correo? ¿Dirección de instalación? ¿Cómo se enteró? No hay. ¿Y si el mismo cliente regresa por un clóset? Lo capturo **otra vez**, porque el cliente es texto dentro del proyecto. *Achis*.”

> “Levanto requerimiento: dibujo cuarto, ventanas, módulos, material, acabado (esto está padrísimo). Pero **fotos del lugar, croquis de medidas del cliente, referencias de Pinterest**… no hay adjuntos. Solo hay `notes` de 1,000 caracteres.”

> “Voy a **cotizar**. Primero: el catálogo me da 403 y el builder sigue funcionando con precios de respaldo — no sé si el 210 que veo es el de hoy. Segundo: el panel me muestra material + 30 % mano de obra + 20 % utilidad, fijo; no puedo ajustar el margen por cliente (¿y si es urgente? ¿si es instalación foránea? ¿flete? ¿instalación?). Tercero: para el **cliente** tengo que **escribir a mano el monto** en la ventana de cotización. *Ah sí, aquí está el dato*, pero no se vincula con el cálculo, así que puedo cotizar por debajo del costo sin enterarme.”

> “Mando la cotización: hay PDF (html2canvas, imagen rasterizada → no seleccionable, pesado) y enlace público con 3D. No hay botón ‘enviar por WhatsApp’ ni correo; copio el link y lo pego a mano. Tampoco queda registro de **cuándo/qué le envié** ni recordatorio de seguimiento. El enlace no caduca.”

> “El cliente aprueba. Quiero marcar **Aprobado**… no puedo: solo admin. Tengo que ir a decirle al dueño. Cobro el anticipo en efectivo… **no hay dónde registrarlo**; lo apunto en la libreta. Pido que lo muevan a ‘En producción’… también solo admin.”

> “Cliente llama: ‘¿cómo va mi cocina?’. Veo el estado (‘En producción’) y nada más: sin porcentaje, sin etapa, sin fecha estimada. Le tengo que hablar al taller por WhatsApp. Cuando entregan, me llega una notificación in-app (solo si tengo abierto el sistema; no hay push/WhatsApp/correo).”

> “Cliente cambia medidas a media fabricación. Edito el proyecto — **el sistema me deja** (no hay candado por estado), y el taller no recibe aviso ni ve qué cambió. ¿Y la cotización? Se queda con el monto viejo; no hay ‘versión de diseño’.”

> “Quiero encontrar al cliente de la semana pasada: hay búsqueda difusa por proyecto/cliente (bien). Pero no hay filtro por estado/vendedor/fecha de entrega desde el backend.”

### 2.3 Taller (manufactura)

> “Me llega la notificación ‘Proyecto en producción’. Abro la tablet. Solo veo proyectos en ‘En producción’/‘Entregado’ (bien) y no veo precios (bien). Hay lista de módulos con dimensiones y opciones, vista 3D y lista de cortes. Eso me sirve.”

> “Pero… ¿**fecha compromiso**? No hay. ¿**Prioridad/urgente**? No. ¿**Qué le prometieron al cliente** (notas del vendedor)? Veo `notes`, pero si el vendedor la cambió ayer no me avisaron. ¿**Dirección de instalación**? Tampoco. ¿**Qué herrajes necesito comprar**? Veo cantidades pero **no si hay stock**: el stock del catálogo es un número que nadie descuenta (casi todo está en 0) y ni siquiera puedo leer el catálogo (403).”

> “Terminé el corte, ya armé, ya lijé… *achis*, ¿**dónde marco que está listo**? Solo existe un botón: ‘Entregado’. Y eso es lo último, no ‘terminado en taller’. No puedo marcar etapas, subir foto del mueble terminado, ni reportar ‘la tapa salió mal, rehago’. Todo por WhatsApp.”

> “Hasta ‘Entregado’ yo mismo lo marco: el taller decide cuándo se entrega, sin confirmación del vendedor ni cobro de saldo. Y no hay ‘Terminado/Listo para entrega’ para avisarle al cliente.”

> “Uso tablet con guantes: el Kanban requiere arrastrar; el 3D es pesado. No vi vistas pensadas para taller (lista de cortes imprimible por orden, etiquetas por pieza).”

---

## 3. Flujo maestro: ¿existe en el sistema?

| Paso | ¿Existe? | Dónde | Falta / se hace fuera |
|---|---|---|---|
| Cliente nuevo | Parcial | `kitchen_projects.client_name/client_phone` | No hay entidad Cliente, ni correo/dirección/origen |
| Requerimiento | Parcial | Builder 3D, `notes` | Fotos/croquis/referencias, fecha deseada, presupuesto del cliente |
| Cotización (materiales + MO + margen) | Parcial | `calculateKitchenMaterials` (front), `kitchen_quotes` | % fijo 30/20, no persistido, sin flete/instalación/IVA, sin snapshot de precios |
| Envío al cliente | Parcial | PDF, link `/viewer/{token}` | Sin WhatsApp/correo, sin registro de envío, link sin caducidad |
| Aprobación / ajustes | Parcial | Estado “Aprobado” (solo admin), versiones `kitchen_client_quotes` | Sin evidencia de aprobación (quién/cuándo/firma), sin versión de diseño |
| Anticipo | **No** | — | Libreta |
| Orden de producción | **No como entidad** | Proyecto “En producción” | Sin folio OP, fecha compromiso, prioridad |
| Compra/apartado de material | **No** | `materials.stock` manual | Sin explosión de materiales vs. stock, sin proveedores/OC |
| Fabricación por etapas | **No** | — | Excel/WhatsApp |
| Control de calidad | **No** | — | — |
| Aviso al cliente | **No** | Notificación interna solo a usuarios | WhatsApp manual |
| Entrega / instalación | Parcial | Estado “Entregado” | Sin fecha agendada, sin nota de entrega/firma, sin fotos |
| Cobro de saldo | **No** | — | Libreta |
| Garantía / postventa | **No** | — | — |
| Cancelación | **No** | borrar si estado ≤ Cotizado | Sin estado Cancelado, sin motivo |
| Cambio de medidas en producción | **Sin control** | `update`/`syncModules` sin candado | Sin congelamiento ni aviso |
| Pago parcial / retraso proveedor / rechazo en entrega / urgente | **No** | — | — |

---

## 4. Tabla de hallazgos

Impacto: **B**loqueante · **A**lto · **M**edio · **Ba**jo

| ID | Persona | Paso | Problema | Evidencia | Imp. | Propuesta |
|---|---|---|---|---|---|---|
| H-01 | Vendedor/Taller | Cotizar | Catálogo (`/materials`, `/finishes`) restringido a admin pero el builder los carga; fallo silencioso → precios de respaldo, sin herrajes | `routes/api.php` (`manage-catalog`), `useKitchenStore.loadMaterialCosts` (`catch {}`), test `test_seller_cannot_list_materials` | **B** | Endpoint de lectura del catálogo (sin stock/costo si se desea) para seller/taller; mostrar error visible si falla |
| H-02 | Dueño/Vendedor | Anticipo/saldo | No existe ninguna tabla/pantalla de pagos | Sin migración de pagos | **B** | Entidad `payments` + saldo por pedido (§5) |
| H-03 | Dueño | KPIs | Dashboard usa tablas legadas, no cocinas/clósets | `DashboardController` (`Project`, `Quote`), `projects` = 1 fila | **B** | Reescribir sobre `kitchen_projects` + pagos |
| H-04 | Vendedor | Cotizar | `quote()` acepta totales del cliente sin recalcular y no valida estado | `KitchenProjectController::quote` | **A** | Recalcular en servidor o guardar snapshot firmado; validar estado |
| H-05 | Vendedor | Cotizar | `quote()` fija `status='Cotizado'` desde cualquier estado (puede “des-producir” un pedido), sin historial ni state machine | misma función | **A** | Pasar por `KitchenProjectStateMachine` + historial |
| H-06 | Todos | Cotizar | 0 cotizaciones internas en BD; el flujo interno no se usa; margen 30/20 fijo en código | `kitchen_quotes`=0; `kitchenData.ts` L3475 | **A** | Unificar en una sola cotización con versiones y márgenes configurables |
| H-07 | Vendedor | Cotizar | Monto al cliente es texto libre, desligado del costo; sin alerta de margen/descuento | `kitchen_client_quotes.amount` | **A** | Mostrar costo y margen al emitir; descuento > X % requiere admin |
| H-08 | Vendedor | Aprobación | Solo admin aprueba y pasa a producción; el vendedor depende del dueño para avanzar | `ROLE_TRANSITIONS` | **A** | Aprobar (con anticipo registrado) por vendedor; pasar a producción por regla |
| H-09 | Taller | Fabricación | Sin etapas, solo “Entregado”; taller entrega sin confirmación de cobro | `ROLE_TRANSITIONS['taller']` | **B** | Entidad `production_orders` con etapas y estados (§5) |
| H-10 | Taller | Fabricación | Sin fecha compromiso, prioridad ni dirección/instalación | `kitchen_projects` sin esos campos | **B** | Campos nuevos (§4 datos) |
| H-11 | Taller/Vendedor | Cambio de medidas | Se puede editar/sincronizar módulos en cualquier estado; taller no se entera | `update`, `syncModules` (sin chequeo de estado) | **A** | Candado desde “Aprobado”; cambios vía “orden de cambio” con aviso y versión |
| H-12 | Dueño | Cancelación | No hay Cancelado/Rechazado ni motivo; Aprobado+ no se puede borrar, y admin puede regresar a Borrador y borrar | `UNDELETABLE_STATUSES`, admin free transitions | **A** | Estado `Cancelado` con motivo; prohibir borrado de proyectos con pagos |
| H-13 | Dueño | Auditoría | Solo hay historial de estados; no de precios, medidas, overrides, montos | `kitchen_project_status_history` únicamente | **A** | Tabla `audit_log` (user, entidad, campo, antes/después) |
| H-14 | Vendedor | Cliente | Cliente no es entidad (nombre/teléfono en cada proyecto); sin correo, dirección, RFC | `kitchen_projects.client_*` | **A** | Tabla `customers` |
| H-15 | Vendedor | Requerimiento | Sin adjuntos del cliente (fotos del espacio, croquis, referencias) | Solo S3 para preview/AI | **A** | Tabla `attachments` polimórfica |
| H-16 | Vendedor | Envío | Sin envío por WhatsApp/correo ni registro de envío/seguimiento; PDF es imagen rasterizada | `exportKitchenPDF.ts` (html2canvas), `ShareModal` | **M** | Botón “enviar por WhatsApp” (wa.me), `sent_at`, recordatorios; PDF vectorial |
| H-17 | Vendedor | Envío | Link público sin caducidad, sin PIN; expone monto y 3D | `PublicKitchenShareController`, `kitchen_project_shares` | **M** | Expiración opcional, ocultar monto configurable |
| H-18 | Dueño | Folios | Sin folio de pedido/OP; folio de cotización `KIT-<id>` (un solo folio por proyecto, sin versión), clósets también usan `KIT` | `quote()` folio | **M** | Folios consecutivos por tipo: `COT-`, `PED-`, `OP-` con versión |
| H-19 | Taller/Dueño | Inventario | `stock` manual, no se descuenta, casi todo 0; sin mínimos ni alertas ni faltantes por proyecto | `materials.stock`, MaterialSeeder | **A** | Movimientos de inventario + explosión de materiales vs stock |
| H-20 | Dueño | Compras | Sin proveedores, órdenes de compra ni fecha de llegada | — | **A** | `suppliers`, `purchase_orders` (Fase 2) |
| H-21 | Dueño | Costos | Sin costo real vs. estimado; sin mano de obra por horas; sin IVA/flete/instalación | `kitchenData.ts` | **M** | Costeo real por pedido |
| H-22 | Taller | Entrega | Sin nota de entrega/firma/fotos, sin reporte de rechazo ni retrabajo | — | **A** | `delivery_notes`, `rework_issues` |
| H-23 | Todos | Notificaciones | Solo in-app (campana); sin aviso al cambiar cotización/medidas/pago ni al cliente | `ProjectStatusNotifier` (solo producción/entregado) | **M** | Ampliar eventos; canal WhatsApp/correo |
| H-24 | Todos | Postventa | Sin garantía ni tickets de servicio | — | **M** | `warranty_claims` (Fase 3) |
| H-25 | Backend | Integridad | `quote`, `syncModules`, `createShare`, `uploadPreview` no llaman `assertVisible`; seller/admin ven todo, pero `assertVisible` no valida rol de taller en rutas de escritura (protegido por gate) — riesgo latente si cambian roles | `routes/api.php` + controlador | **Ba** | Policies por modelo |
| H-26 | Backend | Integridad | `kitchen_modules.options` y torres son JSON sin esquema; `towers` etc. dentro del proyecto; sin versión | migraciones | **M** | Versionar esquema; tabla de snapshot al aprobar |
| H-27 | Backend | Integridad | `syncModules` borra y recrea todos los módulos (cambian IDs; sin concurrencia/versión) → dos editores se pisan | `syncModules` | **M** | `updated_at`/lock optimista |
| H-28 | Backend | Integridad | `kitchen_projects.user_id` con `cascadeOnDelete`; `kitchen_quotes.status` y `kitchen_client_quotes` sin estado | migraciones | **Ba** | Restringir cascadas; estados en cotización |
| H-29 | Seguridad | Auth | Credenciales demo en seeder (`password`); sin rate limit en `/login`; token Sanctum sin expiración | `DemoUserSeeder`, `routes/api.php` | **A** | No sembrar demo en prod; `throttle` en login; expirar tokens |
| H-30 | Seguridad | Preview | S3 público por `kitchen-previews/{id}.jpg` (id secuencial adivinable) | `uploadPreview` | **M** | Nombres no secuenciales |
| H-31 | Dueño | KPIs | Sin atrasos, por cobrar, utilidad, ranking vendedor, cuello de botella | — | **B** | Dashboard nuevo (Fase 2) |
| H-32 | Taller | UX | Kanban por arrastre y 3D pesado; sin vista de tarea “mis pendientes”, sin etiquetas/lista de cortes por pieza imprimible por OP | `KanbanBoard`, `ModuleDetailTaller` | **M** | Vista de taller simple (lista/botones grandes) |
| H-33 | Vendedor | UX | Autosave y borradores producen decenas de proyectos “Cocina nueva” vacíos (≈20 de 31 en BD) | `kitchen_projects` | **M** | Borrar automáticamente borradores vacíos / pedir nombre |
| H-34 | Dueño | Dashboard | Dashboard y `/quotes` muestran datos del módulo legado; dos sistemas conviven | `projects/legacy/*`, `QuoteController` | **M** | Retirar o migrar el módulo legado |
| H-35 | Todos | Legal | PDF/vista sin vigencia fuera del campo `valid_until` (nulo), sin términos, IVA, condiciones de pago | `KitchenReportPDF` | **M** | Plantilla con términos y vigencia |

---

## 5. Datos faltantes en el modelo

**Nuevas entidades**
- `customers` (nombre, teléfono, WhatsApp, correo, dirección, notas, origen, creado_por).
- `quotes` unificada + `quote_versions` (folio `COT-0001-v2`, snapshot de costos y precios, margen, descuento, IVA, flete, instalación, vigencia, estado, enviada_el, aprobada_por/el).
- `orders` (pedido) (folio `PED-`, cliente, cotización aprobada, total, fecha_compromiso, dirección_instalación, prioridad, estado, motivo_cancelación).
- `payments` (pedido, tipo anticipo/abono/saldo, monto, método, fecha, referencia, comprobante, registrado_por).
- `production_orders` (folio `OP-`, pedido, versión de diseño congelada, estado, prioridad, fecha_compromiso, fecha_real) + `production_stages` (corte, armado, lijado, barniz/tapiz, QA, listo; responsable, inicio/fin) + `rework_issues` (etapa, descripción, foto, resuelto).
- `attachments` (entidad polimórfica: referencia del cliente, croquis, foto avance, foto final, comprobante).
- `inventory_movements` (material, cantidad, tipo entrada/salida/ajuste, pedido, usuario) + `materials.min_stock`, `supplier_id`.
- `suppliers`, `purchase_orders`(+líneas) con fecha_prometida/recibida.
- `delivery_notes` (fecha agendada, entregada, firma/recibió, observaciones, rechazo y motivo).
- `warranty_claims` (pedido, fecha, descripción, resolución).
- `audit_log` (user_id, entidad, id, campo, antes, después, fecha).
- `notifications` ya existe; agregar canal y plantilla.

**Campos nuevos en lo existente**
- `kitchen_projects`: `customer_id`, `delivery_address`, `desired_date`, `committed_date`, `priority`, `budget_hint`, `source`, `cancelled_reason`, `design_version`, `locked_at`.
- `materials`: `min_stock`, `supplier_id`, `waste_pct`, `last_cost_update`.
- Parámetros de negocio (`settings`): márgenes por tipo, % mano de obra, IVA, desperdicio, política de descuentos.

---

## 6. Flujo de estados propuesto

### 6.1 Cotización
`Borrador → Enviada → (Ajustes→ nueva versión) → Aprobada | Rechazada | Vencida`

| Transición | Quién |
|---|---|
| Borrador → Enviada | seller, admin |
| Enviada → Aprobada / Rechazada | seller (con evidencia), admin |
| Aprobada → (se crea Pedido) | automático |
| Descuento > umbral | requiere admin |
| Enviada → Vencida | automático por vigencia |

### 6.2 Pedido
`Anticipo pendiente → Confirmado → En producción → Listo → Agendado → Entregado → Cerrado (saldo 0)`, con `Cancelado` desde cualquier estado previo a Entregado.

| Transición | Quién | Regla |
|---|---|---|
| Aprobada → Anticipo pendiente | automático | — |
| → Confirmado | seller/admin | anticipo ≥ X % registrado |
| Confirmado → En producción | admin / auto | material apartado o comprado |
| En producción → Listo | taller (última etapa) | QA aprobado |
| Listo → Agendado | seller | fecha confirmada con cliente |
| Agendado → Entregado | taller/seller | nota de entrega firmada |
| Entregado → Cerrado | admin/seller | saldo = 0 |
| → Cancelado | admin | motivo obligatorio; no borra |
| Entregado → Postventa | seller | reclamo de garantía |

### 6.3 Orden de producción
`Pendiente → Material en espera → Corte → Armado → Lijado → Acabado (barniz/tapiz) → Control de calidad → Terminada`, con `Retrabajo` (vuelve a la etapa) y `Pausada`.

| Transición | Quién |
|---|---|
| Pendiente → Corte | taller |
| Cada etapa siguiente | taller (jefe de taller) |
| QA → Terminada / Retrabajo | admin o jefe de taller |
| Pausar / reprioriza | admin |
| Cambio de diseño con OP abierta | solo admin, genera nueva versión y avisa |

---

## 7. Roadmap

**Fase 1 — Sin esto no se puede operar**
1. Arreglar acceso de lectura al catálogo para seller/taller y mostrar error visible (H-01).
2. Pagos: anticipo/abonos/saldo + método + comprobante (H-02).
3. Cliente como entidad con correo/dirección (H-14) y dirección de instalación + fecha compromiso + prioridad (H-10).
4. Estados con cancelación, y que vendedor pueda aprobar con anticipo (H-08, H-12).
5. Candado de diseño desde Aprobado + aviso al taller en cambios (H-11).
6. Orden de producción con etapas y “Listo” previo a “Entregado” (H-09).
7. Cotización integridad: recalcular en servidor, pasar por state machine, historial (H-04, H-05, H-06).
8. Dashboard sobre `kitchen_projects` (H-03).
9. Seguridad básica: sin credenciales demo en prod, throttle login (H-29).

**Fase 2 — Operación cómoda**
Adjuntos (H-15), envío WhatsApp/correo + seguimiento (H-16), folios consecutivos (H-18), inventario con movimientos y faltantes (H-19), proveedores y OC (H-20), bitácora de cambios (H-13), KPIs del dueño (H-31), nota de entrega con firma (H-22), vista de taller simple/tablet (H-32), márgenes y descuentos configurables con aprobación (H-07).

Pendiente Fase 2 (clientes): herramienta de admin para **unir clientes**. Mueve proyectos, pedidos y pagos al cliente que se conserva y deja registro de la unión. El backfill ya no une por nombre; solo por teléfono normalizado, y reporta posibles duplicados por nombre para revisión manual.

Backlog Sprint 3 (API): las rutas `/api/*` responden **500** en lugar de 401 cuando la petición llega sin `Accept: application/json` (Laravel intenta redirigir a una ruta `login` que no existe). Forzar respuestas JSON en las rutas api y no redirigir a una ruta de login inexistente. Detectado el 2026-10-17 en producción; el frontend siempre manda la cabecera, así que no afecta a los usuarios hoy.

**Fase 3 — Nivel industrial**
Costeo real vs estimado, mano de obra por horas, mermas reales, garantía/postventa (H-24), versionado de diseño con comparativo, etiquetas/QR por pieza, notificaciones multicanal, link público con caducidad/PIN, retiro del módulo legado, pruebas E2E por rol.

### Sprint 2 — decisión: el backfill de clientes NO se corre en producción (2026-10-17)

**Decisión.** Sprint 2 (clientes, pedidos, pagos, settings, folios PED) está desplegado y migrado en producción, pero el comando `customers:backfill-from-projects` **no se ejecuta ahí**. Los proyectos existentes conservan su texto en `client_name`/`client_phone` (la interfaz ya cae a ese texto cuando un proyecto no tiene `customer_id`), y los clientes reales se crean desde ahora con el selector del builder y al aprobar un pedido.

**Por qué.** En los datos reales `client_name` se usó como **dirección o ubicación de la obra** («Halcones 40 viñedos», «Allende 2720», «Manantiales 86»…), no como el nombre de una persona. Crear clientes a partir de ese texto llenaría el catálogo de direcciones y lo dejaría sucio desde el primer día.

**Números del dry-run en producción (272 proyectos activos):**
- 246 clientes se crearían y 247 proyectos se vincularían; solo 1 se uniría a un cliente existente por teléfono.
- 25 proyectos se omitirían por no tener nombre ni teléfono.
- 18 grupos de «posibles duplicados» por nombre (por ejemplo Allende 2720 ×4, Manantiales 86 ×4): casi todos son la misma ubicación repetida en varios proyectos, no personas distintas con el mismo nombre.
- El dry-run no dejó datos (0 clientes, 0 proyectos vinculados, 0 pedidos, 0 pagos); solo avanzó la secuencia de ids de `customers`.

**Se conserva** el comando de backfill y su `--dry-run` (con el reporte de duplicados), pero no se corre en producción.

**Backlog Sprint 3 (clientes; no implementado):**
- Separar en el proyecto **«Cliente»** (persona, del catálogo `customers`) de **«Ubicación / obra»** (texto libre o dirección). En los proyectos existentes, `client_name` pasaría a ser la ubicación.
- En proyectos sin `customer_id`, botón **«Asignar cliente»** con búsqueda precargada con el texto de `client_name`.
- (Ya anotado arriba) Respuestas JSON forzadas en `/api/*`, para que no haya 500 sin `Accept: application/json`.

---

## 8. Preguntas de negocio para ti

1. ¿Cuántas personas usan el sistema y quién **aprueba** realmente: ¿el dueño siempre, o el vendedor con anticipo?
2. ¿Qué % de anticipo se pide? ¿Hay un mínimo para meter a producción? ¿Se factura (IVA/CFDI) o es nota simple?
3. ¿El 30 % de mano de obra y 20 % de utilidad son reglas fijas o varían por cliente/tipo/urgencia? ¿Se incluye instalación y flete?
4. ¿Hay descuentos? ¿Hasta cuánto puede dar un vendedor sin autorización?
5. ¿Cómo mides mano de obra: por mueble, por metro lineal, por horas de operario?
6. ¿El taller es uno o varios (carpintería, barniz/tapizado subcontratado)? ¿Cuántos operarios y quién es el “jefe de taller”?
7. ¿Qué etapas de fabricación usan realmente y cuáles requieren evidencia (foto)?
8. ¿Compran material por pedido o mantienen stock? ¿Tienen proveedores fijos y tiempos de entrega?
9. ¿Qué pasa si el cliente cancela con anticipo ya dado: se devuelve, se retiene parcial?
10. ¿Cuánto tiempo de garantía ofrecen y qué cubre?
11. ¿El cliente debe poder ver el avance de su pedido (link público de seguimiento)?
12. ¿Quieres seguir con el módulo “legado” (`/projects/legacy`, `/quotes`) o lo retiramos?
13. ¿Las credenciales demo (`admin@demo.com / password`) existen en producción (Railway)? Hay que cambiarlas ya.
14. ¿Cómo prefieres avisar al cliente: WhatsApp manual con plantilla, WhatsApp Business API o correo?

---

### Límites de esta auditoría
- No se levantó la app ni se probó en Railway: el hallazgo H-01 y los de UI/tablet se deducen del código y de los tests; conviene confirmarlos entrando como vendedor y como taller.
- La BD analizada es la local de desarrollo (no producción); los conteos ilustran uso en pruebas, no ventas reales.
