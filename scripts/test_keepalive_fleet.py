#!/usr/bin/env python3
"""Tests deterministas de scripts/keepalive_fleet.py (F15-F18).

Sin red: se monkeypatchean `estacion_request` (directorio + PATCHes) y
`ping_project` (resultado del keepalive). El estado va a un archivo temporal.

Correr:  python3 scripts/test_keepalive_fleet.py
"""
import contextlib
import io
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import keepalive_fleet as kf  # noqa: E402


class KeepaliveTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._orig_state = kf.STATE_FILE
        self._orig_estacion = kf.estacion_request
        self._orig_ping = kf.ping_project
        self._orig_argv = sys.argv[:]
        kf.STATE_FILE = os.path.join(self.tmp.name, 'state.json')
        self.patches = []  # (method, path, body)
        self.rows = []
        self.ping_results = {}

        def fake_estacion(method, path, body=None):
            if method == 'GET':
                return self.rows
            self.patches.append((method, path, body))
            return None

        def fake_ping(url, anon_key):
            return self.ping_results.get(url, (True, 'HTTP 200'))

        kf.estacion_request = fake_estacion
        kf.ping_project = fake_ping
        sys.argv = ['keepalive_fleet.py']

    def tearDown(self):
        kf.STATE_FILE = self._orig_state
        kf.estacion_request = self._orig_estacion
        kf.ping_project = self._orig_ping
        sys.argv = self._orig_argv
        self.tmp.cleanup()

    def run_main(self):
        with contextlib.redirect_stdout(io.StringIO()) as buf:
            code = kf.main()
        return code, json.loads(buf.getvalue())

    def state(self):
        try:
            with open(kf.STATE_FILE) as f:
                return json.load(f)
        except FileNotFoundError:
            return None

    def test_F15_directorio_vacio(self):
        """Sin proyectos: exit 0, sin alerta, sin escribir estado."""
        code, summary = self.run_main()
        self.assertEqual(code, 0)
        self.assertEqual(summary['checked'], 0)
        self.assertFalse(summary['alert'])
        self.assertEqual(self.patches, [])
        self.assertIsNone(self.state())

    def test_F16_ping_ok_resetea_fallos_y_actualiza_last_keepalive(self):
        self.rows = [{
            'license_code': 'LIC-A', 'supabase_url': 'https://a.supabase.co',
            'supabase_anon_key': 'k', 'status': 'active',
        }]
        self.ping_results['https://a.supabase.co'] = (True, 'HTTP 200')
        code, summary = self.run_main()
        self.assertEqual(code, 0)
        self.assertEqual(summary['ok'], ['LIC-A'])
        st = self.state()
        self.assertEqual(st['LIC-A']['fails'], 0)
        # PATCH con last_keepalive y status=active.
        patch = [p for p in self.patches if p[0] == 'PATCH']
        self.assertEqual(len(patch), 1)
        self.assertIn('last_keepalive', patch[0][2])
        self.assertEqual(patch[0][2]['status'], 'active')

    def test_F17_dos_fallos_seguidos_marcan_status_error(self):
        self.rows = [{
            'license_code': 'LIC-B', 'supabase_url': 'https://b.supabase.co',
            'supabase_anon_key': 'k', 'status': 'active',
        }]
        self.ping_results['https://b.supabase.co'] = (False, 'timeout')
        # Primera corrida: 1 fallo, SIN marcar error todavía.
        code1, s1 = self.run_main()
        self.assertEqual(code1, 1)
        self.assertTrue(s1['alert'])
        self.assertEqual(s1['failed'][0]['consecutive_fails'], 1)
        self.assertFalse(any(p[2].get('status') == 'error' for p in self.patches))
        # Segunda corrida: 2 fallos → status='error' en el directorio.
        code2, s2 = self.run_main()
        self.assertEqual(code2, 1)
        self.assertEqual(s2['failed'][0]['consecutive_fails'], 2)
        err_patches = [p for p in self.patches if p[2].get('status') == 'error']
        self.assertEqual(len(err_patches), 1)
        self.assertIn('LIC-B', err_patches[0][1])
        self.assertEqual(self.state()['LIC-B']['fails'], 2)

    def test_F18_dry_run_no_escribe_ni_parchea(self):
        sys.argv = ['keepalive_fleet.py', '--dry-run']
        self.rows = [{
            'license_code': 'LIC-C', 'supabase_url': 'https://c.supabase.co',
            'supabase_anon_key': 'k', 'status': 'active',
        }]
        self.ping_results['https://c.supabase.co'] = (True, 'HTTP 200')
        code, summary = self.run_main()
        self.assertEqual(code, 0)
        self.assertTrue(summary['dry_run'])
        self.assertEqual(self.patches, [])
        self.assertIsNone(self.state())


if __name__ == '__main__':
    unittest.main(verbosity=2)
