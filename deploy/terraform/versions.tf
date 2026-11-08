terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aliyun = {
      source  = "aliyun/alicloud"
      version = "~> 1.230"
    }
  }

  # 生产建议使用 OSS 远端状态；本地验证可改为 local。
  # backend "oss" {
  #   bucket = "opendream-cloud-tfstate"
  #   prefix = "prod/ack"
  # }
}

provider "aliyun" {
  region = var.region
}
