let tabs = [];
let currentTab = null;
let sessionCounter = 0;
let licenseCheckInterval = null;

function handleLicenseRevoked(message) {
    alert(message || "Tu licencia ya no es válida. La aplicación se reiniciará.");

    try {
        localStorage.removeItem("ms_user");
        localStorage.removeItem("ms_key");
    } catch (e) {
        console.error("Error limpiando localStorage tras revocación de licencia:", e);
    }

    window.location.reload();
}

function startLicenseHeartbeat(username, key, licenseApiUrl) {
    if (licenseCheckInterval) {
        clearInterval(licenseCheckInterval);
        licenseCheckInterval = null;
    }

    licenseCheckInterval = setInterval(async () => {
        try {
            const res = await fetch(licenseApiUrl, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({user: username, key})
            });

            const data = await res.json();

            if (!data.ok) {
                clearInterval(licenseCheckInterval);
                licenseCheckInterval = null;
                handleLicenseRevoked(data.message);
            }
        } catch (err) {
            console.warn("Error al revalidar la licencia:", err);
        }
    }, 60_000);
}

document.addEventListener("DOMContentLoaded", () => {
    const loginOverlay = document.getElementById("login-overlay");
    const loginUser = document.getElementById("login-user");
    const loginKey = document.getElementById("login-key");
    const loginBtn = document.getElementById("login-btn");
    const loginError = document.getElementById("login-error");

    const LICENSE_API_URL = "https://multisession-license-server.onrender.com/auth/validate";

    if (!loginOverlay || !loginUser || !loginKey || !loginBtn || !loginError) {
        console.error("Login elements not found in DOM");
        return;
    }

    async function validateAndUnlock(username, key) {
        try {
            loginError.textContent = "";
            loginBtn.disabled = true;
            loginBtn.textContent = "Verificando...";

            const res = await fetch(LICENSE_API_URL, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({
                    user: username,
                    key: key
                })
            });

            const data = await res.json();

            if (!data.ok) {
                loginError.textContent = data.message || "Invalid key.";
                loginBtn.disabled = false;
                loginBtn.textContent = "Entrar";
                return false;
            }

            localStorage.setItem("ms_user", username);
            localStorage.setItem("ms_key", key);

            loginOverlay.style.display = "none";
            loginError.textContent = "";
            loginBtn.disabled = false;
            loginBtn.textContent = "Entrar";

            console.log("✅ Access granted:", data);

            startLicenseHeartbeat(username, key, LICENSE_API_URL);
            return true;
        } catch (err) {
            console.error("Error validating license:", err);
            loginError.textContent = "Connection error. Try again later.";
            loginBtn.disabled = false;
            loginBtn.textContent = "Entrar";
            return false;
        }
    }

    (async () => {
        const savedUser = localStorage.getItem("ms_user");
        const savedKey = localStorage.getItem("ms_key");

        if (!savedKey) return;

        const ok = await validateAndUnlock(savedUser || "Unknown", savedKey);
        if (ok) {
            console.log("Auto-login OK para:", savedUser);
        } else {
            localStorage.removeItem("ms_user");
            localStorage.removeItem("ms_key");
        }
    })();

    loginBtn.addEventListener("click", async () => {
        const username = loginUser.value.trim() || "Unknown";
        const key = loginKey.value.trim();

        if (!username || !key) {
            loginError.textContent = "Completa ambos campos.";
            return;
        }

        await validateAndUnlock(username, key);
    });
});

const urlInput = document.getElementById("input-url");
const countInput = document.getElementById("input-count");
const createBtn = document.getElementById("btn-create");
const nativeWindowsCheckbox = document.getElementById("input-native-windows");

const tabList = document.getElementById("tab-list");
const viewContainer = document.getElementById("view-container");
const statusDiv = document.getElementById("status");

function setStatus(message, isError = false) {
    if (!statusDiv) return;
    statusDiv.textContent = message || "";
    statusDiv.classList.toggle("error", !!isError);
}

function normalizeUrl(rawUrl) {
    if (!rawUrl) return null;
    let finalUrl = rawUrl.trim();
    if (!finalUrl) return null;

    if (!/^https?:\/\//i.test(finalUrl)) {
        finalUrl = "https://" + finalUrl;
    }

    try {
        new URL(finalUrl);
        return finalUrl;
    } catch (e) {
        return null;
    }
}

function generateSessionId() {
    if (window.crypto && window.crypto.randomUUID) {
        return window.crypto.randomUUID();
    }
    return `${Date.now()}-${sessionCounter++}`;
}

function resizeWebviews() {
    if (!viewContainer) return;
    const rect = viewContainer.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    tabs.forEach(({webview}) => {
        webview.style.width = w + "px";
        webview.style.height = h + "px";
    });
}

window.addEventListener("resize", () => {
    resizeWebviews();
    tabs.forEach(({webview}) => {
        webview
            .executeJavaScript('window.dispatchEvent(new Event("resize"));')
            .catch(() => {
            });
    });
});

