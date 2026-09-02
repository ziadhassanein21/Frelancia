FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

ENV PORT=3000
ENV NODE_ENV=production
ENV SCRAPE_INTERVAL_MS=15000

EXPOSE 3000

CMD ["node", "server.js"]
