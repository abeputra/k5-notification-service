FROM node:20-alpine

RUN apk add --no-cache wget

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN mkdir -p logs

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["node", "src/index.js"]
