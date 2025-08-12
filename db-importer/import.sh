#!/usr/bin/env bash
set -euo pipefail

echo "[DB-Importer] Starting import script..."

# Config
export PGPASSWORD="${PGPASSWORD:-postgres}"
PGURL="postgresql://postgres:${PGPASSWORD}@db:5432/os_address_sampler"

# Wait for DB
until psql "$PGURL" -v ON_ERROR_STOP=1 -c '\q' >/dev/null 2>&1; do
  echo "[DB-Importer] Waiting for PostgreSQL to be ready..."
  sleep 2
done
echo "[DB-Importer] PostgreSQL is ready."

# Show what files are visible to this container
ls -lah /data || true

echo "[DB-Importer] Detecting layers..."
ogrinfo -ro -so /data/os_open_built_up_areas.gpkg || true
ogrinfo -ro -so /data/os_open_uprn.gpkg || true

echo "[DB-Importer] Importing 'OS Open Built Up Areas' dataset..."
ogr2ogr -progress -gt 65000 -f PostgreSQL \
  "PG:user=postgres password=${PGPASSWORD} dbname=os_address_sampler host=db" \
  -a_srs EPSG:27700 \
  /data/os_open_built_up_areas.gpkg os_open_built_up_areas \
  -nln built_up_areas \
  -nlt PROMOTE_TO_MULTI \
  -lco GEOMETRY_NAME=geom \
  -overwrite
echo "[DB-Importer] 'OS Open Built Up Areas' dataset imported."

echo "[DB-Importer] Importing 'OS Open UPRN' dataset..."
ogr2ogr -progress -gt 65000 -f PostgreSQL \
  "PG:user=postgres password=${PGPASSWORD} dbname=os_address_sampler host=db" \
  -a_srs EPSG:27700 \
  /data/os_open_uprn.gpkg osopenuprn_address \
  -nln uprns \
  -nlt POINT \
  -lco GEOMETRY_NAME=geom \
  -overwrite
echo "[DB-Importer] 'OS Open UPRN' dataset imported."

echo "[DB-Importer] Import complete."
