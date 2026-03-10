FROM node:20-slim

ENV NODE_ENV=production

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl ffmpeg python3 \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*

# Install app dependencies
COPY package.json pnpm-lock.yaml ./
RUN npm install --omit=dev

# Copy source
COPY . .

CMD ["node", "src/index.js"]
