## Make sure below docker containers are running
### Steampipe service
```
docker run -d   --name steampipe-service   --restart unless-stopped   -p 8001:8001   -e STEAMPIPE_SERVICE_TOKEN='e739b1599f1f5589b3c745b41f34f218db94451f9e462e273515b90c374a0404'   -e STEAMPIPE_INSTALL_DIR='/home/steampipe/.steampipe'   -e STEAMPIPE_WORKSPACES_DIR='/home/steampipe/workspaces'   -e PLATFORM_CREDENTIAL_SOURCE='Ec2InstanceMetadata'   cloud-service
```
### postgresql
```
 docker run -d   --name postgres   -e POSTGRES_USER=postgresuser   -e POSTGRES_PASSWORD=Password123!   -e POSTGRES_DB=finopsdb   -p 127.0.0.1:5432:5432   -v postgres_data:/var/lib/postgresql/data   --restart unless-stopped   postgres:16-alpine
 ```
 ### redis
 ```
  docker run -d   --name redis   -p 127.0.0.1:6379:6379   -v redis_data:/data   --restart unless-stopped   redis:7-alpine redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
  ```
  
### Enter below commands to activate the venv and run the server
  ```source venv/bin/activate```
  ```pip install -r requirements.txt```
  ```python3 -m venv venv```
  ```uvicorn app.main:app --reload```
  ```sudo apt update && sudo apt install python3.14-venv -y```

### setup the migrations or db

  ```alembic init alembic```
  Adding below in alembic.ini is not mandatory
  ```sqlalchemy.url = postgresql://<username>:<password>@localhost:5432/<database_name>```
  ```Edit the env.py file in alembic```
  ```alembic revision --autogenerate -m "initial migration"```
  ```alembic upgrade head```
### verify the tables

  ```docker exec -it postgres /bin/bash```
  or
  ```docker exec -it postgres psql -U finopsuser -d finopsdb```
  To list the users->```\d users```
  To list DB's->```\l```
  To list all tables->```\dt```
  To switch DB's->```\c dbname```
  To query ->```SELECT * FROM users WHERE email ILIKE '%@gmail.com';```
  For extended->```\x```
  To quit->```\q```

### Run celery
  ```celery -A app.tasks.celery_app worker --loglevel=info```

### Check the celery tasks
  open redis cli->```docker exec -it redis redis-cli -n 1```
  ```KEYS *```
  ```LLEN celery```
  ```LRANGE celery 0 -1```
  Check how many keys are in Database 1 (-n 1)->```docker exec -it redis redis-cli -n 1 dbsize```
  Check which databases have data->```docker exec -it redis redis-cli info keyspace```
  To get the length of tasks->```docker exec -it redis redis-cli LLEN celery```
  To get the keys->```docker exec -it redis redis-cli KEYS "*"```
  View the 5 pending tasks```docker exec -it redis redis-cli LRANGE celery 0 4```
  To open interactive shell```docker exec -it my-redis-container redis-cli```
  or
  ```pip install flower```
  ```celery -A app.tasks.celery_app flower```
  ```http://127.0.0.1:5555```

### Trigger or run a celery task manually
   ```celery -A app.tasks.celery_app:celery_app call pricing.refresh_cache```