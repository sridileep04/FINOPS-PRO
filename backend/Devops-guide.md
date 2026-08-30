# Devops setup guide

# 1. Backend Docker image
## docker-entrypoint.sh make it executable
``` chmod +x backend/docker-entrypoint.sh ```

## Build & test it standalone (no compose needed)
```
cd backend
docker build -t finops-backend:local .
docker run --rm -p 8000:8000 --env-file ../.env finops-backend:local
```

# 2. Frontend Docker image