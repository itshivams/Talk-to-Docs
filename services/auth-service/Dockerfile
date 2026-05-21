FROM golang:1.23-alpine AS builder

WORKDIR /app
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o auth-service .

FROM alpine:3.21
WORKDIR /app
COPY --from=builder /app/auth-service /app/auth-service
EXPOSE 8081
CMD ["/app/auth-service"]
