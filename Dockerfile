FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.js ./
COPY config.json ./
COPY test.js ./
COPY public/ ./public/
COPY routes/ ./routes/
COPY config.js ./
COPY logger.js ./
COPY timesheets.js ./
RUN mkdir -p data logs
EXPOSE 3000
CMD ["node", "server.js"]