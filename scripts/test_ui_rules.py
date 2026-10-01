#!/usr/bin/env python3
"""Tests estáticos de las reglas UI de licencias (F20, F21).

Verifican en el código fuente que:
- No existe pestaña "Mensuales".
- Pro solo admite licencia permanente (generar y cambiar tipo).
- Lite admite permanente + demo (demo3), sin mensualidad.
- No quedan plantillas de mensualidad en mensajes.

Correr:  python3 scripts/test_ui_rules.py
"""
import re
import sys

LIC = 'src/components/views/licenses-view.tsx'
MSG = 'src/components/views/messages-view.tsx'

fails = []


def check(name, cond, detail=''):
    print(('PASS' if cond else 'FAIL'), '-', name, detail)
    if not cond:
        fails.append(name)


lic = open(LIC, encoding='utf-8').read()
msg = open(MSG, encoding='utf-8').read()

# F20: sin pestaña Mensuales.
m = re.search(r'const TAB_CONFIG[^;]*?\[([\s\S]*?)\];', lic)
tabs = m.group(1) if m else ''
check('sin pestana Mensuales', 'mensual' not in tabs.lower())

# F20: generar — Pro fuerza permanent al cambiar de producto.
check('cambiar a Pro fuerza permanent',
      'if (p === "pro" && formType !== "permanent") setFormType("permanent")' in lic)

# F20: generar — demo solo para bodega (Lite), nunca mensual para Pro.
gen_select = lic[lic.index('Tipo de licencia'):lic.index('Tipo de licencia') + 1200]
check('generar: demo3 solo para bodega',
      'formProduct === "bodega"' in gen_select and 'value="demo3"' in gen_select)
check('generar: sin opcion monthly', 'value="monthly"' not in gen_select)

# F20: cambiar tipo — opciones por producto.
check('cambiar tipo: sin opcion monthly/demo7 en el Select',
      'value="monthly"' not in lic[lic.index('htmlFor="change-type"'):lic.index('htmlFor="change-type"') + 900])
check('cambiar tipo: demo solo para bodega',
      '((changeTypeLic?.productId as ProductId) ?? productId) === "bodega"' in lic)
check('cambiar tipo: clampTypeForProduct existe y Pro -> permanent',
      'function clampTypeForProduct' in lic and 'if (prod === "pro") return "permanent"' in lic)
check('reactivar usa permanent, no monthly',
      'setNewLicType("monthly")' not in lic)
check('expiracion del cambio usa isDemo(newLicType)',
      'const expiresAt = isDemo(newLicType)' in lic)

# F21: mensajes — sin plantillas de mensualidad.
check('sin plantilla de mensualidad proxima a vencer',
      'mensualidad_vence' not in msg and 'mensualidad proxima' not in msg.lower())
check('pago_recibido no habla de suscripcion ni mensualidad',
      'suscripción' not in msg and 'Confirmar pago de mensualidad' not in msg)
check('pago_recibido confirma licencia permanente',
      'Confirmar pago de licencia permanente' in msg)

print()
if fails:
    print(f'{len(fails)} REGLA(S) ROTAS')
    sys.exit(1)
print('Todas las reglas UI OK')
