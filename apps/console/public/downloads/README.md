# 桌面端安装包分发

门户下载地址：`/downloads/OpenDreamCode-Setup.exe`。

安装包体积约 100MB，**不提交到 Git**（`.gitignore` 已忽略 `*.exe`）。构建与发布：

```bash
cd apps/desktop
npm install
npm run dist:win
cp "dist/OpenDreamCode-Setup-0.1.0.exe" ../console/public/downloads/OpenDreamCode-Setup.exe
```

生产环境建议把安装包上传到企业制品库 / GitHub Release / CDN，再把门户下载链接指向制品地址；或由 IT 统一分发。
