FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
# RUN apk add --no-cache python3 build-base # Remove if not needed
RUN npm install

ARG PORT=3000
ENV PORT=${PORT}

COPY . .

# ***CRITICAL: Create directory and copy newrelic.yml***
RUN mkdir -p /etc/newrelic
COPY newrelic.yml /etc/newrelic/

EXPOSE ${PORT}

HEALTHCHECK --interval=5s --timeout=3s --start-period=120s --retries=3 CMD curl -f http://localhost:${PORT}/health || exit 1

# ***CRITICAL: Use -r newrelic***
CMD ["node", "-r", "newrelic", "--max-old-space-size=2048", "app.js"]
