#!/bin/bash
set -euo pipefail

# Make tmpfs usable by Postgres
mkdir -p /mnt/pg_tmp
chown postgres:postgres /mnt/pg_tmp
chmod 700 /mnt/pg_tmp
echo "[Startup] /mnt/pg_tmp -> $(ls -ld /mnt/pg_tmp)"

# Hand off to the official entrypoint with tuning flags
exec docker-entrypoint.sh postgres \
  -c max_wal_size=16GB \
  -c checkpoint_timeout=30min \
  -c checkpoint_completion_target=0.9 \
  -c wal_compression=on \
  -c shared_buffers=8GB \
  -c work_mem=128MB \
  -c maintenance_work_mem=4GB \
  -c effective_io_concurrency=200
