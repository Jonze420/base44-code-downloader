const appIdInput = document.getElementById("appId");
const tabStatus = document.getElementById("tabStatus");
const logBox = document.getElementById("log");
const detectBtn = document.getElementById("detectBtn");
const downloadBtn = document.getElementById("downloadBtn");
const toggleAdvanced = document.getElementById("toggleAdvanced");
const advancedPanel = document.getElementById("advancedPanel");
const pathsInput = document.getElementById("paths");
const detectPathsBtn = document.getElementById("detectPathsBtn");
const downloadByPathsBtn = document.getElementById("downloadByPathsBtn");

let activeTab = null;

const DEFAULT_PATHS = [
  ".github/workflows/ci.yml",
  ".github/workflows/dependabot-auto-merge.yml",
  ".github/dependabot.yml",
  "base44/config.jsonc",
  "src/api/base44Client.js",
  "src/components/AuthLayout.jsx",
  "src/components/ChatPanel.jsx",
  "src/components/FileMessage.jsx",
  "src/components/GlassOrbs.jsx",
  "src/components/GoogleIcon.jsx",
  "src/components/IncomingCallModal.jsx",
  "src/components/Layout.jsx",
  "src/components/LoadingScreen.jsx",
  "src/components/NetworkStatus.jsx",
  "src/components/NetworkStatusToggle.jsx",
  "src/components/ProfileSettingsModal.jsx",
  "src/components/ProtectedRoute.jsx",
  "src/components/ScrollToTop.jsx",
  "src/components/TypingIndicator.jsx",
  "src/components/UpdateBanner.jsx",
  "src/components/UserNotRegisteredError.jsx",
  "src/components/VideoPanel.jsx",
  "src/hooks/use-mobile.jsx",
  "src/hooks/use-size.jsx",
  "src/hooks/useNetworkStatus.js",
  "src/lib/app-params.js",
  "src/lib/AuthContext.jsx",
  "src/lib/fileUtils.js",
  "src/lib/PageNotFound.jsx",
  "src/lib/query-client.js",
  "src/lib/sounds.js",
  "src/lib/utils.js",
  "src/pages/DirectCall.jsx",
  "src/pages/ForgotPassword.jsx",
  "src/pages/Home.jsx",
  "src/pages/Login.jsx",
  "src/pages/MessengerApp.jsx",
  "src/pages/Register.jsx",
  "src/pages/ResetPassword.jsx",
  "src/pages/Room.jsx",
  "src/pages/ServerPage.jsx",
  "src/utils/index.ts",
  "src/App.jsx",
  "src/index.css",
  "src/main.jsx",
  ".gitignore",
  "AGENTS.md",
  "CLAUDE.md",
  "components.json",
  "eslint.config.js",
  "index.html",
  "jsconfig.json",
  "package.json",
  "postcss.config.js",
  "README.md",
  "tailwind.config.js",
  "vite.config.js"
];

init();

async function init() {
  if (typeof chrome === "undefined") {
    tabStatus.textContent = "Podgląd";
    log("To jest podgląd UI wtyczki. Załaduj jako rozszerzenie Chrome, aby pobrać kod.");
    return;
  }
  activeTab = await getActiveTab();
  const appId = extractAppId(activeTab?.url || "");
  tabStatus.textContent = appId ? "Base44" : "Brak Base44";
  if (appId) appIdInput.value = appId;
  pathsInput.value = DEFAULT_PATHS.join("\n");
  log(appId ? "Wykryto projekt z aktualnej karty." : "Otwórz kartę edytora Base44 albo wklej Project ID.");
}

detectBtn.addEventListener("click", async () => {
  activeTab = await getActiveTab();
  const appId = extractAppId(activeTab?.url || "");
  if (!appId) return log("Nie widzę ID projektu w aktywnej karcie.");
  appIdInput.value = appId;
  tabStatus.textContent = "Base44";
  log(`Project ID: ${appId}`);
});

