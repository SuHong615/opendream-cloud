variable "region" {
  type        = string
  description = "阿里云地域，如 cn-hangzhou"
  default     = "cn-hangzhou"
}

variable "name_prefix" {
  type        = string
  description = "资源名前缀"
  default     = "opendream-cloud"
}

variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

variable "zone_ids" {
  type        = list(string)
  description = "至少 2 个可用区；ACK 节点池与 RDS/Redis 使用"
  default     = ["cn-hangzhou-i", "cn-hangzhou-j", "cn-hangzhou-k"]
}

variable "k8s_version" {
  type    = string
  default = "1.30"
}

variable "system_node" {
  type = object({ instance_type = string, desired = number, min = number, max = number })
  default = {
    instance_type = "ecs.g7.2xlarge" # 8C32G
    desired       = 2
    min           = 2
    max           = 4
  }
}

variable "workspace_node" {
  type = object({ instance_type = string, desired = number, min = number, max = number })
  description = "4C8G 工作区节点池：32C128G × 4 工作区/节点（保守）"
  default = {
    instance_type = "ecs.g7.8xlarge" # 32C128G
    desired       = 2
    min           = 1
    max           = 64
  }
}

variable "sandbox_node" {
  type = object({ instance_type = string, desired = number, min = number, max = number })
  default = {
    instance_type = "ecs.g7.4xlarge"
    desired       = 1
    min           = 0
    max           = 8
  }
}

variable "rds" {
  type = object({ instance_class = string, storage_gb = number, engine_version = string })
  default = {
    instance_class = "pg.n2.2c.2m" # 4C8G 级，生产按容量模调整
    storage_gb     = 200
    engine_version = "16.0"
  }
}

variable "redis" {
  type = object({ instance_class = string, capacity_gb = number })
  default = {
    instance_class = "redis.master.small.default"
    capacity_gb    = 8
  }
}

variable "oss_bucket_name" {
  type        = string
  description = "全局唯一；用于 Skill/应用构建产物/审计归档"
  default     = "opendream-cloud-artifacts"
}

variable "tags" {
  type    = map(string)
  default = { project = "opendream-cloud", managed_by = "terraform" }
}
