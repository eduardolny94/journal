# Imagen de producción: compila el cliente y sirve API + cliente con Node (node:sqlite, sin módulos nativos).
# La base de datos y las imágenes viven en /app/server/data (monta ahí un volumen persistente).
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --workspaces --include-workspace-root
COPY . .
RUN npm run build

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --omit=dev --workspaces --include-workspace-root && npm cache clean --force
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/docs ./docs
RUN mkdir -p /app/server/data/uploads && chown -R node:node /app
USER node
ENV PORT=3200 \
    JOURNAL_DB=/app/server/data/journal.db \
    UPLOADS_DIR=/app/server/data/uploads \
    TRUST_PROXY=1 \
    NODE_OPTIONS=--max-old-space-size=320
# El tope de memoria hace que Node libere basura antes de llegar al límite del contenedor (512 MB en el plan de prueba
# de Railway). Medido con scripts/medir-memoria.mjs: el pico real, backtest incluido, ronda los 270 MB.
EXPOSE 3200
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s CMD wget -qO- http://127.0.0.1:3200/api/health || exit 1
CMD ["node", "server/src/index.js"]
