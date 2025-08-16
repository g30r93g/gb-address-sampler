# ---- Build stage ----
FROM node:22-alpine AS builder
WORKDIR /app

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy manifests first for better layer caching
COPY package.json pnpm-lock.yaml ./

# Install all deps for build (dev + prod)
RUN pnpm install --frozen-lockfile

# Copy sources and build with esbuild
COPY tsconfig.json ./
COPY build.mjs ./
COPY src ./src
RUN node build.mjs

# Prune node_modules to production-only
RUN pnpm prune --prod

# ---- Runtime stage ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy pruned production deps and built output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json pnpm-lock.yaml ./

# (Optional) drop privileges
# RUN adduser -D appuser && chown -R appuser:appuser /app
# USER appuser

# Default: API server; override for worker
CMD ["node", "dist/server.js"]
