FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json pnpm-lock.yaml* package-lock.json* ./
RUN npm install -g pnpm@9 && \
    if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    else npm install; fi

FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl curl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Pobierz font Lato (.ttf) do public/fonts - serwowany z własnej domeny (bez CORS) dla generatora PDF (pdfmake).
RUN mkdir -p public/fonts && \
    curl -fsSL -o public/fonts/Lato-Regular.ttf "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/lato/Lato-Regular.ttf" && \
    curl -fsSL -o public/fonts/Lato-Bold.ttf "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/lato/Lato-Bold.ttf" && \
    curl -fsSL -o public/fonts/Lato-Italic.ttf "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/lato/Lato-Italic.ttf" && \
    curl -fsSL -o public/fonts/Lato-BoldItalic.ttf "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/lato/Lato-BoldItalic.ttf" && \
    ls -la public/fonts/
RUN npx prisma generate && npm run build

FROM node:20-alpine AS runner
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

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
