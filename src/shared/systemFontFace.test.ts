import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildListedSystemFonts,
  buildSystemFontFaceCss,
  familyNamesToRawFaces,
  type RawSystemFontFace,
} from "./systemFontFace.ts";

function face(
  partial: Partial<RawSystemFontFace> & Pick<RawSystemFontFace, "family">,
): RawSystemFontFace {
  return {
    family: partial.family,
    style: partial.style ?? "",
    postscriptName: partial.postscriptName ?? "",
    localNames: partial.localNames ?? [],
    weight: partial.weight ?? 0,
    italic: partial.italic ?? false,
  };
}

describe("buildListedSystemFonts", () => {
  it("keeps a single-face family as the family name", () => {
    const listed = buildListedSystemFonts([
      face({ family: "Arial Black", style: "Regular", postscriptName: "Arial-Black" }),
    ]);
    assert.deepEqual(listed, [{ name: "Arial Black", locals: [] }]);
  });

  it("splits weights and orders them from thin to bold", () => {
    const listed = buildListedSystemFonts([
      face({
        family: "PingFang SC",
        style: "Semibold",
        postscriptName: "PingFangSC-Semibold",
        weight: 8,
      }),
      face({
        family: "PingFang SC",
        style: "Regular",
        postscriptName: "PingFangSC-Regular",
        weight: 5,
      }),
      face({
        family: "PingFang SC",
        style: "Light",
        postscriptName: "PingFangSC-Light",
        weight: 3,
      }),
      face({
        family: "PingFang SC",
        style: "Thin",
        postscriptName: "PingFangSC-Thin",
        weight: 3,
      }),
      face({
        family: "PingFang SC",
        style: "Ultralight",
        postscriptName: "PingFangSC-Ultralight",
        weight: 2,
      }),
      face({
        family: "PingFang SC",
        style: "Medium",
        postscriptName: "PingFangSC-Medium",
        weight: 6,
      }),
    ]);
    assert.deepEqual(
      listed.map((item) => item.name),
      [
        "PingFang SC 极细",
        "PingFang SC 纤细",
        "PingFang SC 细体",
        "PingFang SC 常规",
        "PingFang SC 中黑",
        "PingFang SC 中粗",
      ],
    );
    const light = listed.find((item) => item.name === "PingFang SC 细体");
    assert.deepEqual(light?.locals, ["PingFangSC-Light", "PingFang SC"]);
  });

  it("keeps an already localized style name", () => {
    const listed = buildListedSystemFonts([
      face({
        family: "思源黑体",
        style: "常规",
        postscriptName: "SourceHanSansSC-Regular",
        weight: 400,
      }),
      face({
        family: "思源黑体",
        style: "粗体",
        postscriptName: "SourceHanSansSC-Bold",
        weight: 700,
      }),
      face({
        family: "思源黑体",
        style: "细体",
        postscriptName: "SourceHanSansSC-Light",
        weight: 300,
      }),
    ]);
    assert.deepEqual(
      listed.map((item) => item.name),
      ["思源黑体 细体", "思源黑体 常规", "思源黑体 粗体"],
    );
  });

  it("labels bold italic separately and after the upright face", () => {
    const listed = buildListedSystemFonts([
      face({
        family: "Arial",
        style: "Bold Italic",
        postscriptName: "Arial-BoldItalic",
        italic: true,
        weight: 700,
      }),
      face({
        family: "Arial",
        style: "Bold",
        postscriptName: "Arial-Bold",
        weight: 700,
      }),
      face({
        family: "Arial",
        style: "Regular",
        postscriptName: "Arial-Regular",
        weight: 400,
      }),
    ]);
    assert.deepEqual(
      listed.map((item) => item.name),
      ["Arial 常规", "Arial 粗体", "Arial 粗体 斜体"],
    );
  });

  it("sorts unknown style names such as W3/W6 by numeric weight", () => {
    const listed = buildListedSystemFonts([
      face({
        family: "Hiragino Sans GB",
        style: "W6",
        postscriptName: "HiraginoSansGB-W6",
        weight: 8,
      }),
      face({
        family: "Hiragino Sans GB",
        style: "W3",
        postscriptName: "HiraginoSansGB-W3",
        weight: 4,
      }),
    ]);
    assert.deepEqual(
      listed.map((item) => item.name),
      ["Hiragino Sans GB W3", "Hiragino Sans GB W6"],
    );
  });

  it("falls back to one family when faces cannot be pinned", () => {
    const listed = buildListedSystemFonts(
      familyNamesToRawFaces(["PingFang SC", "Songti SC", "PingFang SC"]),
    );
    assert.deepEqual(listed, [
      { name: "PingFang SC", locals: [] },
      { name: "Songti SC", locals: [] },
    ]);
  });

  it("does not override the family name when a face has no distinct label", () => {
    const listed = buildListedSystemFonts([
      face({ family: "Demo", style: "", postscriptName: "Demo-A", weight: 1 }),
      face({ family: "Demo", style: "", postscriptName: "Demo-B", weight: 2 }),
    ]);
    assert.deepEqual(listed, [{ name: "Demo", locals: [] }]);
  });
});

describe("buildSystemFontFaceCss", () => {
  it("pins only faces that have local names", () => {
    const css = buildSystemFontFaceCss([
      { name: "PingFang SC", locals: [] },
      { name: 'PingFang SC 细体', locals: ["PingFangSC-Light", 'PingFang SC "Light"'] },
    ]);
    assert.equal(css.includes("font-family:\"PingFang SC\";"), false);
    assert.match(css, /font-family:"PingFang SC 细体"/);
    assert.match(css, /local\("PingFangSC-Light"\)/);
    assert.match(css, /local\("PingFang SC \\"Light\\""\)/);
    assert.match(css, /font-weight:normal/);
  });
});
