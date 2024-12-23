FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

ARG PORT=3002
ENV PORT=${PORT}

COPY . .

EXPOSE ${PORT}

HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["node", "--max-old-space-size=2048", "app.js"]
