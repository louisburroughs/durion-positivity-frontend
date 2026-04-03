# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare npm@11.6.4 --activate
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable && corepack prepare npm@11.6.4 --activate
USER node
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package*.json ./
RUN npm ci --omit=dev
ENV PORT=4000
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/durion-positivity-frontend/server/server.mjs"]
