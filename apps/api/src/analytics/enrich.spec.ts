import { classifyChannel, parseDevice, parseBrowser, parseOs } from "./enrich";

describe("classifyChannel", () => {
  it("paid from utm_medium cpc", () => {
    expect(classifyChannel(undefined, { utmMedium: "cpc" })).toBe("paid");
  });
  it("email from utm_medium email", () => {
    expect(classifyChannel(undefined, { utmMedium: "email" })).toBe("email");
  });
  it("social from a facebook referrer", () => {
    expect(classifyChannel("https://m.facebook.com/", {})).toBe("social");
  });
  it("organic from a google referrer", () => {
    expect(classifyChannel("https://www.google.com/search?q=x", {})).toBe("organic");
  });
  it("referral from any other referrer", () => {
    expect(classifyChannel("https://someblog.example/post", {})).toBe("referral");
  });
  it("direct when there is no referrer and no utm", () => {
    expect(classifyChannel(undefined, {})).toBe("direct");
  });
});

describe("UA parsing", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17.0 Mobile Safari/604";
  const win = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537 Chrome/120 Safari/537";
  it("device", () => {
    expect(parseDevice(iphone)).toBe("mobile");
    expect(parseDevice(win)).toBe("desktop");
    expect(parseDevice(undefined)).toBe("desktop");
  });
  it("browser + os", () => {
    expect(parseBrowser(win)).toBe("Chrome");
    expect(parseOs(win)).toBe("Windows");
    expect(parseOs(iphone)).toBe("iOS");
  });
});
