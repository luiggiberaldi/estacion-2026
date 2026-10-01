#!/usr/bin/env node
/**
 * provision-customer.mjs — Aprovisiona el proyecto Supabase de un cliente Pro.
 *
 * Flujo:
 *   1. Crea una ORGANIZACIÓN Supabase para el cliente (cada org trae sus
 *      2 proyectos gratis; usamos 1 por cliente).
 *   2. Crea el PROYECTO dentro de esa organización (tier gratis).
 *   3. Aplica el esquema base en orden (7 archivos SQL del repo Pro).
 *   4. Crea el usuario dueño en Auth (email + contraseña temporal).
 *   5. Genera el código de licencia e imprime el INSERT para el directorio
 *      de la Estación (lo ejecuta el asistente con su tooling, no este script).
 *
 * Uso:
 *   node provision-customer.mjs --email dueno@bodega.com --business "Bodega San Miguel" --phone 04121234567 [--dry-run|--execute] [--region sa-east-1]
 *
 * Requiere: SUPABASE_MANAGEMENT_TOKEN en el entorno.
 *   ⚠ El token anterior quedó expuesto en el chat: ROTARLO en el dashboard
 *     (Supabase → Account → Access Tokens) antes del primer uso real.
 *
 * Por defecto corre en --dry-run: muestra el plan sin crear nada.
 */

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomInt } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const PRO_REPO = join(HERE, '..', '..', 'preciosaldia-multilocal');
const PY = '/home/hatch/workspace/.venvs/pgtools/bin/python';
const SUPA_SQL = join(HERE, 'supa_sql.py');
const MGMT = 'https://api.supabase.com';

const SCHEMA_FILES = [
  'supabase_cloud_schema.sql',
  // device_pairings ANTES de 001: sus políticas la referencian y fallarían
  // en un proyecto fresco si la tabla no existe todavía.
  'supabase_pairing_setup.sql',
  'supabase/migrations/001_device_own_row_rls.sql',
  'supabase/migrations/002_account_devices.sql',
  'supabase/migrations/003_my_account_device_ids.sql',
  'supabase/migrations/004_device_limit.sql',
  'supabase/customer-project/002_customer_additions.sql',
];

function args() {
  const out = { region: 'sa-east-1', dryRun: true };
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (a === '--execute') out.dryRun = false;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--')) out[a.slice(2).replace(/-/g, '_')] = raw[++i];
  }
  return out;
}

function genLicenseCode() {
  const alpha = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I/L
  let s = '';
  for (let i = 0; i < 6; i++) s += alpha[randomInt(alpha.length)];
  return `LIC-${s}`;
}

function genPassword(len = 16) {
  return randomBytes(len).toString('base64url').slice(0, len);
}

