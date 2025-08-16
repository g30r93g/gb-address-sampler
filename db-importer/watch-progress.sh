#!/usr/bin/env bash
set -euo pipefail

TABLE="uprns"
SRC="./os-data/os_open_uprn.gpkg"
LAYER="osopenuprn_address"

# --- total features in source ---
TOTAL=$(ogrinfo -al -so "$SRC" "$LAYER" | awk '/Feature Count:/ {print $3}')
TOTAL=${TOTAL:-0}
if [[ "$TOTAL" -eq 0 ]]; then
  echo "Error: Could not determine feature count."
  exit 1
fi

fmt_int() { printf "%'d" "$1" 2>/dev/null || echo "$1"; }
fmt_hms() {
  local s=$1
  if (( s < 0 )); then echo "estimating…"; return; fi
  local d=$((s/86400)); local h=$(((s%86400)/3600)); local m=$(((s%3600)/60)); local sec=$((s%60))
  if (( d > 0 )); then printf "%dd %02dh %02dm %02ds" "$d" "$h" "$m" "$sec"
  else printf "%02dh:%02dm:%02ds" "$h" "$m" "$sec"; fi
}

echo "[Progress Watcher] Monitoring '${TABLE}'..."
echo "Total source features: $(fmt_int "$TOTAL")"

START_TS=$(date +%s)
START_COUNT=$(docker compose exec -T db \
  psql -U postgres -d os_address_sampler \
  -c "SELECT COUNT(*) FROM ${TABLE};" 2>/dev/null | awk 'NR==3 {print $1}')
START_COUNT=${START_COUNT:-0}

LAST_TS=$START_TS
LAST_COUNT=$START_COUNT
EMA_RATE=0
ALPHA=0.3
UPDATE_COUNT=0
WARMUP_UPDATES=5

while true; do
  COUNT=$(docker compose exec -T db \
    psql -U postgres -d os_address_sampler \
    -c "SELECT COUNT(*) FROM ${TABLE};" 2>/dev/null | awk 'NR==3 {print $1}')
  COUNT=${COUNT:-0}

  NOW_TS=$(date +%s)
  DELTA_ROWS=$(( COUNT - LAST_COUNT ))
  DELTA_T=$(( NOW_TS - LAST_TS ))
  (( DELTA_T <= 0 )) && DELTA_T=1

  if (( UPDATE_COUNT > 0 )); then
    INST_RATE=$(awk -v r="$DELTA_ROWS" -v t="$DELTA_T" \
        'BEGIN{ if(t<=0){print 0}else{print r/t} }')
    # Smooth rate using EMA of previous EMA
    EMA_RATE=$(awk -v a="$ALPHA" -v ema="$EMA_RATE" -v inst="$INST_RATE" \
        'BEGIN{print (a*inst) + ((1-a)*ema)}')
  fi

  ELAPSED=$(( NOW_TS - START_TS ))
  PCT=$(awk -v d="$COUNT" -v t="$TOTAL" \
      'BEGIN{ if (t==0){print 0}else{printf "%.2f", (d/t)*100} }')

  if (( UPDATE_COUNT >= WARMUP_UPDATES )) && \
     awk -v r="$EMA_RATE" 'BEGIN{exit !(r > 0)}'; then
    REMAIN=$(( TOTAL > COUNT ? TOTAL - COUNT : 0 ))
    ETA_SEC=$(awk -v rem="$REMAIN" -v rate="$EMA_RATE" \
        'BEGIN{ if(rate<=0){print -1}else{printf "%.0f", rem/rate} }')
    ETA_STR=$(fmt_hms "$ETA_SEC")
  else
    ETA_STR="estimating…"
  fi

  RATE_STR=$(awk -v r="$EMA_RATE" 'BEGIN{ printf "%.0f", r }')

  printf "[%s]  %s / %s  (%s%%)  rate:%s rows/s  ETA:%s\n" \
    "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
    "$(fmt_int "$COUNT")" "$(fmt_int "$TOTAL")" "$PCT" "$RATE_STR" "$ETA_STR"

  if (( COUNT >= TOTAL )); then
    echo "[Progress Watcher] Complete. Loaded $(fmt_int "$COUNT") rows in $(fmt_hms "$ELAPSED")."
    break
  fi

  LAST_COUNT=$COUNT
  LAST_TS=$NOW_TS
  ((UPDATE_COUNT++))
  sleep 5
done

# #!/usr/bin/env bash
# set -euo pipefail

