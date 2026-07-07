FROM php:8.3-cli-alpine

RUN apk add --no-cache bash jq

WORKDIR /app
COPY . /app
RUN chmod +x /app/engine/task.sh /app/engine/projects.sh

EXPOSE 3333

CMD ["php", "-S", "0.0.0.0:3333", "-t", "/app"]
