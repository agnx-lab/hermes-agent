/**
 * 场景：桌面子 App Panel — G6 electron-module 绿屏槽（host.guest.mountElectronModule）。
 * Tab 内容区须贴边：禁止外层再包 Unistyles/padding（否则 guest host 四周留 24px）。
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactElement } from "react";
import type { WorkspaceAppHostApi } from "@agnx-lab/app-sdk";

const APP_ID = "hermes-agent";
const APP_TITLE = "Hermes Agent";
const PANEL_ID = "hermes.main";
const OPEN_COMMAND_ID = "hermes.open";

const WEB_ROOT_STYLE: CSSProperties = {
  flex: "1 1 0%",
  alignSelf: "stretch",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  position: "relative",
};

const GUEST_HOST_STYLE: CSSProperties = {
  flex: "1 1 auto",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  height: "100%",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  position: "relative",
};

const WEB_MESSAGE_STYLE: CSSProperties = {
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
  background: "rgba(9,9,11,0.92)",
};

let boundHost: WorkspaceAppHostApi | null = null;

function getHost(): WorkspaceAppHostApi {
  if (!boundHost) {
    throw new Error(`${APP_TITLE} host 未绑定`);
  }
  return boundHost;
}

export function bindVendorHarnessHost(host: WorkspaceAppHostApi): void {
  boundHost = host;
}

export function GuestElectronModulePanel(): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState("正在挂载 electron-module…");

  useEffect(() => {
    const host = getHost();
    const guest = host.guest;
    if (!guest?.mountElectronModule) {
      setStatus("宿主未提供 guest.mountElectronModule（需 Agnx 桌面端 G6.1+）");
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
      },
    });
    return unmount;
  }, []);

  return (
    <div style={WEB_ROOT_STYLE} aria-label={`${APP_TITLE} panel`}>
      <div
        ref={hostRef}
        data-agnx-guest-module-host="true"
        data-testid={`workspace-mini-app-${APP_ID.replace(/\./g, "-")}-root`}
        style={GUEST_HOST_STYLE}
      />
      {status ? <div style={WEB_MESSAGE_STYLE}>{status}</div> : null}
    </div>
  );
}

export function activate(host: WorkspaceAppHostApi): () => void {
  bindVendorHarnessHost(host);
  const disposers: Array<() => void> = [];

  disposers.push(
    host.registerMiniApp({
      id: PANEL_ID,
      appId: APP_ID,
      title: APP_TITLE,
      component: GuestElectronModulePanel,
    }),
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
          currentPathname: context?.currentPathname,
        });
      },
    }),
  );

  return () => {
    for (const d of disposers.toReversed()) d();
  };
}
