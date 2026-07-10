docker rm -f register-bot-1
docker build -t register-bot .
docker run --name register-bot-1 -d register-bot