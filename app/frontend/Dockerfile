# ═══════════════════════════════════════════════════════════════
# FRONTEND ACTIVOS: Dockerfile Multi-Stage de Producción
# Etapa 1: Build con Node.js  →  Etapa 2: Servir con Nginx
# ═══════════════════════════════════════════════════════════════

# ─── ETAPA 1: BUILD ──────────────────────────────────────────
FROM node:18-alpine AS builder
WORKDIR /app

# Instalar pnpm para instalaciones rápidas y seguras
RUN npm install -g pnpm@8

COPY package.json ./
RUN pnpm install

COPY . .

# Build de producción con Vite
RUN pnpm run build

# ─── ETAPA 2: SERVIR ─────────────────────────────────────────
FROM nginx:alpine

# Copiar los archivos compilados al directorio de Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copiar configuración personalizada de Nginx (SPA fallback)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