downloadBtn.addEventListener("click", async () => {
  await withBusy(downloadBtn, async () => {
    const appId = requireAppId();
    log("Pobieram kod przez API Base44...");
    const result = await runInPage(downloadProjectFromApi, [appId]);
    if (!result.ok) {
      let paths = parsePaths(pathsInput.value);
      try {
        const detected = await runInPage(detectPathsFromPage, []);
        if (detected.paths?.length) {
          paths = detected.paths;
          pathsInput.value = paths.join("\n");
        }
      } catch {}
      log(`${result.error}\n\nBase44 blokuje bezpośredni odczyt. Przechodzę automatycznie na tryb awaryjny: ${paths.length} plików przez edytor...`);
      const fallback = await runInPage(downloadProjectByPaths, [appId, paths]);
      if (!fallback.ok) {
        log(`${fallback.error}\n\nNiepobrane:\n${(fallback.failures || []).map((x) => `- ${x.path}`).join("\n")}`);
        return;
      }
      await saveZip(fallback.files, `base44-${appId}-editor.zip`);
      const failed = fallback.failures?.length ? `\nPominięto: ${fallback.failures.length}` : "";
      log(`Gotowe fallbackiem: ${Object.keys(fallback.files).length} plików zapisanych jako ZIP.${failed}`);
      return;
    }
    await saveZip(result.files, `base44-${appId}.zip`);
    log(`Gotowe: ${Object.keys(result.files).length} plików zapisanych jako ZIP.`);
  });
});

toggleAdvanced.addEventListener("click", () => {
  advancedPanel.hidden = !advancedPanel.hidden;
});

detectPathsBtn.addEventListener("click", async () => {
  await withBusy(detectPathsBtn, async () => {
    const detected = await runInPage(detectPathsFromPage, []);
    const paths = detected.paths?.length ? detected.paths : DEFAULT_PATHS;
    pathsInput.value = paths.join("\n");
    log(`Wykryto ${paths.length} ścieżek. Możesz je poprawić przed pobraniem.`);
  });
});

downloadByPathsBtn.addEventListener("click", async () => {
  await withBusy(downloadByPathsBtn, async () => {
    const appId = requireAppId();
    const paths = parsePaths(pathsInput.value);
    if (!paths.length) throw new Error("Lista ścieżek jest pusta.");
    log(`Pobieram ${paths.length} plików przez edytor...`);
    const result = await runInPage(downloadProjectByPaths, [appId, paths]);
    if (!result.ok) {
      log(`${result.error}\n\nNiepobrane:\n${(result.failures || []).map((x) => `- ${x.path}`).join("\n")}`);
      return;
    }
    await saveZip(result.files, `base44-${appId}-editor.zip`);
    const failed = result.failures?.length ? `\nPominięto: ${result.failures.length}` : "";
    log(`Gotowe: ${Object.keys(result.files).length} plików zapisanych jako ZIP.${failed}`);
  });
});

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function extractAppId(url) {
  const match = String(url).match(/app\.base44\.com\/apps\/([^/]+)/);
  return match?.[1] || "";
}

function requireAppId() {
  const appId = appIdInput.value.trim();
  if (!/^[a-zA-Z0-9_-]{8,}$/.test(appId)) throw new Error("Wklej poprawny Project ID.");
  return appId;
}

function parsePaths(text) {
  return [...new Set(text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
}

function log(message) {
  logBox.textContent = message;
}

async function withBusy(button, task) {
  const buttons = [detectBtn, downloadBtn, detectPathsBtn, downloadByPathsBtn];
  try {
    buttons.forEach((btn) => (btn.disabled = true));
    await task();
  } catch (error) {
    log(error?.message || String(error));
  } finally {
    buttons.forEach((btn) => (btn.disabled = false));
  }
}

async function runInPage(func, args) {
  activeTab = activeTab || await getActiveTab();
  if (!activeTab?.id) throw new Error("Nie mogę odczytać aktywnej karty.");
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: activeTab.id },
    world: "MAIN",
    func,
    args
  });
  return result.result;
}

