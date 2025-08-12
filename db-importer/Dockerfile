FROM ghcr.io/osgeo/gdal:ubuntu-small-3.9.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client \
  && rm -rf /var/lib/apt/lists/*

COPY import.sh /usr/local/bin/import.sh
RUN chmod +x /usr/local/bin/import.sh

ENTRYPOINT ["/usr/local/bin/import.sh"]
