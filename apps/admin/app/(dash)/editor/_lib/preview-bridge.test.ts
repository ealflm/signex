import { describe, it, expect } from "vitest";
import { SOURCE, createPreviewBridge, readBridgeMessage, type PreviewTargetRef } from "./preview-bridge";

const WEB_ORIGIN = "http://localhost:3062";

type Sent = { message: unknown; targetOrigin: string };

/** A stand-in for the iframe ref that records what was posted at its contentWindow. The bridge only
 *  ever touches `.current?.contentWindow?.postMessage`, so the tests can drive it with no DOM at all
 *  (this suite runs in vitest's `node` environment — there is no jsdom, by project rule). */
function fakeIframeRef() {
  const sent: Sent[] = [];
  const contentWindow = {
    postMessage(message: unknown, targetOrigin: string) {
      sent.push({ message, targetOrigin });
    },
  } as unknown as Window;
  const ref: { current: { contentWindow: Window | null } | null } = { current: { contentWindow } };
  return { sent, ref: ref as PreviewTargetRef };
}

describe("createPreviewBridge", () => {
  it("addresses EVERY outbound post to the web origin — never '*'", () => {
    const t = fakeIframeRef();
    const bridge = createPreviewBridge(t.ref, WEB_ORIGIN);

    bridge.postMode("color");
    bridge.postRefresh();
    bridge.postHighlight("hero.titleTop");
    bridge.postScrollToBlock("hero");
    bridge.postApplyEdits([{ field: "hero.image", kind: "image", url: "/a.png" }]);
    bridge.postApplyPalette(":root{--x:#fff}");

    expect(t.sent).toHaveLength(6);
    for (const s of t.sent) expect(s.targetOrigin).toBe(WEB_ORIGIN);
  });

  it("stamps every outbound post with the shared source", () => {
    const t = fakeIframeRef();
    const bridge = createPreviewBridge(t.ref, WEB_ORIGIN);
    bridge.postRefresh();
    bridge.postMode("text");
    for (const s of t.sent) expect((s.message as { source: string }).source).toBe(SOURCE);
  });

  it("speaks the wire shapes the overlay's onMessage branches on", () => {
    const t = fakeIframeRef();
    const bridge = createPreviewBridge(t.ref, WEB_ORIGIN);

    bridge.postMode("media");
    bridge.postRefresh();
    bridge.postHighlight("hero.titleTop");
    bridge.postScrollToBlock("footer");
    bridge.postApplyEdits([{ field: "hero.video", kind: "video", mp4Url: "/v.mp4" }]);
    bridge.postApplyPalette(":root{--a:#000}");

    expect(t.sent.map((s) => s.message)).toEqual([
      { source: SOURCE, type: "setMode", mode: "media" },
      { source: SOURCE, type: "refresh" },
      { source: SOURCE, type: "highlight", field: "hero.titleTop" },
      { source: SOURCE, type: "scrollToBlock", blockKey: "footer" },
      { source: SOURCE, type: "applyEdits", edits: [{ field: "hero.video", kind: "video", mp4Url: "/v.mp4" }] },
      { source: SOURCE, type: "applyPalette", css: ":root{--a:#000}" },
    ]);
  });

  it("posts an EMPTY palette css when asked to — a staged reset says '' and means it", () => {
    const t = fakeIframeRef();
    createPreviewBridge(t.ref, WEB_ORIGIN).postApplyPalette("");
    expect(t.sent[0].message).toEqual({ source: SOURCE, type: "applyPalette", css: "" });
  });

  it("re-reads the ref per post, so a REMOUNTED iframe gets the message", () => {
    // The shell holds the iframe in a ref and React swaps the element (and its contentWindow) out
    // from under it on every locale/surface change — the <iframe> is keyed. A bridge that resolved
    // the window once would address the DEAD document forever after the first navigation.
    const a = fakeIframeRef();
    const b = fakeIframeRef();
    const ref = { current: a.ref.current };
    const bridge = createPreviewBridge(ref, WEB_ORIGIN);

    bridge.postRefresh();
    ref.current = b.ref.current; // the iframe remounted
    bridge.postRefresh();

    expect(a.sent).toHaveLength(1);
    expect(b.sent).toHaveLength(1);
  });

  it("is a silent no-op while there is no iframe / no contentWindow yet", () => {
    // Every poster can fire before the iframe exists (a mode switch during the first load, say).
    for (const ref of [{ current: null }, { current: { contentWindow: null } }]) {
      const bridge = createPreviewBridge(ref, WEB_ORIGIN);
      expect(() => {
        bridge.postMode("content");
        bridge.postRefresh();
        bridge.postApplyPalette("");
      }).not.toThrow();
    }
  });
});

describe("readBridgeMessage", () => {
  const ok = { source: SOURCE, type: "ready" };

  it("accepts our own origin's bridge messages, returning the payload", () => {
    expect(readBridgeMessage({ origin: WEB_ORIGIN, data: ok }, WEB_ORIGIN)).toBe(ok);
  });

  it("rejects any other origin", () => {
    // The admin verifies origin in BOTH directions; this half is what stops any other frame the
    // browser lets talk to us from driving the editor.
    expect(readBridgeMessage({ origin: "http://evil.example", data: ok }, WEB_ORIGIN)).toBeNull();
  });

  it("compares the origin exactly — no prefix, no port slack, no scheme slack", () => {
    for (const origin of [
      "http://localhost:30620", // port that merely STARTS with ours
      "http://localhost:3062.evil.example",
      "https://localhost:3062", // same host+port, other scheme
      "http://localhost:3061", // the admin itself
      "",
      "null",
    ]) {
      expect(readBridgeMessage({ origin, data: ok }, WEB_ORIGIN)).toBeNull();
    }
  });

  it("rejects same-origin noise that isn't ours", () => {
    // The preview page runs third-party-ish scripts (GSAP/Lenis/Webflow runtime) and React DevTools
    // posts on this channel too — the source stamp is what keeps their chatter out of the handlers.
    for (const data of [
      null,
      undefined,
      "ready",
      42,
      { type: "ready" }, // no source
      { source: "react-devtools-bridge", type: "ready" },
      { source: SOURCE.toUpperCase(), type: "ready" },
    ]) {
      expect(readBridgeMessage({ origin: WEB_ORIGIN, data }, WEB_ORIGIN)).toBeNull();
    }
  });

  it("does not vet the payload beyond origin + source — the shell's branches own that", () => {
    // Every inbound branch in editor-shell re-checks its own fields (`typeof data.field === "string"`
    // …); the gate deliberately stays a gate, so a new message type needs no change here.
    const odd = { source: SOURCE, type: "somethingNew", field: 7 };
    expect(readBridgeMessage({ origin: WEB_ORIGIN, data: odd }, WEB_ORIGIN)).toBe(odd);
  });
});
