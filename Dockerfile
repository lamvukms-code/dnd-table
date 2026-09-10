# syntax=docker/dockerfile:1
# One image: builds the web client, then runs the authoritative game server
# (which also serves the built client). Data lives in the /data volume.
FROM node:22-bookworm-slim

WORKDIR /app

# Install workspace deps first so this layer caches unless a manifest changes.
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY client/package.json ./client/
RUN npm ci

# Build the client (Vite → client/dist).
COPY . .
RUN npm run build && npm cache clean --force

ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    CLIENT_DIST=/app/client/dist \
    ROOM_FILE=/data/room.json \
    BESTIARY_FILE=/data/bestiary.json \
    UPLOADS_DIR=/data/uploads

VOLUME ["/data"]
EXPOSE 8787

CMD ["npm", "run", "start", "--silent"]
