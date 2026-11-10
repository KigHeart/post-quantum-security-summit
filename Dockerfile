FROM node:22-alpine
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p /app/app /data \
    && chown -R app:app /app /data
WORKDIR /app
COPY --chown=app:app index.html programme.html sponsors.html registration.html ./
COPY --chown=app:app styles.css refinements.css inner-pages.css script.js ./
COPY --chown=app:app app/server.mjs ./app/server.mjs
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD ["node","-e","fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node","app/server.mjs"]
