docker rm -f register-bot-1
docker built -t register-bot .
docker run --name register-bot-1 -d register-bot