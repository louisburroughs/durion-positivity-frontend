# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache git
RUN corepack enable && corepack prepare npm@11.6.4 --activate
COPY package*.json ./
COPY scripts/sdk/ ./scripts/sdk/
RUN corepack npm ci
COPY . .
RUN if [ ! -d .sdk-src ]; then git clone --depth 1 https://github.com/louisburroughs/durion-positivity-sdk-angular.git .sdk-src; fi
ENV DURION_SDK_ANGULAR_PATH=/app/.sdk-src
RUN npm run build

# Stage 2: Runtime
FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable && corepack prepare npm@11.6.4 --activate
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/scripts/sdk ./scripts/sdk
COPY --from=builder --chown=node:node /app/.sdk-tarballs ./.sdk-tarballs
RUN corepack npm ci --omit=dev
ENV DURION_SDK_TARBALL_DIR=/app/.sdk-tarballs
RUN corepack npm run sdk:install
USER node
ENV PORT=4000
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/durion-positivity-frontend/server/server.mjs"]
