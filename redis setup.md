```
set up local Redis instances using WSL2 to match your .env configuration, you need to install Redis on Ubuntu (WSL) and run three separate instances on ports 6379, 6380, and 6381.Here is exactly how to do it step-by-step.1. Install Redis on WSLOpen your WSL terminal and run the following commands to install the official, latest stable version of Redis:bashsudo apt update
sudo apt install lsb-release curl gpg
curl -fsSL https://redis.io | sudo gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://redis.io $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/redis.list
sudo apt update
sudo apt install redis
Use code with caution.2. Configure Three Separate InstancesInstead of running a single Redis service, you will create three distinct configuration files for your Session, Queue, and Cache databases.Create a directory for your custom configs:bashmkdir -p ~/redis-local
Use code with caution.Create the Session Redis config (Port 6379):bashcat <<EOF > ~/redis-local/redis_session.conf
port 6379
daemonize yes
pidfile /var/run/redis_6379.pid
logfile /var/log/redis_6379.log
dbfilename dump_6379.rdb
dir ./
EOF
Use code with caution.Create the Queue Redis config (Port 6380):bashcat <<EOF > ~/redis-local/redis_queue.conf
port 6380
daemonize yes
pidfile /var/run/redis_6380.pid
logfile /var/log/redis_6380.log
dbfilename dump_6380.rdb
dir ./
EOF
Use code with caution.Create the Cache Redis config (Port 6381):bashcat <<EOF > ~/redis-local/redis_cache.conf
port 6381
daemonize yes
pidfile /var/run/redis_6381.pid
logfile /var/log/redis_6381.log
dbfilename dump_6381.rdb
dir ./
EOF
Use code with caution.3. Start the Redis InstancesLaunch all three servers by pointing the redis-server command to your new configuration files:bashsudo redis-server ~/redis-local/redis_session.conf
sudo redis-server ~/redis-local/redis_queue.conf
sudo redis-server ~/redis-local/redis_cache.conf
Use code with caution.(Note: Because daemonize yes is set, these commands will instantly run in the background).4. Verify They Are RunningCheck if all three ports are actively listening on your WSL machine:bashss -antpl | grep redis
Use code with caution.You can also ping each individual instance using the Redis CLI tool:redis-cli -p 6379 ping (Should return PONG)redis-cli -p 6380 ping (Should return PONG)redis-cli -p 6381 ping (Should return PONG)5. Update Your .env FileComment out your Upstash cloud URLs and uncomment your local WSL connections:env# Cloud Testing (Upstash)
# REDIS_SESSION_URL=rediss://default:...

# True Local Dev (WSL2)
REDIS_SESSION_URL=redis://127.0.0.1:6379
REDIS_QUEUE_URL=redis://127.0.0.1:6380
REDIS_CACHE_URL=redis://127.0.0.1:6381
Use code with caution.WSL2 automatically shares its localhost network with your Windows host machine, so your application will connect seamlessly using 127.0.0.1.

o safely shut down your background Redis instances, you can stop them directly using the Redis CLI tool or by terminating their processes.Here are the quickest ways to do it.Method 1: The Clean Way (Recommended)Send a shutdown command to each specific port using redis-cli. This ensures all data is saved properly before closing:bashredis-cli -p 6379 shutdown
redis-cli -p 6380 shutdown
redis-cli -p 6381 shutdown
Use code with caution.Method 2: The Fast Way (One-Liner)If you want to kill all running Redis servers instantly in a single command, run:bashsudo killall redis-server
Use code with caution.Method 3: Stop the Default WSL ServiceIf you also started the default system service by accident during installation, you can stop it using:bashsudo service redis-server stop
Use code with caution.