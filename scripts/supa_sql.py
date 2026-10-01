#!/usr/bin/env python3
"""
supa_sql.py — Ejecuta un archivo SQL contra un proyecto Supabase vía conexión
directa Postgres (el Management API no expone ejecución de SQL con el token
actual). Divide el archivo en sentencias respetando bloques dollar-quoted
($$ ... $$) y las ejecuta una por una en una sola transacción.

Uso:
    ~/workspace/.venvs/pgtools/bin/python supa_sql.py <project-ref> <db-password> <sql-file> [--pooler]

El password nunca se imprime ni se guarda: viaja solo como argumento del proceso.
"""
import re
import sys

sys.path.insert(0, "/home/hatch/workspace/.venvs/pgtools/lib/python3.12/site-packages")
import pg8000.dbapi  # noqa: E402


def split_statements(sql):
    """Parte en sentencias por ';' fuera de strings y bloques $tag$...$tag$."""
    stmts, buf = [], []
    i, n = 0, len(sql)
    tag = None  # tag dollar-quote abierto, p.ej. '$$' o '$body$'
    in_str = False  # '...'
    in_line_comment = False  # -- ...
    in_block_comment = 0  # /* ... */
    while i < n:
        ch = sql[i]
        nxt = sql[i + 1] if i + 1 < n else ""
        if in_line_comment:
            buf.append(ch)
            if ch == "\n":
                in_line_comment = False
            i += 1
            continue
        if in_block_comment:
            if ch == "/" and nxt == "*":
                in_block_comment += 1
                buf.append(ch)
                buf.append(nxt)
                i += 2
                continue
            if ch == "*" and nxt == "/":
                in_block_comment -= 1
                buf.append(ch)
                buf.append(nxt)
                i += 2
                continue
            buf.append(ch)
            i += 1
            continue
        if tag:
            buf.append(ch)
            if sql.startswith(tag, i):
                buf.append(sql[i + 1: i + len(tag)])
                i += len(tag)
                tag = None
            else:
                i += 1
            continue
        if in_str:
            buf.append(ch)
            if ch == "'" and nxt == "'":
                buf.append(nxt)
                i += 2
                continue
            if ch == "'":
                in_str = False
            i += 1
            continue
        if ch == "-" and nxt == "-":
            in_line_comment = True
            buf.append(ch)
            buf.append(nxt)
            i += 2
            continue
        if ch == "/" and nxt == "*":
            in_block_comment = 1
            buf.append(ch)
            buf.append(nxt)
            i += 2
            continue
        if ch == "'":
            in_str = True
            buf.append(ch)
            i += 1
            continue
        m = re.match(r"\$[A-Za-z_][A-Za-z_0-9]*\$|\$\$", sql[i:])
        if m:
            tag = m.group(0)
            buf.append(tag)
            i += len(tag)
            continue
        if ch == ";":
            stmt = "".join(buf).strip()
            if stmt:
                stmts.append(stmt)
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    tail = "".join(buf).strip()
    if tail:
        stmts.append(tail)
    return stmts


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        sys.exit(2)
    ref, password, sqlfile = sys.argv[1], sys.argv[2], sys.argv[3]
    use_pooler = "--pooler" in sys.argv
    host = f"db.{ref}.supabase.co"
    port = 6543 if use_pooler else 5432
    user = f"postgres.{ref}" if use_pooler else "postgres"

    with open(sqlfile, encoding="utf-8") as f:
        sql = f.read()
    stmts = split_statements(sql)
    print(f"→ {len(stmts)} sentencias a {host}:{port}", flush=True)

    con = pg8000.dbapi.connect(user=user, host=host, port=port,
                               password=password, database="postgres")
    try:
        cur = con.cursor()
        for idx, stmt in enumerate(stmts, 1):
            try:
                cur.execute(stmt)
            except Exception as e:
                print(f"✖ sentencia {idx}/{len(stmts)} falló: {str(e)[:200]}")
                print(f"  inicio: {stmt[:120]!r}")
                con.rollback()
                sys.exit(1)
        con.commit()
        print(f"✓ {len(stmts)} sentencias aplicadas.")
    finally:
        con.close()


if __name__ == "__main__":
    main()
