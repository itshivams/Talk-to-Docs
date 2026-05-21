FROM golang:1.23-alpine AS builder

WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o session-service .

FROM alpine:3.21
WORKDIR /app
COPY --from=builder /app/session-service /app/session-service
EXPOSE 8082
CMD ["/app/session-service"]