function createSession(url) {
    const id = generateSessionId();
    const partitionName = `persist:session-${id}`;

    const webview = document.createElement("webview");
    webview.src = url;
    webview.partition = partitionName;
    webview.id = `webview-${id}`;

    webview.style.position = "absolute";
    webview.style.top = "0";
    webview.style.left = "0";
    webview.style.border = "none";

    webview.style.opacity = "0";
    webview.style.pointerEvents = "none";
    webview.style.zIndex = "0";

    webview.addEventListener("did-start-loading", () => {
        if (currentTab === id) setStatus("Cargando...", false);
    });

    webview.addEventListener("did-stop-loading", () => {
        if (currentTab === id) setStatus("Listo.", false);
    });

    webview.addEventListener("did-fail-load", (event) => {
        if (currentTab === id) {
            setStatus(
                `Error al cargar la página (código: ${event.errorCode}).`,
                true
            );
        }
    });

    webview.addEventListener("dom-ready", () => {
        resizeWebviews();
        webview
            .executeJavaScript('window.dispatchEvent(new Event("resize"));')
            .catch(() => {
            });
    });

    viewContainer.appendChild(webview);

    const li = document.createElement("li");
    li.dataset.id = id;

    const titleSpan = document.createElement("span");
    titleSpan.textContent = "Sesión " + (tabs.length + 1);

    const closeBtn = document.createElement("button");
    closeBtn.className = "tab-close";
    closeBtn.textContent = "×";

    li.onclick = () => activateTab(id);

    closeBtn.onclick = (e) => {
        e.stopPropagation();
        closeTab(id);
    };

    li.appendChild(titleSpan);
    li.appendChild(closeBtn);
    tabList.appendChild(li);

    tabs.push({id, li, webview});

    resizeWebviews();
    activateTab(id);
}

function activateTab(id) {
    const tabData = tabs.find((t) => t.id === id);
    if (!tabData) return;

    currentTab = id;

    const rect = viewContainer.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    tabs.forEach((tab) => {
        const isActive = tab.id === id;
        tab.li.classList.toggle("active", isActive);

        if (isActive) {
            tab.webview.style.width = w + "px";
            tab.webview.style.height = h + "px";
            tab.webview.style.opacity = "1";
            tab.webview.style.pointerEvents = "auto";
            tab.webview.style.zIndex = "1";

            tab.webview
                .executeJavaScript('window.dispatchEvent(new Event("resize"));')
                .catch(() => {
                });
        } else {
            tab.webview.style.opacity = "0";
            tab.webview.style.pointerEvents = "none";
            tab.webview.style.zIndex = "0";
        }
    });
}

function closeTab(id) {
    const index = tabs.findIndex((t) => t.id === id);
    if (index === -1) return;

    const tab = tabs[index];

    if (tab.webview && tab.webview.parentNode === viewContainer) {
        viewContainer.removeChild(tab.webview);
    }
    if (tab.li && tab.li.parentNode === tabList) {
        tabList.removeChild(tab.li);
    }

    tabs.splice(index, 1);

    if (currentTab === id) {
        if (tabs.length > 0) {
            const newIndex = Math.max(0, index - 1);
            activateTab(tabs[newIndex].id);
        } else {
            currentTab = null;
            setStatus("Sin sesiones activas.");
        }
    }
}

createBtn.onclick = async () => {
    setStatus("", false);

    const rawUrl = urlInput.value;
    const finalUrl = normalizeUrl(rawUrl);

    const count = parseInt(countInput.value, 10);
    const total = Number.isFinite(count) && count > 0 ? count : 1;

    const useNativeWindows =
        nativeWindowsCheckbox && nativeWindowsCheckbox.checked;

    if (!finalUrl) {
        setStatus("URL inválida. Ejemplo: https://ejemplo.com", true);
        urlInput.focus();
        return;
    }

    if (useNativeWindows && window.electronAPI && window.electronAPI.openMultipleWindows) {
        try {
            setStatus("Abriendo ventanas nativas...", false);
            const result = await window.electronAPI.openMultipleWindows({
                url: finalUrl,
                count: total,
            });

            if (result && typeof result.message === "string") {
                setStatus(result.message, !result.ok);
            } else {
                setStatus(
                    "Se solicitó abrir ventanas nativas, pero la respuesta fue inesperada.",
                    true
                );
            }
        } catch (error) {
            console.error(error);
            setStatus(
                "Ocurrió un error al abrir las ventanas nativas. Revisa la consola.",
                true
            );
        }
        return;
    }

    createBtn.disabled = true;
    setStatus(`Creando ${total} sesión(es) en pestañas...`, false);

    try {
        for (let i = 0; i < total; i++) {
            try {
                createSession(finalUrl);
            } catch (e) {
                console.error("Error creando sesión", i + 1, e);
            }
        }
        setStatus(`Se crearon ${total} sesión(es) en pestañas.`, false);
    } catch (error) {
        console.error(error);
        setStatus(
            "Ocurrió un error al crear las sesiones. Revisa la consola.",
            true
        );
    } finally {
        createBtn.disabled = false;
    }
};
