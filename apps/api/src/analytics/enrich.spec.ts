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
  it("referral (not social) for lookalike hosts x.com / t.co substrings", () => {
    expect(classifyChannel("https://www.netflix.com/", {})).toBe("referral");
    expect(classifyChannel("https://box.com/s/abc", {})).toBe("referral");
    expect(classifyChannel("https://about.co/page", {})).toBe("referral");
  });
  it("social for the x.com and t.co shorteners themselves", () => {
    expect(classifyChannel("https://x.com/user", {})).toBe("social");
    expect(classifyChannel("https://t.co/abc", {})).toBe("social");
    expect(classifyChannel("https://twitter.com/user", {})).toBe("social");
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
