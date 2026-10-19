FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production PORT=3010 DATA_DIR=/app/data

COPY package.json server.js providers.js config.default.json ./
COPY public ./public

# La config modifiée depuis la page est enregistrée ici (à garder dans un volume)
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME /app/data

USER node
EXPOSE 3010
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3010/healthz || exit 1
CMD ["node", "server.js"]
