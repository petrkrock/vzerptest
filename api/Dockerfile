# ═══════════════════════════════════════════════════════════════════════════
# VZ ERP API — multi-stage Dockerfile (v1.32.1)
# Пока package-lock.json нет — используем npm install; после первого локального
# установочного прогона lockfile коммитим и переводим обе стадии на npm ci.
# ═══════════════════════════════════════════════════════════════════════════

# ─── build ──────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
COPY package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── prod ───────────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 3000
USER node
CMD ["node", "dist/main.js"]
