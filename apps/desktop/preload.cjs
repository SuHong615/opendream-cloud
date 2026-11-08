// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("opendream", {
  config: () => ipcRenderer.invoke("desktop:config"),
  pickDir: () => ipcRenderer.invoke("desktop:pick-dir"),
  pair: (input) => ipcRenderer.invoke("desktop:pair", input),
  bootstrap: (input) => ipcRenderer.invoke("desktop:bootstrap", input),
  start: (input) => ipcRenderer.invoke("desktop:start", input),
  openLocal: (url) => ipcRenderer.invoke("desktop:open-local", url),
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url),
});
