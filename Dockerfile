# Apache + mod_php. Az api/index.php-t a mod_php futtatja, a statikus board-fájlokat
# (index.html, js/*, style.css, data/*.json) maga az Apache szolgálja ki.
FROM php:8.3-apache

# jq: az engine/task.sh JSON-motorja (a PHP write-endpoint ezt hívja). A bash a Debian-alapú
# php:apache image-ben már benne van — az alpine-nal ellentétben nem kell telepíteni.
RUN apt-get update \
 && apt-get install -y --no-install-recommends jq \
 && rm -rf /var/lib/apt/lists/*

# A konténer a HOST user UID:GID-jével fut (lásd docker-compose.yml `user:`), ezért az Apache
# NEM root: privilegizált (<1024) portot nem tud kötni. A CTM_PORT default 3333, és a
# `ctm up <port>` is 1024 fölötti portot vár — az Apache ezen a porton figyel, a
# /var/{run,log,lock}/apache2 pedig az image-ben már 1777, így a pid/log írás UID-független.
ENV CTM_PORT=3333

# A `Listen 80` az egyetlen hely, ami a Debian-configban fixen a 80-at kötné. A sed egyes
# aposztrófjai KELLENEK: enélkül a build shellje oldaná fel a ${CTM_PORT}-ot, és a portot
# beégetnénk az image-be — így viszont az Apache oldja fel indításkor, a konténer env-jéből.
RUN sed -ri 's/^Listen 80$/Listen ${CTM_PORT}/' /etc/apache2/ports.conf \
 && echo 'ServerName localhost' > /etc/apache2/conf-enabled/servername.conf
COPY docker/apache.conf /etc/apache2/sites-available/000-default.conf

WORKDIR /app
COPY . /app
RUN chmod +x /app/engine/task.sh /app/engine/projects.sh

EXPOSE 3333

# CMD nincs: az image alapértelmezett `apache2-foreground` parancsa indítja a szervert.
