# Servicio de Gestión de Activos

Este microservicio se encarga del control, inventario, movimientos y aceptaciones de los activos de la organización.
Ha sido migrado de una arquitectura monolítica/desarrollo a una arquitectura de microservicios contenerizada lista para producción.

## Estructura

- **Frontend (`/app/frontend`)**: Aplicación Single Page Application (SPA) en React compilada con Vite y servida estáticamente vía Nginx.
- **Backend (`/app/backend`)**: API REST desarrollada en Node.js + Express que maneja la lógica de negocio y conectividad con la base de datos.
- **Base de Datos (`db-activos`)**: Instancia de PostgreSQL que almacena los datos transaccionales de los activos.

## Autenticación Inicial y Credenciales

Por motivos de seguridad, las contraseñas de inicialización (cuando la base de datos está vacía) han sido extraídas del código fuente.

**Si acabas de realizar una instalación limpia (base de datos vacía), se habrán creado los siguientes usuarios con estas contraseñas por defecto:**

| Usuario | Rol | Contraseña por Defecto |
| :--- | :--- | :--- |
| `admin` | **ADMIN** | `Admin_Inicial_2026!` |
| `operator` | **OPERATOR** | `Operator_Inicial_2026!` |
| `viewer` | **VIEWER** | `Viewer_Inicial_2026!` |

> [!WARNING]
> **Cambio de Contraseña Requerido**
> Es estrictamente recomendado que los administradores ingresen al sistema y modifiquen las contraseñas de los usuarios inmediatamente después de la siembra inicial, o en su defecto que inyecten contraseñas seguras usando las variables de entorno `ADMIN_PASSWORD`, `OPERATOR_PASSWORD` y `VIEWER_PASSWORD` en el contenedor del backend antes del primer inicio.

## Seguridad del Servicio

Este servicio se orquesta internamente y expone los siguientes puertos solo para la red interna de Docker (`microservices_net`):
- `5432`: Base de Datos
- `4002`: Backend API
- `80`: Frontend SPA

El único punto de acceso desde el exterior debe ser a través del **API Gateway** (Nginx raíz del servidor), el cual maneja el tráfico hacia `/activos/` y `/api/activos/`.
