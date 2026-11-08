// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const engine = require("./engine.cjs");

let mainWindow;
let localWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 900,
    minHeight: 640,
    title: "OpenDream Code",
    backgroundColor: "#0b1020",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  void mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function openLocal(url) {
  if (localWindow && !localWindow.isDestroyed()) {
    localWindow.focus();
    return;
  }
  localWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "OpenDream Code · 本地工作台",
    backgroundColor: "#0b1020",
  });
  void localWindow.loadURL(url);
}

app.whenReady().then(() => {
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("desktop:config", async () => {
  const config = await engine.loadConfig(app.getPath("userData"));
  return { apiUrl: config.apiUrl, deviceId: config.deviceId, paired: Boolean(config.token), consoleUrl: config.consoleUrl };
});

ipcMain.handle("desktop:pick-dir", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory", "createDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("desktop:pair", async (_event, input) => {
  const config = await engine.pair(input.apiUrl, input.code, input.name, process.platform, app.getPath("userData"));
  return config;
});

ipcMain.handle("desktop:bootstrap", async (_event, input) => {
  const config = await engine.loadConfig(app.getPath("userData"));
  return engine.bootstrap(config, input.workspaceDir);
});

ipcMain.handle("desktop:start", async (_event, input) => {
  const config = await engine.loadConfig(app.getPath("userData"));
  const url = await engine.startLocalEngine(config, input.workspaceDir);
  return { url };
});

ipcMain.handle("desktop:open-local", async (_event, url) => {
  openLocal(url);
});

ipcMain.handle("desktop:open-external", async (_event, url) => {
  await shell.openExternal(url);
});
