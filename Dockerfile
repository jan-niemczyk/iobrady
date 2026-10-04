# Node 22 LTS (Node 20 nie jest już wspierany). Instalacja WYŁĄCZNIE z package-lock.json (npm ci).
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Fonty Lato do PDF (pdfmake) są w repozytorium: public/fonts (licencja SIL OFL 1.1, Lato-OFL.txt).
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
RUN apk add --no-cache libc6-compat openssl tzdata
ENV TZ=Europe/Warsaw
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# Kopiujemy całe node_modules z buildera - zawiera wszystkie zależności tranzytywne
# potrzebne do prisma db push i tsx (np. 'effect' wymagane przez @prisma/config).
# Nadpisuje minimalistyczne node_modules z Next.js standalone, ale uzupełnia o CLI.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
# Katalogi zapisu (wolumeny): nowy pusty wolumen przejmuje właściciela z obrazu, więc aplikacja
# (użytkownik nextjs) może zapisywać logo/obrazy planszy i załączniki.
RUN mkdir -p /app/public/uploads /app/storage/attachments && chown -R nextjs:nodejs /app/public/uploads /app/storage
# Migracja bazy przy starcie (scripts/migrate.sh) i jej zależność (szyfrowanie sekretów).
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/secretBox.ts ./src/lib/secretBox.ts
COPY --from=builder --chown=nextjs:nodejs /app/tsconfig.json ./tsconfig.json

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
