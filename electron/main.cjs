const { app, BrowserWindow, dialog, shell } = require("electron");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");

const isDev = process.argv.includes("--dev");
const devServerUrl = "http://localhost:5173/";
let mainWindow = null;
let windowUrl = null;

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => {
      probe.close(() => resolve(true));
    });
    probe.listen(port, "0.0.0.0");
  });
}

function findRandomPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "0.0.0.0", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 8787;
      probe.close(() => resolve(port));
    });
  });
}

async function pickPort(preferred) {
  if (await isPortFree(preferred)) return preferred;
  return findRandomPort();
}

async function startEmbeddedServer() {
  const { startServer } = require(path.join(__dirname, "..", "server", "index.cjs"));
  const preferred = Number(process.env.SYNCWAVE_PORT ?? 8787);
  const port = await pickPort(preferred);
  try {
    return await startServer(port);
  } catch (error) {
    if (error && error.code === "EADDRINUSE") {
      return startServer(await findRandomPort());
    }
    throw error;
  }
}

function createWindow(url) {
  windowUrl = url;
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 920,
    minWidth: 960,
    minHeight: 680,
    backgroundColor: "#07070d",
    title: "SYNCWAVE",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith("http://") || target.startsWith("https://")) {
      void shell.openExternal(target);
    }
    return { action: "deny" };
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    if (isDev) {
      void dialog.showMessageBox({
        type: "error",
        title: "SYNCWAVE",
        message: "Could not reach the Vite dev server.",
        detail: `${description} (${code}). Start it with "npm run dev" and relaunch "npm run desktop:dev".`,
      });
    }
  });

  void mainWindow.loadURL(url);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.setAppUserModelId("com.syncwave.desktop");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    try {
      if (!isDev && !fs.existsSync(path.join(__dirname, "..", "dist", "index.html"))) {
        await dialog.showMessageBox({
          type: "error",
          title: "SYNCWAVE",
          message: "The production UI bundle is missing.",
          detail: 'Run "npm run build" before starting the desktop app.',
        });
        app.quit();
        return;
      }

      const port = await startEmbeddedServer();
      createWindow(isDev ? devServerUrl : `http://localhost:${port}/`);
    } catch (error) {
      await dialog.showMessageBox({
        type: "error",
        title: "SYNCWAVE failed to start",
        message: String((error && error.message) || error),
      });
      app.quit();
    }
  });

  app.on("activate", () => {
    if (!mainWindow && windowUrl) createWindow(windowUrl);
  });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
