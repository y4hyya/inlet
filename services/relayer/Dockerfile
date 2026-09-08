FROM node:24-alpine AS build
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY config ./config
COPY packages/sdk/package.json ./packages/sdk/package.json
COPY packages/widget/package.json ./packages/widget/package.json
COPY apps/mcp/package.json ./apps/mcp/package.json
COPY UI/package.json ./UI/package.json
COPY services/relayer/package.json ./services/relayer/package.json
RUN pnpm install --frozen-lockfile --filter @inletkit/relayer...
COPY packages/sdk ./packages/sdk
COPY services/relayer ./services/relayer
RUN pnpm --filter @inletkit/sdk build && pnpm --filter @inletkit/relayer build

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo ./
RUN mkdir -p /data
EXPOSE 8787
CMD ["node", "services/relayer/dist/src/index.js"]
