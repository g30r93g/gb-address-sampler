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

# Check if 'built_up_areas' table already exists, otherwise import
if psql "$PGURL" -tAc "SELECT to_regclass('public.built_up_areas')" | grep -q 'built_up_areas'; then
  echo "[DB-Importer] Table 'built_up_areas' already exists. Skipping import."
else
  echo "[DB-Importer] Importing 'OS Open Built Up Areas' dataset..."

  FEATURE_COUNT=$(ogrinfo -al -so ./data/os_open_built_up_areas.gpkg os_open_built_up_areas \
  | grep "Feature Count" \
  | awk '{print $3}')

  FORMATTED=$(printf "%'d" "$FEATURE_COUNT")
  echo "'os_open_built_up_areas' has $FORMATTED features."

  ogr2ogr -progress -gt 50000 -f PostgreSQL \
    --config PG_USE_COPY YES \
    --config GDAL_CACHEMAX 8192 \
    "PG:user=postgres password=${PGPASSWORD} dbname=os_address_sampler host=db" \
    -a_srs EPSG:27700 \
    /data/os_open_built_up_areas.gpkg os_open_built_up_areas \
    -nln built_up_areas \
    -nlt PROMOTE_TO_MULTI \
    -lco GEOMETRY_NAME=geom \
    -overwrite
  echo "[DB-Importer] 'OS Open Built Up Areas' dataset imported."
fi
# Check if 'uprns' table already exists, otherwise import
if psql "$PGURL" -tAc "SELECT to_regclass('public.uprns')" | grep -q 'uprns'; then
  echo "[DB-Importer] Table 'uprns' already exists. Skipping import."
else
  echo "[DB-Importer] Importing 'OS Open UPRN' dataset..."

  FEATURE_COUNT=$(ogrinfo -al -so ./data/os_open_uprn.gpkg osopenuprn_address \
  | grep "Feature Count" \
  | awk '{print $3}')

  FORMATTED=$(printf "%'d" "$FEATURE_COUNT")
  echo "'osopenuprn_address' has $FORMATTED features."

  # Create the table structure without data
  ogr2ogr -f PostgreSQL \
    "PG:user=postgres password=${PGPASSWORD} dbname=os_address_sampler host=db" \
    -nln uprns \
    -nlt POINT \
    -lco GEOMETRY_NAME=geom \
    -sql "SELECT * FROM osopenuprn_address WHERE 0=1" \
    -dialect sqlite \
    ./data/os_open_uprn.gpkg osopenuprn_address

  # Now make it unlogged
  psql "$PGURL" -tAc "ALTER TABLE uprns SET UNLOGGED;"

  # Perform data import
  ogr2ogr -progress -gt 50000 -f PostgreSQL \
    --config PG_USE_COPY YES \
    --config GDAL_CACHEMAX 8192 \
    "PG:user=postgres password=${PGPASSWORD} dbname=os_address_sampler host=db" \
    -a_srs EPSG:27700 \
    /data/os_open_uprn.gpkg osopenuprn_address \
    -nln uprns \
    -nlt POINT \
    -lco GEOMETRY_NAME=geom \
    -overwrite

  # Now make it logged
  psql "$PGURL" -c "ALTER TABLE uprns SET LOGGED;"

  echo "[DB-Importer] 'OS Open UPRN' dataset imported."
fi

echo "[DB-Importer] Import complete."
