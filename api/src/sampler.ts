// src/sampler.ts
import { Job } from 'bullmq';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { GeocodedAddress, geocodeUPRN } from './geocoder';

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';
const redis = createClient({ url: REDIS_URL });
await redis.connect();

const pg = new Pool({
  connectionString: process.env.DATABASE_URL,
});

type UprnRecord = {
  uprn: string;
  lat: number;
  lon: number;
};

const MAX_ATTEMPTS = 20;

export async function sampler(job: Job) {
  const { polygon, n } = job.data;
  const jobId = job.id!;
  const found = new Map<string, GeocodedAddress>();
  const tried = new Set<string>();
  let attempt = 0;

  console.log(`[${jobId}] Sampler started. Target: ${n} addresses.`);

  // Step 1: intersect polygon with built_up_areas
  console.log(`[${jobId}] Intersecting polygon with built_up_areas...`);
  const buaResult = await pg.query(
    `WITH input27700 AS (
      SELECT ST_Transform(
        ST_SetSRID(ST_GeomFromGeoJSON($1), 4326),
        27700
      ) AS g
     )
     SELECT ST_AsGeoJSON(
       ST_Transform(ST_Intersection(b.geom, i.g), 4326)
     ) AS clipped_geom
     FROM built_up_areas b, input27700 i
     WHERE ST_Intersects(b.geom, i.g);`,
    [JSON.stringify(polygon)]
  );

  if (buaResult.rows.length === 0) {
    const errMsg = 'No built-up areas intersect with the supplied polygon.';
    console.error(`[${jobId}] ${errMsg}`);
    await redis.publish(`error:${jobId}`, JSON.stringify({ jobId, type: 'error', error: errMsg }));
    throw new Error(errMsg);
  }

  const clippedGeoms: string[] = buaResult.rows.map((r) => r.clipped_geom);
  console.log(`[${jobId}] Found ${clippedGeoms.length} intersecting built-up area geometries.`);

  while (found.size < n && attempt < MAX_ATTEMPTS) {
    attempt++;
    console.log(`[${jobId}] Attempt ${attempt}: Found ${found.size}/${n} addresses so far.`);

    const needed = n - found.size;
    const uprnsToTry: UprnRecord[] = [];

    // Step 2: sample UPRNs inside each clipped geometry
    for (const [idx, geom] of clippedGeoms.entries()) {
      console.log(`[${jobId}] Sampling UPRNs from geometry ${idx + 1}/${clippedGeoms.length}...`);
      const res = await pg.query<UprnRecord>(
        `
        WITH clip27700 AS (
          SELECT ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326), 27700) AS g
        ),
        candidates AS (
          SELECT uprn, ST_Transform(a.geom, 4326) AS g
          FROM uprns a
          CROSS JOIN clip27700 c
          WHERE ST_Within(a.geom, c.g)
          ORDER BY RANDOM()
          LIMIT $2
        )
        SELECT uprn, ST_Y(g) AS lat, ST_X(g) AS lon FROM candidates
        `,
        [geom, Math.ceil(needed / clippedGeoms.length)]
      );

      console.log(`[${jobId}] Got ${res.rows.length} UPRNs from geometry ${idx + 1}.`);
      for (const row of res.rows) {
        if (!tried.has(row.uprn)) {
          uprnsToTry.push(row);
          tried.add(row.uprn);
        }
      }
    }

    console.log(`[${jobId}] Trying to geocode ${uprnsToTry.length} UPRNs...`);
    for (let i = 0; i < uprnsToTry.length && found.size < n; i++) {
      const record = uprnsToTry[i];
      console.log(`[${jobId}] Geocoding UPRN: ${record.uprn} (${i + 1}/${uprnsToTry.length})`);
      const geocoded = await geocodeUPRN(record.uprn);
      if (geocoded) {
        found.set(record.uprn, geocoded);
        console.log(`[${jobId}] Geocoded UPRN: ${record.uprn} successfully.`);
      } else {
        console.log(`[${jobId}] Failed to geocode UPRN: ${record.uprn}.`);
      }

      await redis.publish(
        `progress:${jobId}`,
        JSON.stringify({
          jobId,
          type: 'progress',
          currentStep: `Geocoded ${found.size}/${n} valid addresses`,
          progress: Math.round((found.size / n) * 100),
        })
      );

      // throttle to respect OS Places
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  if (found.size < n) {
    const errMsg = `Could not find ${n} deliverable addresses after ${attempt} attempts`;
    console.error(`[${jobId}] ${errMsg}`);
    await redis.publish(`error:${jobId}`, JSON.stringify({ jobId, type: 'error', error: errMsg }));
    throw new Error(errMsg);
  }

  const result = Array.from(found.values());

  console.log(`[${jobId}] Completed. Found ${result.length} addresses.`);
  await redis.publish(
    `complete:${jobId}`,
    JSON.stringify({
      jobId,
      type: 'complete',
      result,
    })
  );

  return result;
}
