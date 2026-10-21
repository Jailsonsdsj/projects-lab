import { beforeEach, describe, expect, it } from "vitest";
import { DEV_ICON, markLocalTab } from "./dev-tab";

beforeEach(() => {
  document.head.innerHTML = `
    <link rel="icon" href="/favicon.ico" sizes="48x48">
    <link rel="icon" href="/favicon.svg" sizes="any" type="image/svg+xml">
    <link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png">`;
  document.title = "Projects Lab";
});

const icons = () =>
  [...document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')].map((l) =>
    l.getAttribute("href"),
  );

describe("the local tab", () => {
  it("wears the dev icon and title on localhost, once", () => {
    expect(markLocalTab(document, "localhost")).toBe(true);
    markLocalTab(document, "localhost");
    expect(icons()).toEqual([DEV_ICON, DEV_ICON]);
    expect(document.title).toBe("Dev · Projects Lab");
    // The installed app's icon is the production one either way.
    expect(
      document
        .querySelector('link[rel="apple-touch-icon"]')
        ?.getAttribute("href"),
    ).toBe("/apple-touch-icon-180x180.png");
  });

  it("wears it from a phone on the same network too", () => {
    expect(markLocalTab(document, "192.168.0.12")).toBe(true);
    expect(markLocalTab(document, "127.0.0.1")).toBe(true);
  });

  it("leaves production as it is", () => {
    expect(
      markLocalTab(document, "projects-lab.jailson-junior36.workers.dev"),
    ).toBe(false);
    expect(icons()).toEqual(["/favicon.ico", "/favicon.svg"]);
    expect(document.title).toBe("Projects Lab");
  });
});
