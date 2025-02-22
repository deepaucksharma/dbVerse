FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
# Install Python and build-base (for compiling native modules)
RUN apk add --no-cache python3 build-base
RUN npm install

ARG PORT=3003
ENV PORT=${PORT}

COPY . .

EXPOSE ${PORT}

HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 CMD curl -f http://localhost:${PORT}/health || exit 1

CMD ["node", "--max-old-space-size=2048", "app.js"]
