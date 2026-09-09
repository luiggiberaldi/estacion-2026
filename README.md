# Estación Maestra · Precios al Día Bodega

Panel de administración aislado para gestionar licencias, demos, backups y mensualidades del POS "Precios al Día Bodega".

## 🚀 Inicio rápido

```bash
# Instalar dependencias
npm install

# Iniciar dev server (puerto 3001)
npm run dev

# Build de producción
npm run build

# Lint y verificación de tipos
npm run lint
npx tsc --noEmit
```

Abre [http://localhost:3001](http://localhost:3001)

## 🔐 Acceso

El acceso al panel es administrativo y **no se documentan credenciales en el repositorio**.

## 📁 Estructura

```
estacion-maestra/
├── scripts/                    # Scrapers Node.js (imágenes de productos)
│   ├── scrape-and-upload.cjs
│   ├── scrape-images.cjs
│   └── upload-images.cjs
├── src/
│   ├── app/
│   │   ├── api/backup/complete/  # Endpoint POST para el POS (metadata de backups)
│   │   ├── globals.css           # Design tokens OKLCH
│   │   ├── layout.tsx            # Fonts: Instrument Serif + Work Sans
│   │   └── page.tsx              # Entry point (router auth)
│   ├── components/
│   │   ├── admin-shell.tsx       # Sidebar + topbar + content
│   │   ├── login-view.tsx        # Pantalla de login
│   │   ├── views/
│   │   │   ├── dashboard-view.tsx       # KPIs + actividad
│   │   │   ├── licenses-view.tsx        # CRUD licencias
│   │   │   ├── demos-view.tsx           # Demos activas
│   │   │   ├── backups-view.tsx         # Extraer respaldos + control remoto
│   │   │   ├── subscriptions-view.tsx   # Mensualidades
│   │   │   └── devices-view.tsx         # Dispositivos
│   │   └── ui/                   # Componentes shadcn/ui
│   ├── hooks/
│   │   ├── use-toast.ts          # Notificaciones
│   │   └── usePagination.ts      # Paginación client-side
│   └── lib/
│       ├── actions.ts            # Server Actions (Supabase service-role)
│       ├── auth-context.tsx      # Auth provider
│       ├── supabase.ts           # Clientes Supabase (anon + service-role)
│       ├── types.ts              # Tipos del dominio
│       └── utils.ts              # cn(), formatBytes, formatCurrency, etc.
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
└── .gitignore
```

## 🔌 Backend

Los datos provienen de Supabase mediante Server Actions con la clave
`SUPABASE_SERVICE_ROLE_KEY` (solo servidor). Variables requeridas en `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Tablas utilizadas: `licenses`, `cloud_licenses`, `cloud_backups`, `backup_requests`,
`account_devices`, `supervisor_commands` (comandos remotos de recarga hacia el POS),
y `product_images_catalog` (catálogo de imágenes de los scrapers).

Las entidades en `lib/types.ts` mapean a las tablas SQL del POS Bodega:

- `License` → `licenses` (+ metadatos de `cloud_licenses`)
- `Demo` → `licenses` con `type IN ('demo3','demo7')`
- `Backup` → `cloud_backups`
- `Subscription` → `cloud_licenses` (tipo `monthly`)
- `Device` → `account_devices`

## 🖼️ Scripts de imágenes

Los scrapers (`scripts/*.cjs`) buscan imágenes de productos en tiendas venezolanas,
las guardan en `product-images/` y las suben al bucket `product-images` de Supabase
catalogándolas en `product_images_catalog`. Requieren `SUPABASE_SERVICE_ROLE_KEY`
en `.env.local` y corren con Node:

```bash
node scripts/scrape-and-upload.cjs   # scrappea y sube según el inventario
node scripts/upload-images.cjs       # sube imágenes locales pendientes
```

> Nota: `scrape-and-upload.cjs` referencia rutas locales del inventario
> (`inventario_extraido.json`); ajustar `jsonPath`/`backupPath` antes de usarlo
> en otra máquina.

## 📦 Despliegue

Proyecto Next.js 16 (Turbopack). Compatible con Vercel, Cloudflare Pages, o
cualquier host Node.js.

```bash
npm run build
```

## 🏷️ Versión

v1.1.0 — Frontend conectado a Supabase (service-role en servidor), control remoto
de respaldos y comandos de recarga vía `supervisor_commands`.
