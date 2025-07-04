# Build stage for nri-mysql
FROM golang:1.23-alpine AS builder

WORKDIR /build

# Install build dependencies
RUN apk add --no-cache git make

# Clone and build nri-mysql
RUN git clone --depth=1 --branch v1.10.7 \
    https://github.com/newrelic/nri-mysql.git . && \
    go build -o bin/nri-mysql ./src/...

# Final stage
FROM newrelic/infrastructure:latest

# Copy the built nri-mysql binary
COPY --from=builder /build/bin/nri-mysql /var/db/newrelic-infra/newrelic-integrations/
RUN chmod 755 /var/db/newrelic-infra/newrelic-integrations/nri-mysql