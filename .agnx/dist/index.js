var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// .agnx/src/index.ts
var index_exports = {};
__export(index_exports, {
  activate: () => activate
});
module.exports = __toCommonJS(index_exports);

// .agnx/src/panel.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var APP_ID = "hermes-agent";
var APP_TITLE = "Hermes Agent";
var PANEL_ID = "hermes.main";
var OPEN_COMMAND_ID = "hermes.open";
var WEB_ROOT_STYLE = {
  flex: "1 1 0%",
  alignSelf: "stretch",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  position: "relative"
};
var GUEST_HOST_STYLE = {
  flex: "1 1 auto",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  position: "relative"
};
var WEB_MESSAGE_STYLE = {
  position: "absolute",
  inset: 0,
  zIndex: 1,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  color: "#a1a1aa",
  fontSize: 14,
  textAlign: "center",
  background: "rgba(9,9,11,0.92)"
};
var boundHost = null;
function getHost() {
  if (!boundHost) {
    throw new Error(`${APP_TITLE} host \u672A\u7ED1\u5B9A`);
  }
  return boundHost;
}
function bindVendorHarnessHost(host) {
  boundHost = host;
}
function GuestElectronModulePanel() {
  const hostRef = (0, import_react.useRef)(null);
  const [status, setStatus] = (0, import_react.useState)("\u6B63\u5728\u6302\u8F7D electron-module\u2026");
  (0, import_react.useEffect)(() => {
    const host = getHost();
    const guest = host.guest;
    if (!guest?.mountElectronModule) {
      setStatus("\u5BBF\u4E3B\u672A\u63D0\u4F9B guest.mountElectronModule\uFF08\u9700 Agnx \u684C\u9762\u7AEF G6.1+\uFF09");
      return;
    }
    const container = hostRef.current;
    if (!container) {
      return;
    }
    const unmount = guest.mountElectronModule({
      container,
      ensureArgs: ["--supervised"],
      onReady: () => {
        setStatus("");
      },
      onError: (detail) => {
        setStatus(detail.message);
      }
    });
    return unmount;
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: WEB_ROOT_STYLE, "aria-label": `${APP_TITLE} panel`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "div",
      {
        ref: hostRef,
        "data-agnx-guest-module-host": "true",
        "data-testid": `workspace-mini-app-${APP_ID.replace(/\./g, "-")}-root`,
        style: GUEST_HOST_STYLE
      }
    ),
    status ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: WEB_MESSAGE_STYLE, children: status }) : null
  ] });
}
function activate(host) {
  bindVendorHarnessHost(host);
  const disposers = [];
  disposers.push(
    host.registerMiniApp({
      id: PANEL_ID,
      appId: APP_ID,
      title: APP_TITLE,
      component: GuestElectronModulePanel
    })
  );
  disposers.push(
    host.registerCommand({
      id: OPEN_COMMAND_ID,
      appId: APP_ID,
      title: APP_TITLE,
      run: (context) => {
        host.openSubAppTab({
          appId: APP_ID,
          panelId: PANEL_ID,
          serverId: context?.serverId,
          workspaceId: context?.workspaceId,
          currentPathname: context?.currentPathname
        });
      }
    })
  );
  return () => {
    for (const d of disposers.toReversed()) d();
  };
}
