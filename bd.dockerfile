# Imagen base oficial de PostgreSQL
FROM postgres:16

# Variables de entorno para inicializar la base
ENV POSTGRES_USER=usuario
ENV POSTGRES_PASSWORD=secreto
ENV POSTGRES_DB=mi_base

# Opcional: copiar scripts de inicialización
# Estos se ejecutan automáticamente al crear el contenedor
COPY init.sql /docker-entrypoint-initdb.d/
