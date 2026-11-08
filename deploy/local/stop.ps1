# 停止本地 OpenDream Cloud（保留数据卷）
$ErrorActionPreference = "Stop"
wsl -d opencode-docker -u root -- sh -c "cd /mnt/d/opencode/deploy/local && docker compose down"
Write-Host "已停止（数据卷保留；Docker Engine 仍在运行，可 wsl --shutdown 关闭）"
