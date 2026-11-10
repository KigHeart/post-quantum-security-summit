FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
WORKDIR /app
COPY . .
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data && chown -R app:app /data
USER app
EXPOSE 8080
CMD ["node","app/server.mjs"]
