FROM node:22-alpine AS builder

RUN npm install -g pnpm@8.15.0

WORKDIR /

# 👇 accept token from build args
ARG NODE_AUTH_TOKEN

# 👇 configure npm auth
RUN echo "@boldmindng:registry=https://npm.pkg.github.com" >> .npmrc \
 && echo "//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}" >> .npmrc

COPY /package.json ./


RUN cat package.json

RUN pnpm install --no-frozen-lockfile 


COPY / .

RUN npx prisma generate

RUN pnpm exec nest build

# ---- Production stage ----
FROM node:22-alpine

WORKDIR /

COPY --from=builder  dist ./dist
COPY --from=builder /package.json ./package.json
COPY --from=builder /prisma ./prisma
COPY --from=builder /node_modules ./node_modules


EXPOSE 4001

CMD ["node", "dist/main"]