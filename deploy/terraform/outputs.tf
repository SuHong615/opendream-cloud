output "ack_cluster_id" {
  value = aliyun_cs_managed_kubernetes.main.id
}

output "ack_kubeconfig" {
  value     = aliyun_cs_managed_kubernetes.main.kube_config
  sensitive = true
}

output "vpc_id" {
  value = aliyun_vpc.main.id
}

output "vswitch_ids" {
  value = aliyun_vswitch.main[*].id
}

output "rds_connection" {
  value = aliyun_db_instance.pg.connection_string
}

output "redis_connection" {
  value = aliyun_kvstore_instance.redis.connection_domain
}

output "oss_bucket" {
  value = aliyun_oss_bucket.artifacts.bucket
}

output "acr_instance" {
  value = aliyun_cr_ee_instance.main.instance_name
}
