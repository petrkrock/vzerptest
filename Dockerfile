# ============================================================
# ВСЕМЗАПЧАСТИ CRM — production image
# ============================================================
# Builds the Vite/React app and serves the static output with nginx.
#
# Build:
#   docker build \
#     --build-arg VITE_SUPABASE_URL=https://yourproject.supabase.co \
#     --build-arg VITE_SUPABASE_ANON_KEY=your-anon-key \
#     -t vz-crm .
#
# Run:
#   docker run -d -p 8080:80 --name vz-crm vz-crm
#
# (Vite env vars are baked into the static bundle at BUILD time, not read
# at container start — this is normal for client-side apps. If you need to
# change them, rebuild the image. See README.md for details and for the
# docker-compose alternative that reads them from .env automatically.)

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

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
# Демо-режим (данные в localStorage, вход admin@admin.com / admin123).
# Передавать --build-arg VITE_DEMO_MODE=true ТОЛЬКО для демонстрации, не для прода.
ARG VITE_DEMO_MODE
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
ENV VITE_DEMO_MODE=${VITE_DEMO_MODE}

RUN npm run build

# ── Runtime stage ────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
