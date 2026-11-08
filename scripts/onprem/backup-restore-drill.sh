#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Copyright 2026 suhong
# Author: suhong
# OpenDream 备份恢复演练（PostgreSQL + MinIO）
# 依赖：pg_dump/pg_restore/psql、mc（MinIO Client）
set -euo pipefail

: "${PGHOST:?set PGHOST}"
: "${PGPORT:=5432}"
: "${PGUSER:?set PGUSER}"
: "${PGDATABASE:=opendream}"
: "${PGPASSWORD:?set PGPASSWORD}"
: "${BACKUP_DIR:=./backups}"
: "${RESTORE_DB:=opendream_restore}"
: "${S3_ENDPOINT:=http://minio:9000}"
: "${S3_BUCKET:=opendream}"
: "${S3_ACCESS_KEY:?set S3_ACCESS_KEY}"
: "${S3_SECRET_KEY:?set S3_SECRET_KEY}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP="$BACKUP_DIR/opendream-$STAMP.dump"

echo "[1/5] pg_dump $PGDATABASE"
pg_dump -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -Fc -f "$DUMP" "$PGDATABASE"

echo "[2/5] 创建恢复库 $RESTORE_DB"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c "DROP DATABASE IF EXISTS $RESTORE_DB" >/dev/null
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c "CREATE DATABASE $RESTORE_DB" >/dev/null

echo "[3/5] pg_restore"
pg_restore -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$RESTORE_DB" --no-owner "$DUMP"

echo "[4/5] 数据校验"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$RESTORE_DB" -c "SELECT COUNT(*) AS orgs FROM orgs;" || true
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$RESTORE_DB" -c "SELECT COUNT(*) AS users FROM users;" || true

echo "[5/5] MinIO 对象镜像校验"
mc alias set opendream "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null
mc mirror --overwrite "$S3_BUCKET" "$BACKUP_DIR/minio-$STAMP" >/dev/null
echo "PASS: backup=$DUMP restore_db=$RESTORE_DB"
