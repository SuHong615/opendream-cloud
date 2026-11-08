import sqlite3, time, os, sys

src_path = r".data/smoke.sqlite"
backup_path = r".data/smoke-backup.sqlite"
if not os.path.exists(src_path):
    print("SKIP: no smoke db at", src_path)
    sys.exit(0)

start = time.time()
src = sqlite3.connect(src_path)
dst = sqlite3.connect(backup_path)
src.backup(dst)
dst.close()
elapsed = time.time() - start

check = sqlite3.connect(backup_path)
rows = {}
for table in ["users", "workspaces", "audit_logs", "api_keys"]:
    try:
        rows[table] = check.execute(f"select count(*) from {table}").fetchone()[0]
    except Exception as error:
        rows[table] = f"ERR {error}"
check.close()
src.close()

print("backup_path:", backup_path)
print("tables:", rows)
print(f"backup_seconds={elapsed:.3f}")
print("RESTORE_CHECK=OK" if all(isinstance(v, int) for v in rows.values()) else "RESTORE_CHECK=FAIL")
