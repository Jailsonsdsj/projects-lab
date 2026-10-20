import { describe, expect, it } from "vitest";
import { driveFileId, drivePreviewUrl } from "./drive";

const ID = "1aBcD_eFgHiJ-kLmNoPqRsTuVwXyZ012";

describe("Drive links", () => {
  it("takes the file ID from the two accepted shapes", () => {
    expect(
      driveFileId(`https://drive.google.com/file/d/${ID}/view?usp=sharing`),
    ).toBe(ID);
    expect(driveFileId(`https://drive.google.com/file/d/${ID}`)).toBe(ID);
    expect(driveFileId(`https://drive.google.com/file/d/${ID}/preview`)).toBe(
      ID,
    );
    expect(driveFileId(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
    expect(
      driveFileId(`  https://drive.google.com/open?id=${ID}&usp=drive_fs `),
    ).toBe(ID);
  });

  it("refuses every other link", () => {
    for (const bad of [
      `http://drive.google.com/file/d/${ID}/view`,
      `https://docs.google.com/file/d/${ID}/view`,
      `https://drive.google.com.evil.example/file/d/${ID}/view`,
      `https://evil.example/?u=https://drive.google.com/file/d/${ID}`,
      `https://drive.google.com/drive/folders/${ID}`,
      `https://drive.google.com/open?id=`,
      "https://drive.google.com/file/d/short/view",
      `https://drive.google.com/file/d/${ID}%2F..%2Fx/view`,
      "https://youtu.be/dQw4w9WgXcQ",
      "not a link",
      "",
    ])
      expect(driveFileId(bad)).toBeNull();
  });

  it("builds Drive's player URL from an ID only", () => {
    expect(drivePreviewUrl(ID)).toBe(
      `https://drive.google.com/file/d/${ID}/preview`,
    );
    expect(() => drivePreviewUrl("../x")).toThrow(RangeError);
  });
});
