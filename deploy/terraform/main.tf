# OpenDream Cloud 路 ACK 鍩虹嚎锛圱erraform锛?#
# 瑕嗙洊锛歏PC / 浜ゆ崲鏈?/ ACK 鎵樼闆嗙兢 / 涓夎妭鐐规睜锛堢郴缁熴€佸伐浣滃尯 4C8G銆佹矙绠憋級/
#       ACR 鍛藉悕绌洪棿 / RDS PostgreSQL / Redis / OSS銆?# 璇存槑锛歍erraform 浜岃繘鍒朵笌浜戝嚟璇佷笉鍦ㄦ湰鏈猴紝鏈枃浠朵负**闈欐€佷氦浠?*锛堣 docs/05-delivery/ACCEPTANCE.md 鐨?DEGRADED锛夈€?#       鐢熶骇鎵ц鍓嶈 `terraform init && terraform plan`锛屽苟纭鍦板煙/瑙勬牸/鐧藉悕鍗曘€?
locals {
  tags = merge(var.tags, { cluster = "${var.name_prefix}-ack" })
}

resource "aliyun_vpc" "main" {
  vpc_name    = "${var.name_prefix}-vpc"
  cidr_block  = var.vpc_cidr
  description = "OpenDream Cloud"
  tags        = local.tags
}

resource "aliyun_vswitch" "main" {
  count        = length(var.zone_ids)
  vpc_id       = aliyun_vpc.main.id
  cidr_block   = cidrsubnet(var.vpc_cidr, 4, count.index)
  zone_id      = var.zone_ids[count.index]
  vswitch_name = "${var.name_prefix}-vsw-${count.index}"
  tags         = local.tags
}

resource "aliyun_cs_managed_kubernetes" "main" {
  name                      = "${var.name_prefix}-ack"
  cluster_spec              = "ack.pro.small"
  k8s_version               = var.k8s_version
  vpc_id                    = aliyun_vpc.main.id
  vswitch_ids               = aliyun_vswitch.main[*].id
  pod_cidr                  = "10.21.0.0/16"
  service_cidr              = "10.22.0.0/16"
  new_nat_gateway           = true
  enable_ssh                = false
  slb_internet_enabled      = true
  deletion_protection       = true
  tags                      = local.tags
  lifecycle { prevent_destroy = true }
}

resource "aliyun_cs_node_pool" "system" {
  cluster_id     = aliyun_cs_managed_kubernetes.main.id
  name           = "system"
  instance_types = [var.system_node.instance_type]
  vswitch_ids    = aliyun_vswitch.main[*].id
  scaling_config {
    min_size     = var.system_node.min
    max_size     = var.system_node.max
    desired_size = var.system_node.desired
  }
  system_disk_category = "cloud_essd"
  system_disk_size     = 100
  install_cloud_monitor = true
  tags                  = local.tags
}

resource "aliyun_cs_node_pool" "workspace" {
  cluster_id     = aliyun_cs_managed_kubernetes.main.id
  name           = "workspace"
  instance_types = [var.workspace_node.instance_type]
  vswitch_ids    = aliyun_vswitch.main[*].id
  scaling_config {
    min_size     = var.workspace_node.min
    max_size     = var.workspace_node.max
    desired_size = var.workspace_node.desired
  }
  system_disk_category = "cloud_essd"
  system_disk_size     = 100
  install_cloud_monitor = true
  tags                  = merge(local.tags, { pool = "workspace" })
  # 宸ヤ綔鍖?Pod 闇€瑕佸ぇ閲?PVC锛氳妭鐐规墦 label/taint 鐢?Helm 渚ф寜 pool=workspace 璋冨害銆?}

resource "aliyun_cs_node_pool" "sandbox" {
  cluster_id     = aliyun_cs_managed_kubernetes.main.id
  name           = "sandbox"
  instance_types = [var.sandbox_node.instance_type]
  vswitch_ids    = aliyun_vswitch.main[*].id
  scaling_config {
    min_size     = var.sandbox_node.min
    max_size     = var.sandbox_node.max
    desired_size = var.sandbox_node.desired
  }
  system_disk_category = "cloud_essd"
  system_disk_size     = 100
  install_cloud_monitor = true
  tags                  = merge(local.tags, { pool = "sandbox" })
}

resource "aliyun_cr_ee_instance" "main" {
  instance_name = "${var.name_prefix}-acr"
  instance_type = "Basic"
  payment_type  = "Subscription"
  period        = 1
  renew_period  = 1
}

resource "aliyun_cr_ee_namespace" "main" {
  instance_id    = aliyun_cr_ee_instance.main.id
  name           = "opencode"
  auto_create    = false
  default_visibility = "PRIVATE"
}

resource "aliyun_db_instance" "pg" {
  engine               = "PostgreSQL"
  engine_version       = var.rds.engine_version
  instance_type        = "rds.pg.n2.2c.2m"
  instance_class       = var.rds.instance_class
  instance_storage     = var.rds.storage_gb
  instance_name        = "${var.name_prefix}-pg"
  vswitch_id           = aliyun_vswitch.main[0].id
  security_ips         = ["10.20.0.0/16"]
  instance_charge_type = "Postpaid"
  tags                 = local.tags
  lifecycle { prevent_destroy = true }
}

resource "aliyun_kvstore_instance" "redis" {
  instance_class     = var.redis.instance_class
  instance_name      = "${var.name_prefix}-redis"
  vswitch_id         = aliyun_vswitch.main[1].id
  security_ips       = ["10.20.0.0/16"]
  instance_charge_type = "Postpaid"
  tags               = local.tags
}

resource "aliyun_oss_bucket" "artifacts" {
  bucket        = var.oss_bucket_name
  storage_class = "Standard"
  redundancy_type = "LRS"
  tags          = local.tags
  lifecycle { prevent_destroy = true }
}