async function mgmt(method, path, body) {
  const token = process.env.SUPABASE_MANAGEMENT_TOKEN;
  if (!token) throw new Error('Falta SUPABASE_MANAGEMENT_TOKEN en el entorno.');
  const res = await fetch(`${MGMT}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* texto plano */ }
  if (!res.ok) throw new Error(`Management API ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return json ?? text;
}

async function waitActive(ref, tries = 30) {  for (let i = 0; i < tries; i++) {
    const p = await mgmt('GET', `/v1/projects/${ref}`);
    const status = p?.status || p?.data?.status;
    if (status === 'ACTIVE_HEALTHY' || status === 'ACTIVE') return p;
    await new Promise(r => setTimeout(r, 10000));
  }
  throw new Error(`El proyecto ${ref} no llegó a ACTIVE a tiempo.`);
}

/**
 * Aplica SQL al proyecto vía conexión directa Postgres (scripts/supa_sql.py).
 * El Management API no expone ejecución de SQL con el token actual, así que
 * se usa el db password que este mismo script fijó al crear el proyecto.
 * El password viaja solo como argumento del proceso hijo; nunca se imprime.
 */
function applySql(ref, dbPassword, sql) {
  const tmp = join(tmpdir(), `pda-sql-${Date.now()}-${randomInt(1000)}.sql`);
  writeFileSync(tmp, sql, 'utf8');
  try {
    execFileSync(PY, [SUPA_SQL, ref, dbPassword, tmp], { stdio: 'inherit' });
  } finally {
    try { unlinkSync(tmp); } catch { /* /tmp lo purga el SO */ }
  }
}

async function main() {  const o = args();
  if (!o.email || !o.business) {
    console.error('Uso: node provision-customer.mjs --email <correo> --business "<nombre>" --phone <tlf> [--execute]');
    process.exit(1);
  }

  const licenseCode = genLicenseCode();
  const tempPassword = genPassword();
  const dbPassword = genPassword(24);
  const orgName = `pda-${o.business.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30)}`;
  const projectName = `${o.business} — PreciosAlDía Pro`.slice(0, 60);

  console.log('═══ Plan de aprovisionamiento ═══');
  console.log(`  Negocio:      ${o.business}`);
  console.log(`  Email dueño:  ${o.email}`);
  console.log(`  Teléfono:     ${o.phone || '(no indicado)'}`);
  console.log(`  Organización: ${orgName}`);
  console.log(`  Proyecto:     ${projectName}`);
  console.log(`  Región:       ${o.region}`);
  console.log(`  Código:       ${licenseCode}`);
  console.log(`  SQL a aplicar: ${SCHEMA_FILES.length} archivos`);
  console.log(o.dryRun ? '\n▶ DRY-RUN: no se crea nada. Agrega --execute para correr de verdad.\n' : '\n▶ EXECUTE: creando recursos reales…\n');

  if (o.dryRun) {
    console.log('Archivos SQL en orden:');
    SCHEMA_FILES.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    console.log('\nAl ejecutar, el último paso imprime el INSERT para el directorio de la Estación.');
    return;
  }

  // 1. Organización
  console.log('① Creando organización…');
  const org = await mgmt('POST', '/v1/organizations', { name: orgName });
  const orgSlug = org.slug || org.id || org.data?.slug;
  console.log(`   OK: ${orgSlug}`);

  // 2. Proyecto
  console.log('② Creando proyecto (puede tardar ~2 min)…');
  const proj = await mgmt('POST', '/v1/projects', {
    organization_slug: orgSlug,
    name: projectName,
    db_pass: dbPassword,
    region: o.region,
    plan: 'free',
  });
  const ref = proj.id || proj.ref || proj.data?.ref;
  console.log(`   ref: ${ref} — esperando ACTIVE…`);
  await waitActive(ref);
  const url = `https://${ref}.supabase.co`;
  console.log(`   OK: ${url}`);

  // 3. Esquema (vía conexión directa: el Management API no expone ejecución SQL)
  console.log('③ Aplicando esquema base…');
  for (const f of SCHEMA_FILES) {
    const sql = readFileSync(join(PRO_REPO, f), 'utf8');
    applySql(ref, dbPassword, sql);
    console.log(`   OK: ${f}`);
  }

  // 4. Claves del proyecto
  const keys = await mgmt('GET', `/v1/projects/${ref}/api-keys`);
  const anonKey = Array.isArray(keys)
    ? keys.find(k => k.name === 'anon' || k.type === 'anon')?.api_key || keys.find(k => k.name === 'anon')?.key
    : keys?.anon_key;
  if (!anonKey) console.log('   ⚠ No pude leer la anon key automáticamente; cópiala del dashboard.');

  // 5. Usuario dueño en Auth
  console.log('④ Creando usuario dueño en Auth…');
  let userId = '(crear manual)';
  try {
    const user = await mgmt('POST', `/v1/projects/${ref}/auth/v1/admin/users`, {
      email: o.email, password: tempPassword, email_confirm: true,
      user_metadata: { business_name: o.business, license_code: licenseCode },
    });
    userId = user.id || user.user?.id || '(revisar)';
    console.log(`   OK: ${userId}`);
  } catch (e) {
    console.log(`   ⚠ No se pudo crear vía API: ${e.message}`);
    console.log('   → Créalo a mano en el dashboard: Authentication → Users → Add user (email confirmado).');
  }

  // 6. Fila de licencia premium en el proyecto del cliente
  if (userId && !userId.startsWith('(')) {
    applySql(ref, dbPassword,
      `insert into public.licenses (user_id, type, status, notes) values ('${userId}', 'permanent', 'active', 'Provisión automática ${licenseCode}') on conflict (user_id) do update set status='active', notes=excluded.notes;`);
    console.log('⑤ Licencia premium registrada en el proyecto del cliente.');
  }

  console.log('\n═══ Entregar al cliente ═══');
  console.log(`  Código de licencia: ${licenseCode}`);
  console.log(`  Email:              ${o.email}`);
  console.log(`  Clave temporal:     ${tempPassword}  (debe cambiarla al entrar)`);
  console.log(`  Proyecto:           ${url}`);

  console.log('\n═══ INSERT para el directorio de la Estación ═══');
  console.log('(lo ejecuta el asistente con su tooling de la Estación)');
  console.log(`insert into public.customer_projects (license_code, account_email, business_name, phone, supabase_url, supabase_anon_key)`);
  console.log(`values ('${licenseCode}', '${o.email}', '${o.business.replace(/'/g, "''")}', '${(o.phone || '').replace(/'/g, "''")}', '${url}', '${anonKey || 'COPIAR_DEL_DASHBOARD'}');`);
}

main().catch(e => { console.error('\n✖ Falló:', e.message); process.exit(1); });
