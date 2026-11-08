# 启动本地 Docker Engine + OpenDream Cloud 整栈（数据在 D 盘 WSL 发行版内）
$ErrorActionPreference = "Stop"

Write-Host "[1/3] 启动 WSL Docker Engine ..."
wsl -d opencode-docker -u root -- sh -c "pgrep dockerd >/dev/null || (nohup dockerd >/var/log/dockerd.log 2>&1 &); sleep 6; docker info --format 'Docker {{.ServerVersion}} root={{.DockerRootDir}}'"

Write-Host "[2/3] 启动 Compose 栈（首次会构建镜像，约 5-10 分钟）..."
wsl -d opencode-docker -u root -- sh -c "cd /mnt/d/opencode/deploy/local && docker compose up -d --build"

Write-Host "[3/3] 状态"
wsl -d opencode-docker -u root -- sh -c "cd /mnt/d/opencode/deploy/local && docker compose ps"
Write-Host "控制台: http://localhost:3000  控制面: http://localhost:4000  工作区: http://localhost:4096"
