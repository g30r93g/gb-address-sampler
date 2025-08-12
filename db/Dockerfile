FROM postgis/postgis:16-3.4

# Optional: tools you want in the db container
RUN apt-get update \
  && apt-get install -y --no-install-recommends gdal-bin \
  && rm -rf /var/lib/apt/lists/*

# First-boot SQL (still runs via official entrypoint)
COPY ./00-postgis.sql /docker-entrypoint-initdb.d/00-postgis.sql

# Startup script to prep tmpfs and then exec the official entrypoint
COPY ./startup-script.sh /usr/local/bin/startup-script.sh
RUN chmod +x /usr/local/bin/startup-script.sh

ENTRYPOINT ["/usr/local/bin/startup-script.sh"]
