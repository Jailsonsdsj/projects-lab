import { describe, expect, it } from "vitest";
import {
  endNotBeforeStart,
  isPhotoType,
  isProfileDate,
  PHOTO_MAX_BYTES,
  photoKey,
} from "./profile";

describe("profile dates", () => {
  it("accepts YYYY and YYYY-MM only", () => {
    for (const good of ["2020", "2020-01", "2020-12", "1999-09"])
      expect(isProfileDate(good)).toBe(true);
    for (const bad of [
      "20",
      "2020-1",
      "2020-00",
      "2020-13",
      "2020-01-05",
      "2020/01",
      " 2020",
      "",
    ])
      expect(isProfileDate(bad)).toBe(false);
  });

  it("compares months only when both dates have one", () => {
    expect(endNotBeforeStart("2020-05", "2020-05")).toBe(true);
    expect(endNotBeforeStart("2020-05", "2020-06")).toBe(true);
    expect(endNotBeforeStart("2020-05", "2020-04")).toBe(false);
    expect(endNotBeforeStart("2020-05", "2020")).toBe(true);
    expect(endNotBeforeStart("2020", "2020-01")).toBe(true);
    expect(endNotBeforeStart("2020-12", "2021-01")).toBe(true);
    expect(endNotBeforeStart("2021-01", "2020-12")).toBe(false);
    expect(endNotBeforeStart("2021", "2020-12")).toBe(false);
  });

  it("refuses a malformed date either side", () => {
    expect(endNotBeforeStart("2020-13", "2021")).toBe(false);
    expect(endNotBeforeStart("2020", "soon")).toBe(false);
  });
});

describe("profile photo", () => {
  it("accepts JPEG, PNG and WebP up to 2 MB", () => {
    expect(PHOTO_MAX_BYTES).toBe(2_097_152);
    expect(isPhotoType("image/webp")).toBe(true);
    for (const bad of ["image/gif", "image/svg+xml", "image/JPEG", ""])
      expect(isPhotoType(bad)).toBe(false);
  });

  it("keys the photo by type", () => {
    expect(photoKey("image/jpeg")).toBe("profile/photo.jpg");
    expect(photoKey("image/png")).toBe("profile/photo.png");
    expect(photoKey("image/webp")).toBe("profile/photo.webp");
  });
});
