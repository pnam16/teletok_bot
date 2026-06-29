# Build stage: bundle with esbuild
FROM node:22-slim AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile --ignore-scripts && pnpm rebuild esbuild
COPY . .
RUN pnpm run build

# Run stage: bundle + production node_modules + Node + yt-dlp
FROM node:22-slim
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates ffmpeg python3 python3-pip \
  && pip3 install --break-system-packages -U yt-dlp \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --frozen-lockfile --prod --ignore-scripts
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/index.js"]
