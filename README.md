# Estación Maestra · Precios al Día Bodega

Panel de administración aislado para gestionar licencias, demos, backups y mensualidades del POS "Precios al Día Bodega".

## 🚀 Inicio rápido

```bash
# Instalar dependencias
bun install

# Iniciar dev server (puerto 3001)
bun run dev

# Build de producción
bun run build

# Iniciar producción
bun run start
```

Abre [http://localhost:3001](http://localhost:3001)

## 🔐 Credenciales de demo

```
Email:    admin@preciosaldia.com
Password: admin123
```

## 📁 Estructura

```
estacion-maestra/
├── src/
│   ├── app/
│   │   ├── globals.css         # Design tokens OKLCH
│   │   ├── layout.tsx          # Fonts: Instrument Serif + Work Sans
│   │   └── page.tsx            # Entry point (router auth)
│   ├── components/
│   │   ├── admin-shell.tsx     # Sidebar + topbar + content
│   │   ├── login-view.tsx      # Pantalla de login
│   │   ├── views/
│   │   │   ├── dashboard-view.tsx       # KPIs + actividad
│   │   │   ├── licenses-view.tsx        # CRUD licencias
│   │   │   ├── demos-view.tsx           # Demos activas
│   │   │   ├── backups-view.tsx         # Extraer respaldos
│   │   │   ├── subscriptions-view.tsx   # Mensualidades
│   │   │   └── devices-view.tsx         # Dispositivos
│   │   └── ui/                 # 14 componentes shadcn/ui
│   ├── hooks/
│   │   └── use-toast.ts        # Hook de notificaciones
│   └── lib/
│       ├── auth-context.tsx    # Auth provider
│       ├── mock-data.ts        # Datos mock + helpers
│       ├── types.ts            # Tipos del dominio
│       └── utils.ts            # Helper cn()
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
└── .gitignore
```

## 🎨 Design System

OKLCH con consistencia perceptual:
- **Cian H=192** (`#01696f`) — primario
- **Cream cálido H=85** (`#fbfaf7`) — fondos
- **Marrón carbón H=60** (`#2c2924`) — texto
- **Naranja/óxido H=55** (`#c16729`) — accent
- **Instrument Serif** — títulos display
- **Work Sans** — body/UI

## 🔌 Backend (pendiente)

Actualmente usa datos mock en `src/lib/mock-data.ts`. Para conectar al backend:

1. Reemplazar `lib/mock-data.ts` con llamadas a API
2. Reemplazar `login()` en `auth-context.tsx` con `/api/auth/login`
3. Crear API routes en `src/app/api/`

Las entidades en `lib/types.ts` mapean a las tablas SQL del POS Bodega:
- `License` → `licenses`
- `Demo` → `demos`
- `Backup` → `cloud_backups`
- `Subscription` → `cloud_licenses`
- `Device` → `account_devices`

## 📦 Despliegue

Proyecto Next.js 16 standalone. Compatible con Vercel, Cloudflare Pages, o cualquier host Node.js.

```bash
bun run build
# Desplegar carpeta .next/ + package.json
```

## 🏷️ Versión

v1.0.0 — Frontend completo con datos mock. Backend pendiente.
