# backend/Dockerfile

FROM node:20-bullseye AS build
WORKDIR /app

COPY backend/package*.json ./
RUN npm ci

COPY backend/ ./

FROM node:20-bullseye
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app /app

RUN npm ci --omit=dev

EXPOSE 3333
CMD ["npm", "start"]
