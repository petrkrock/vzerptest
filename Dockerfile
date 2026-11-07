# ============================================================
# VZ ERP — production image фронта (Vite/React → nginx)
# ============================================================
# Build:  docker build --build-arg VITE_API_URL=https://api.example.ru -t vz-erp .
# VITE_API_URL вшивается в бандл при СБОРКЕ (смена = пересборка). Фронт сам API не проксирует —
# адрес API (https://api.example.ru) обязателен.
# В Coolify: добавьте VITE_API_URL в Environment Variables как Build Variable.

# ── Build stage ─────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies first (better layer caching)
# Install dependencies first (better layer caching). No package-lock.json
# is committed — the dependency list was trimmed down to only what the app
# actually uses (see README.md), so any prior lockfile would reference
# dozens of removed packages and fail a strict `npm ci`. `npm install`
# generates a fresh one on first build; commit it afterwards if you want
# fully reproducible builds going forward.
COPY package.json ./
RUN npm install

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# ── Runtime stage ────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.inc /etc/nginx/security-headers.inc
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