async function downloadProjectFromApi(appId) {
  try {
    const token = localStorage.getItem("base44_access_token") || localStorage.getItem("token");
    if (!token) return { ok: false, error: "Brak tokenu Base44 w tej karcie. Zaloguj się w app.base44.com." };
    const response = await fetch(`/api/apps/${appId}/code`, {
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });
    const text = await response.text();
    if (!response.ok) {
      let detail = text;
      try {
        const parsed = JSON.parse(text);
        detail = parsed.detail || parsed.message || text;
      } catch {}
      return { ok: false, error: `Base44 API: ${response.status} ${detail}` };
    }
    const payload = JSON.parse(text);
    const files = normalizeFiles(payload.files || payload);
    return { ok: true, files };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }

  function normalizeFiles(input) {
    if (Array.isArray(input)) {
      return Object.fromEntries(input.map((file) => [
        file.path || file.filePath || file.file_path || file.name,
        String(file.content ?? file.code ?? "")
      ]).filter(([path]) => path));
    }
    const out = {};
    for (const [path, value] of Object.entries(input || {})) {
      out[path] = typeof value === "string" ? value : String(value?.content ?? value?.code ?? JSON.stringify(value, null, 2));
    }
    return out;
  }
}

async function downloadProjectByPaths(_appId, paths) {
  const files = {};
  const failures = [];

  for (const path of paths) {
    try {
      files[path] = await readEditorFile(path);
    } catch (error) {
      failures.push({ path, error: error?.message || String(error) });
    }
  }

  if (!Object.keys(files).length) {
    return { ok: false, error: "Nie udało się pobrać żadnego pliku przez edytor.", failures };
  }
  return { ok: true, files, failures };

  async function readEditorFile(path) {
    const normalizedPath = normalizePath(path);
    await openPathInTree(normalizedPath);
    await waitForEditorPath(normalizedPath);
    return readEditorText();
  }

  async function openPathInTree(path) {
    const segments = normalizePath(path).split("/").filter(Boolean);
    if (!segments.length) throw new Error("Ścieżka pliku jest pusta.");

    const navigation = findNavigationRoot();
    if (!navigation) throw new Error("Nie znalazłem drzewa plików Base44.");
    let container = findTreeContainer(navigation);
    if (!container) throw new Error("Nie znalazłem zawartości drzewa plików Base44.");

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const button = findTreeButton(container, segment);
      if (!button) {
        throw new Error(`Nie znalazłem segmentu "${segment}" w drzewku plików.`);
      }

      const isLast = i === segments.length - 1;
      if (isLast) {
        if (getEditorPath().endsWith(`/${path}`)) return;
        activate(button);
        return;
      }

      if (button.getAttribute("data-state") !== "open") {
        activate(button);
      }
      container = await waitForTreeSegment(button, segments[i + 1]);
    }
  }

  async function waitForEditorPath(path) {
    const targetSuffix = `/${path}`;
    for (let i = 0; i < 60; i++) {
      if (getEditorPath().endsWith(targetSuffix)) return;
      await sleep(i < 5 ? 100 : 150);
    }
    throw new Error(`Nie udało się otworzyć pliku "${path}".`);
  }

  async function waitForTreeSegment(folderButton, segment) {
    const wanted = normalizeButtonText(segment);
    for (let i = 0; i < 30; i++) {
      const container = getFolderContents(folderButton);
      if (container) {
        const button = findTreeButton(container, wanted);
        if (button) return container;
      }
      await sleep(100);
    }
    throw new Error(`Nie pojawił się segment "${segment}" w drzewku plików.`);
  }

  function findNavigationRoot() {
    return document.querySelector('[role="navigation"]') || document.querySelector("nav");
  }

  function findTreeContainer(navigation) {
    return Array.from(navigation.querySelectorAll("div")).find((container) => {
      const nodes = Array.from(container.children);
      return nodes.length > 0 && nodes.every((node) => getNodeButton(node));
    }) || null;
  }

  function findTreeButton(container, label) {
    const wanted = normalizeButtonText(label);
    for (const node of Array.from(container.children)) {
      const button = getNodeButton(node);
      if (button && normalizeButtonText(button.textContent) === wanted && isVisible(button)) return button;
    }
    return null;
  }

  function getNodeButton(node) {
    return Array.from(node?.children || []).find((child) => child.tagName === "BUTTON") || null;
  }

  function getFolderContents(folderButton) {
    const folderNode = folderButton?.parentElement;
    return Array.from(folderNode?.children || []).filter((child) => child !== folderButton && child.tagName === "DIV").pop() || null;
  }

  function activate(button) {
    if (typeof button.click === "function") {
      button.click();
      return;
    }
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  }

  function findEditorRoot() {
    const editors = Array.from(document.querySelectorAll(".monaco-editor"));
    if (!editors.length) return null;
    return editors.find((editor) => editor.classList.contains("focused")) || editors[0];
  }

  function getEditorPath() {
    return findEditorRoot()?.dataset?.uri || "";
  }

  function readEditorText() {
    const editor = findEditorRoot();
    if (!editor) throw new Error("Nie znaleziono edytora kodu.");
    const viewLines = editor.querySelector(".view-lines");
    if (!viewLines) throw new Error("Nie udało się odczytać kodu z edytora.");
    return viewLines.innerText.replace(/\u00a0/g, " ").replace(/\r\n/g, "\n").trimEnd();
  }

  function normalizePath(value) {
    return String(value).replace(/\\/g, "/").replace(/^\/+/, "").trim();
  }

  function normalizeButtonText(value) {
    return String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

async function detectPathsFromPage() {
  const navigation = document.querySelector('[role="navigation"]') || document.querySelector("nav");
  if (!navigation) return { paths: [] };

  const root = findTreeContainer(navigation);
  if (!root) return { paths: [] };

  const paths = [];
  await collectFiles(root, []);
  return { paths: [...new Set(paths)] };

  async function collectFiles(container, parentPath) {
    const nodes = Array.from(container.children);
    for (const node of nodes) {
      const button = getNodeButton(node);
      if (!button) continue;

      const name = normalizeText(button.textContent);
      if (!name) continue;

      if (!button.hasAttribute("data-state")) {
        paths.push([...parentPath, name].join("/"));
        continue;
      }

      if (button.getAttribute("data-state") !== "open") activate(button);
      const contents = await waitForFolderContents(button);
      if (contents) await collectFiles(contents, [...parentPath, name]);
    }
  }

  function findTreeContainer(rootElement) {
    return Array.from(rootElement.querySelectorAll("div")).find((container) => {
      const nodes = Array.from(container.children);
      return nodes.length > 0 && nodes.every((node) => getNodeButton(node));
    }) || null;
  }

  function getNodeButton(node) {
    return Array.from(node?.children || []).find((child) => child.tagName === "BUTTON") || null;
  }

  function getFolderContents(folderButton) {
    const folderNode = folderButton?.parentElement;
    return Array.from(folderNode?.children || []).filter((child) => child !== folderButton && child.tagName === "DIV").pop() || null;
  }

  async function waitForFolderContents(folderButton) {
    for (let i = 0; i < 40; i++) {
      const contents = getFolderContents(folderButton);
      if (contents && (folderButton.getAttribute("data-state") === "open" || contents.children.length > 0)) return contents;
      await sleep(100);
    }
    return getFolderContents(folderButton);
  }

  function activate(button) {
    if (typeof button.click === "function") {
      button.click();
      return;
    }
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  }

  function normalizeText(value) {
    return String(value).replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

async function saveZip(files, filename) {
  const zip = createZip(files);
  const url = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
  await chrome.downloads.download({
    url,
    filename,
    saveAs: true
  });
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function createZip(files) {
  const encoder = new TextEncoder();
  const entries = Object.entries(files).map(([name, content]) => ({
    name: sanitizeZipPath(name),
    data: encoder.encode(String(content ?? ""))
  })).filter((entry) => entry.name);

  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const now = new Date();
  const dosTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | ((now.getSeconds() / 2) & 31);
  const dosDate = (((now.getFullYear() - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const localHeader = concatBytes(
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(dosTime), u16(dosDate),
      u32(crc), u32(entry.data.length), u32(entry.data.length), u16(nameBytes.length), u16(0), nameBytes
    );
    localParts.push(localHeader, entry.data);
    const centralHeader = concatBytes(
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(dosTime), u16(dosDate),
      u32(crc), u32(entry.data.length), u32(entry.data.length), u16(nameBytes.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), nameBytes
    );
    centralParts.push(centralHeader);
    offset += localHeader.length + entry.data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = concatBytes(
    u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length),
    u32(centralSize), u32(offset), u16(0)
  );
  return concatBytes(...localParts, ...centralParts, end);
}

function sanitizeZipPath(path) {
  return String(path).replace(/\\/g, "/").replace(/^\/+/, "").split("/").filter((part) => part && part !== "." && part !== "..").join("/");
}

function concatBytes(...parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function u16(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255]);
}

function u32(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
