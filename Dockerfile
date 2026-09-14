# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY server/package*.json ./server/
RUN npm ci --prefix server --omit=dev
COPY server/ ./server/
COPY index.html ./index.html
COPY js ./js
COPY icons ./icons
COPY manifest.json ./manifest.json
COPY sw.js ./sw.js
COPY data ./data
COPY pdfs ./pdfs
COPY openapi.yaml ./openapi.yaml
RUN mkdir -p server/data && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["npm", "--prefix", "server", "start"]
