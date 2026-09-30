# +1 Speed Titan Escape backend - image for Bloxity Legion.
# Legion injects PORT (2567), NODE_ENV, CLIENT_ORIGIN, JWT_SECRET, MONGODB_URI, ...
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# Legion requires a non-root user; the official image ships `node`.
USER node
EXPOSE 2567
CMD ["node", "src/index.js"]