# TABLE="uprns"
# SRC="./os-data/os_open_uprn.gpkg"
# LAYER="osopenuprn_address"

# # --- total features in source ---
# TOTAL=$(ogrinfo -al -so "$SRC" "$LAYER" | awk '/Feature Count:/ {print $3}')
# TOTAL=${TOTAL:-0}
# if [[ "$TOTAL" -eq 0 ]]; then
#   echo "Error: Could not determine feature count."
#   exit 1
# fi

# fmt_int() { printf "%'d" "$1" 2>/dev/null || echo "$1"; }
# fmt_hms() {
#   local s=$1
#   if (( s < 0 )); then echo "estimating…"; return; fi
#   local d=$((s/86400)); local h=$(((s%86400)/3600)); local m=$(((s%3600)/60)); local sec=$((s%60))
#   if (( d > 0 )); then printf "%dd %02dh %02dm %02ds" "$d" "$h" "$m" "$sec"
#   else printf "%02dh:%02dm:%02ds" "$h" "$m" "$sec"; fi
# }

# echo "[Progress Watcher] Monitoring '${TABLE}'..."
# echo "Total source features: $(fmt_int "$TOTAL")"

# START_TS=$(date +%s)
# START_COUNT=$(docker compose exec -T db \
#   psql -U postgres -d os_address_sampler \
#   -c "SELECT COUNT(*) FROM ${TABLE};" 2>/dev/null | awk 'NR==3 {print $1}')
# START_COUNT=${START_COUNT:-0}

# LAST_TS=$START_TS
# LAST_COUNT=$START_COUNT
# EMA_RATE=0
# ALPHA=0.3
# UPDATE_COUNT=0
# WARMUP_UPDATES=5   # number of updates before estimating ETA

# while true; do
#   COUNT=$(docker compose exec -T db \
#     psql -U postgres -d os_address_sampler \
#     -c "SELECT COUNT(*) FROM ${TABLE};" 2>/dev/null | awk 'NR==3 {print $1}')
#   COUNT=${COUNT:-0}

#   NOW_TS=$(date +%s)
#   DELTA_ROWS=$(( COUNT - LAST_COUNT ))
#   DELTA_T=$(( NOW_TS - LAST_TS ))
#   (( DELTA_T <= 0 )) && DELTA_T=1

#   # Update EMA rate
#   if (( UPDATE_COUNT > 0 )); then
#     INST_RATE=$(awk -v r="$DELTA_ROWS" -v t="$DELTA_T" 'BEGIN{ if(t<=0){print 0}else{print r/t} }')
#     EMA_RATE=$(awk -v a="$ALPHA" -v ema="$EMA_RATE" -v inst="$INST_RATE" 'BEGIN{print (a*inst)+((1-a)*ema)}')
#   fi

#   ELAPSED=$(( NOW_TS - START_TS ))
#   PCT=$(awk -v d="$COUNT" -v t="$TOTAL" 'BEGIN{ if (t==0){print 0}else{printf "%.2f", (d/t)*100} }')

#   # ETA only after warm-up period
# if (( UPDATE_COUNT >= WARMUP_UPDATES )) && \
#    awk -v r="$EMA_RATE" 'BEGIN{exit !(r > 0)}'; then
#     REMAIN=$(( TOTAL > COUNT ? TOTAL - COUNT : 0 ))
#     ETA_SEC=$(awk -v rem="$REMAIN" -v rate="$EMA_RATE" \
#         'BEGIN{ if(rate<=0){print -1}else{printf "%.0f", rem/rate} }')
#     ETA_STR=$(fmt_hms "$ETA_SEC")
# else
#     ETA_STR="estimating…"
# fi

#   RATE_STR=$(awk -v r="$EMA_RATE" 'BEGIN{ printf "%.0f", r }')

#   printf "[%s]  %s / %s  (%s%%)  rate:%s rows/s  ETA:%s\n" \
#     "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
#     "$(fmt_int "$COUNT")" "$(fmt_int "$TOTAL")" "$PCT" "$RATE_STR" "$ETA_STR"

#   if (( COUNT >= TOTAL )); then
#     echo "[Progress Watcher] Complete. Loaded $(fmt_int "$COUNT") rows in $(fmt_hms "$ELAPSED")."
#     break
#   fi

#   LAST_COUNT=$COUNT
#   LAST_TS=$NOW_TS
#   ((UPDATE_COUNT++))
#   sleep 5
# done
