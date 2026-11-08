# NATS JetStream 生产集群（OpenDream 事件总线）

## 拓扑

- 3 节点 NATS + JetStream，跨 3 个可用区/主机；
- 每节点持久卷 ≥ 50Gi；
- 客户端通过内网 DNS / LoadBalancer 接入；
- 控制面 `NATS_URL=nats://nats-0.nats:4222,...`。

## 关键配置

```conf
server_name: nats-1
listen: 0.0.0.0:4222
http: 0.0.0.0:8222

jetstream {
  store_dir: "/data/jetstream"
  max_mem_store: 1GB
  max_file_store: 50GB
}

cluster {
  name: opendream
  listen: 0.0.0.0:6222
  routes: [
    nats-route://nats-0.nats:6222
    nats-route://nats-1.nats:6222
    nats-route://nats-2.nats:6222
  ]
}
```

## 初始化 Stream / Consumer

```bash
nats stream add OPENDREAM_EVENTS \
  --subjects "opendream.>" \
  --storage file --replicas 3 --retention limits \
  --max-age 7d --discard old

nats consumer add OPENDREAM_EVENTS outbox-worker \
  --pull --deliver all --ack explicit --max-deliver 10 \
  --backoff 1s,5s,30s,5m
```

- 失败消息进入 DLQ：`OPENDREAM_DLQ`；
- 控制面 `/outbox` 页面可查看失败事件并重放（本地 outbox 表）；
- 生产建议开启 NATS account/JWT 与 TLS。

## 验证

```bash
nats server check
nats stream report
nats consumer report OPENDREAM_EVENTS
```

## 故障处理

| 现象 | 处理 |
| --- | --- |
| 单节点宕机 | 3 副本自动选主，客户端重连 |
| 磁盘满 | 扩容 PVC / 调整 max-age / 清理旧流 |
| 消费堆积 | 增加 outbox worker / 提升 `max_ack_pending` |
| 消息重复 | 消费端按 `event.id` 幂等 |
