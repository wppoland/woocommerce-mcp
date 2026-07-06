# Minimal image for the read-only WooCommerce MCP server (stdio transport).
# Build: docker build -t woocommerce-mcp .
# Run:   docker run -i --rm -e WP_URL=... -e WC_CONSUMER_KEY=... -e WC_CONSUMER_SECRET=... woocommerce-mcp
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# MCP server speaks JSON-RPC over stdio.
ENTRYPOINT ["node", "dist/index.js"]
