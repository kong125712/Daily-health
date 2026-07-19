FROM node:24-alpine

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/package.json
RUN pnpm install --frozen-lockfile --prod --filter @daily-health/server...

COPY server server
ENV NODE_ENV=production
EXPOSE 8787
CMD ["pnpm", "--filter", "@daily-health/server", "start"]
