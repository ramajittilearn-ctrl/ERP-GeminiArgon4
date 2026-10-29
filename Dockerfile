# =============================================================================
# Taky Apartment ERP — Production Dockerfile for Local LAN Deployment
# Repository: ramajittilearn-ctrl/ERP-GeminiArgon4
# =============================================================================
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

FROM base AS deps
COPY package.json ./
RUN npm install

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/operations ./operations
COPY --from=builder /app/prototype ./prototype

RUN mkdir -p /app/uploads /app/backups

EXPOSE 3000
CMD ["npm", "run", "start"]
