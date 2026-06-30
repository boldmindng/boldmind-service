# Local Redis Cluster Guide (WSL2)

Use these commands in your WSL terminal to manage the three local Redis instances for your Session, Queue, and Cache databases.

## 🚀 Start All Servers

Run this command to start all three instances in the background:

```bash
sudo redis-server ~/redis-local/redis_session.conf && \
sudo redis-server ~/redis-local/redis_queue.conf && \
sudo redis-server ~/redis-local/redis_cache.conf
```

## 🛑 Stop All Servers

Run this command to safely save data and shut down all three instances:

```bash
redis-cli -p 6379 shutdown && \
redis-cli -p 6380 shutdown && \
redis-cli -p 6381 shutdown
```

*Alternative (Force stop everything):*
```bash
sudo killall redis-server
```

## 🔍 Check Server Status

Verify which ports are active and listening:

```bash
ss -antpl | grep redis
```

### Quick Ping Test
```bash
redis-cli -p 6379 ping && redis-cli -p 6380 ping && redis-cli -p 6381 ping
```
*(Expected output: Three lines of `PONG`)*
