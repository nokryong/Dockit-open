import { Buffer } from "node:buffer";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { strToU8, zipSync } from "fflate";

const fixtureDir = path.join(process.cwd(), "tests", "fixtures", "docx");
const pngFixturePath = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "hwpx",
  "media",
  "dockit-image-fixture.png"
);
const FIXTURE_ZIP_MTIME = new Date("1980-01-01T00:00:00.000Z");

const WORD_NS = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
].join(" ");

const REL_NS =
  'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';

const contentTypesXml = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
  '<Default Extension="xml" ContentType="application/xml"/>',
  '<Default Extension="png" ContentType="image/png"/>',
  '<Default Extension="gif" ContentType="image/gif"/>',
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
  '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>',
  "</Types>"
].join("");

const packageRelsXml = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  `<Relationships ${REL_NS}>`,
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
  "</Relationships>"
].join("");

const stylesXml = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  `<w:styles ${WORD_NS}>`,
  '<w:style w:type="paragraph" w:styleId="Normal">',
  '<w:name w:val="Normal"/>',
  "</w:style>",
  '<w:style w:type="paragraph" w:styleId="DockitFixtureHeading">',
  '<w:name w:val="heading 2"/>',
  '<w:basedOn w:val="Normal"/>',
  '<w:pPr><w:outlineLvl w:val="1"/></w:pPr>',
  '<w:rPr><w:b/></w:rPr>',
  "</w:style>",
  "</w:styles>"
].join("");

const paragraphSpacingStylesXml = stylesXml.replace(
  "</w:styles>",
  [
    '<w:style w:type="paragraph" w:styleId="DockitFixtureSpacedParagraph">',
    '<w:name w:val="Dockit spaced paragraph"/>',
    '<w:basedOn w:val="Normal"/>',
    '<w:pPr><w:spacing w:before="360" w:after="180" w:line="480" w:lineRule="exact"/></w:pPr>',
    "</w:style>",
    "</w:styles>"
  ].join("")
);

const paragraphStyleMetadataStylesXml = stylesXml.replace(
  "</w:styles>",
  [
    '<w:style w:type="paragraph" w:styleId="DockitFixtureBodyStyle">',
    '<w:name w:val="Dockit body style"/>',
    '<w:basedOn w:val="Normal"/>',
    '<w:pPr><w:jc w:val="center"/></w:pPr>',
    "</w:style>",
    '<w:style w:type="paragraph" w:styleId="DockitFixtureNamedHeading">',
    '<w:name w:val="heading 3"/>',
    '<w:basedOn w:val="DockitFixtureBodyStyle"/>',
    '<w:pPr><w:outlineLvl w:val="2"/></w:pPr>',
    "</w:style>",
    "</w:styles>"
  ].join("")
);

const paragraphTabsStylesXml = stylesXml.replace(
  "</w:styles>",
  [
    '<w:style w:type="paragraph" w:styleId="DockitFixtureTabbedParagraph">',
    '<w:name w:val="Dockit tabbed paragraph"/>',
    '<w:basedOn w:val="Normal"/>',
    '<w:pPr><w:tabs>',
    '<w:tab w:val="right" w:pos="9360" w:leader="dot"/>',
    "</w:tabs></w:pPr>",
    "</w:style>",
    '<w:style w:type="paragraph" w:styleId="DockitFixtureSpacedTabbedParagraph">',
    '<w:name w:val="Dockit spaced tabbed paragraph"/>',
    '<w:basedOn w:val="Normal"/>',
    '<w:pPr><w:spacing w:before="120" w:after="60"/><w:tabs>',
    '<w:tab w:val="center" w:pos="4680"/>',
    "</w:tabs></w:pPr>",
    "</w:style>",
    "</w:styles>"
  ].join("")
);

const characterStyleStylesXml = stylesXml.replace(
  "</w:styles>",
  [
    '<w:style w:type="character" w:styleId="DockitFixtureEmphasisChar">',
    '<w:name w:val="Dockit emphasis character"/>',
    '<w:rPr><w:i/><w:u w:val="single"/><w:color w:val="C2410C"/></w:rPr>',
    "</w:style>",
    "</w:styles>"
  ].join("")
);

const numberingXml = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  `<w:numbering ${WORD_NS}>`,
  '<w:abstractNum w:abstractNumId="1">',
  '<w:multiLevelType w:val="singleLevel"/>',
  '<w:lvl w:ilvl="0">',
  '<w:start w:val="1"/>',
  '<w:numFmt w:val="decimal"/>',
  '<w:lvlText w:val="%1."/>',
  '<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>',
  "</w:lvl>",
  "</w:abstractNum>",
  '<w:abstractNum w:abstractNumId="2">',
  '<w:multiLevelType w:val="singleLevel"/>',
  '<w:lvl w:ilvl="0">',
  '<w:start w:val="1"/>',
  '<w:numFmt w:val="bullet"/>',
  '<w:lvlText w:val="&#8226;"/>',
  '<w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>',
  '<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol"/></w:rPr>',
  "</w:lvl>",
  "</w:abstractNum>",
  '<w:num w:numId="11">',
  '<w:abstractNumId w:val="1"/>',
  '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="4"/></w:lvlOverride>',
  "</w:num>",
  '<w:num w:numId="12"><w:abstractNumId w:val="2"/></w:num>',
  "</w:numbering>"
].join("");

const relationshipXml = ({
  hyperlink = false,
  image = false,
  imageTarget = "media/dockit-image-fixture.png",
  imageTargetMode = null
} = {}) => [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  `<Relationships ${REL_NS}>`,
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
  hyperlink
    ? '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/dockit/guide" TargetMode="External"/>'
    : "",
  image
    ? `<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${imageTarget}"${imageTargetMode ? ` TargetMode="${imageTargetMode}"` : ""}/>`
    : "",
  "</Relationships>"
].join("");

const paragraph = (runs, pPr = "") =>
  `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${runs.join("")}</w:p>`;

const textRun = (text, rPr = "") =>
  `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t>${text}</w:t></w:r>`;

const hyperlinkRun = (text) =>
  `<w:hyperlink r:id="rId3">${textRun(text, "<w:u/><w:color w:val=\"0563C1\"/>")}</w:hyperlink>`;

const listPPr = (numId) =>
  `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>`;

const headingParagraph = (text) =>
  paragraph(
    [textRun(text)],
    '<w:pStyle w:val="DockitFixtureHeading"/>'
  );

const buildSectPr = ({
  type = null,
  width = "11906",
  height = "16838",
  orient = null,
  top = "1134",
  right = "1417",
  bottom = "1134",
  left = "1417",
  header = null,
  footer = null,
  gutter = null,
  columns = null,
  titlePage = false,
  pageNumberStart = null
} = {}) =>
  [
    "<w:sectPr>",
    type ? `<w:type w:val="${type}"/>` : "",
    `<w:pgSz w:w="${width}" w:h="${height}"${orient ? ` w:orient="${orient}"` : ""}/>`,
    `<w:pgMar w:top="${top}" w:right="${right}" w:bottom="${bottom}" w:left="${left}"${header !== null ? ` w:header="${header}"` : ""}${footer !== null ? ` w:footer="${footer}"` : ""}${gutter !== null ? ` w:gutter="${gutter}"` : ""}/>`,
    columns ? `<w:cols w:num="${columns.num}" w:space="${columns.space}"/>` : "",
    titlePage ? "<w:titlePg/>" : "",
    pageNumberStart ? `<w:pgNumType w:start="${pageNumberStart}"/>` : "",
    "</w:sectPr>"
  ].join("");

const defaultSectPr = buildSectPr();

const tableBorders = [
  '<w:tblBorders>',
  '<w:top w:val="single" w:sz="8" w:space="0" w:color="4B5563"/>',
  '<w:left w:val="single" w:sz="8" w:space="0" w:color="4B5563"/>',
  '<w:bottom w:val="single" w:sz="8" w:space="0" w:color="4B5563"/>',
  '<w:right w:val="single" w:sz="8" w:space="0" w:color="4B5563"/>',
  '<w:insideH w:val="single" w:sz="8" w:space="0" w:color="4B5563"/>',
  '<w:insideV w:val="single" w:sz="8" w:space="0" w:color="4B5563"/>',
  "</w:tblBorders>"
].join("");

const cellBorders = [
  '<w:tcBorders>',
  '<w:top w:val="single" w:sz="8" w:space="0" w:color="4B5563"/>',
  '<w:left w:val="single" w:sz="8" w:space="0" w:color="4B5563"/>',
  '<w:bottom w:val="single" w:sz="8" w:space="0" w:color="4B5563"/>',
  '<w:right w:val="single" w:sz="8" w:space="0" w:color="4B5563"/>',
  "</w:tcBorders>"
].join("");

const tableCell = ({
  text,
  fill,
  gridSpan = "",
  width = "",
  widthType = "dxa",
  vAlign = "",
  vMerge = "",
  extraTcPr = "",
  extraBlocks = []
}) => [
  "<w:tc>",
  "<w:tcPr>",
  width ? `<w:tcW w:w="${width}" w:type="${widthType}"/>` : "",
  gridSpan ? `<w:gridSpan w:val="${gridSpan}"/>` : "",
  vMerge === "restart" ? '<w:vMerge w:val="restart"/>' : "",
  vMerge === "continue" ? "<w:vMerge/>" : "",
  fill ? `<w:shd w:val="clear" w:fill="${fill}"/>` : "",
  vAlign ? `<w:vAlign w:val="${vAlign}"/>` : "",
  extraTcPr,
  cellBorders,
  "</w:tcPr>",
  paragraph([textRun(text)]),
  ...extraBlocks,
  "</w:tc>"
].join("");

const fixtureTable = [
  "<w:tbl>",
  `<w:tblPr>${tableBorders}</w:tblPr>`,
  "<w:tblGrid>",
  '<w:gridCol w:w="2100"/>',
  '<w:gridCol w:w="2700"/>',
  "</w:tblGrid>",
  "<w:tr>",
  tableCell({
    text: "Conversion status",
    fill: "E8F3FF",
    gridSpan: "2",
    width: "4800",
    vAlign: "center"
  }),
  "</w:tr>",
  "<w:tr>",
  tableCell({ text: "HWPX", fill: "FFFFFF", width: "2100" }),
  tableCell({ text: "DOCX", fill: "F9FAFB", width: "2700" }),
  "</w:tr>",
  "</w:tbl>"
].join("");

const fixtureMergedTable = [
  "<w:tbl>",
  `<w:tblPr>${tableBorders}</w:tblPr>`,
  "<w:tblGrid>",
  '<w:gridCol w:w="1800"/>',
  '<w:gridCol w:w="2400"/>',
  '<w:gridCol w:w="3000"/>',
  "</w:tblGrid>",
  "<w:tr>",
  tableCell({
    text: "Merged schedule",
    fill: "DDEBFF",
    gridSpan: "3",
    width: "7200",
    vAlign: "center"
  }),
  "</w:tr>",
  "<w:tr>",
  tableCell({
    text: "Phase A",
    fill: "FEF3C7",
    width: "1800",
    vMerge: "restart",
    vAlign: "center"
  }),
  tableCell({ text: "Docs", fill: "FFFFFF", width: "2400" }),
  tableCell({ text: "Ready", fill: "F0FDF4", width: "3000" }),
  "</w:tr>",
  "<w:tr>",
  tableCell({ text: "", width: "1800", vMerge: "continue" }),
  tableCell({ text: "QA", fill: "FFFFFF", width: "2400" }),
  tableCell({ text: "Queued", fill: "FFF7ED", width: "3000" }),
  "</w:tr>",
  "</w:tbl>"
].join("");

const nestedInnerTable = [
  "<w:tbl>",
  `<w:tblPr>${tableBorders}</w:tblPr>`,
  "<w:tr>",
  tableCell({
    text: "Nested detail",
    fill: "EEF2FF",
    width: "2400"
  }),
  "</w:tr>",
  "</w:tbl>"
].join("");

const fixtureNestedTable = [
  "<w:tbl>",
  `<w:tblPr>${tableBorders}</w:tblPr>`,
  "<w:tblGrid>",
  '<w:gridCol w:w="4800"/>',
  "</w:tblGrid>",
  "<w:tr>",
  tableCell({
    text: "Outer cell",
    fill: "F8FAFC",
    width: "4800",
    extraBlocks: [nestedInnerTable]
  }),
  "</w:tr>",
  "</w:tbl>"
].join("");

const fixtureMixedWidthTable = [
  "<w:tbl>",
  `<w:tblPr><w:tblW w:w="5000" w:type="pct"/>${tableBorders}</w:tblPr>`,
  "<w:tblGrid>",
  '<w:gridCol w:w="1440"/>',
  '<w:gridCol w:w="2160"/>',
  '<w:gridCol w:w="3600"/>',
  "</w:tblGrid>",
  "<w:tr>",
  tableCell({ text: "Fixed dxa", fill: "F8FAFC", width: "1440" }),
  tableCell({
    text: "Percent width",
    fill: "EEF2FF",
    width: "2500",
    widthType: "pct"
  }),
  tableCell({
    text: "Auto width",
    fill: "F0FDF4",
    width: "0",
    widthType: "auto"
  }),
  "</w:tr>",
  "</w:tbl>"
].join("");

const fixtureMixedWidthNoGridTable = [
  "<w:tbl>",
  `<w:tblPr><w:tblW w:w="0" w:type="auto"/>${tableBorders}</w:tblPr>`,
  "<w:tr>",
  tableCell({ text: "Fixed no grid", fill: "F8FAFC", width: "1440" }),
  tableCell({
    text: "Percent no grid",
    fill: "EEF2FF",
    width: "2500",
    widthType: "pct"
  }),
  tableCell({
    text: "Auto no grid",
    fill: "F0FDF4",
    width: "0",
    widthType: "auto"
  }),
  "</w:tr>",
  "</w:tbl>"
].join("");

const fixtureRepeatedHeaderTable = [
  "<w:tbl>",
  `<w:tblPr><w:tblW w:w="7200" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:jc w:val="center"/>${tableBorders}</w:tblPr>`,
  "<w:tblGrid>",
  '<w:gridCol w:w="2400"/>',
  '<w:gridCol w:w="2400"/>',
  '<w:gridCol w:w="2400"/>',
  "</w:tblGrid>",
  "<w:tr>",
  "<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>",
  tableCell({ text: "Milestone", fill: "DBEAFE", width: "2400" }),
  tableCell({ text: "Owner", fill: "DBEAFE", width: "2400" }),
  tableCell({ text: "Status", fill: "DBEAFE", width: "2400" }),
  "</w:tr>",
  "<w:tr>",
  tableCell({ text: "Import warnings", fill: "FFFFFF", width: "2400" }),
  tableCell({ text: "Codex", fill: "FFFFFF", width: "2400" }),
  tableCell({ text: "Explicit", fill: "F0FDF4", width: "2400" }),
  "</w:tr>",
  "<w:tr>",
  '<w:trPr><w:tblHeader w:val="0"/><w:cantSplit w:val="0"/></w:trPr>',
  tableCell({ text: "Disabled header", fill: "FFFFFF", width: "2400" }),
  tableCell({ text: "Import", fill: "FFFFFF", width: "2400" }),
  tableCell({ text: "Silent", fill: "F8FAFC", width: "2400" }),
  "</w:tr>",
  "</w:tbl>"
].join("");

const tableCellMargin = ({ top = "", bottom = "", left = "", right = "" }) =>
  [
    "<w:tcMar>",
    top ? `<w:top w:w="${top}" w:type="dxa"/>` : "",
    bottom ? `<w:bottom w:w="${bottom}" w:type="dxa"/>` : "",
    left ? `<w:left w:w="${left}" w:type="dxa"/>` : "",
    right ? `<w:right w:w="${right}" w:type="dxa"/>` : "",
    "</w:tcMar>"
  ].join("");

const tableDefaultCellMargins = [
  "<w:tblCellMar>",
  '<w:top w:w="120" w:type="dxa"/>',
  '<w:bottom w:w="180" w:type="dxa"/>',
  '<w:left w:w="240" w:type="dxa"/>',
  '<w:right w:w="300" w:type="dxa"/>',
  "</w:tblCellMar>"
].join("");

const fixtureTableCellLayoutTable = [
  "<w:tbl>",
  `<w:tblPr><w:tblW w:w="7200" w:type="dxa"/>${tableDefaultCellMargins}${tableBorders}</w:tblPr>`,
  "<w:tblGrid>",
  '<w:gridCol w:w="1440"/>',
  '<w:gridCol w:w="2160"/>',
  '<w:gridCol w:w="3600"/>',
  "</w:tblGrid>",
  "<w:tr>",
  tableCell({ text: "Default margins", fill: "F8FAFC", width: "1440" }),
  tableCell({
    text: "Cell override",
    fill: "EEF2FF",
    width: "2160",
    extraTcPr: tableCellMargin({ top: "360", bottom: "420", left: "480", right: "540" })
  }),
  tableCell({
    text: "No wrap",
    fill: "F0FDF4",
    width: "3600",
    extraTcPr: "<w:noWrap/>"
  }),
  "</w:tr>",
  "</w:tbl>"
].join("");

const fixtureTableCellLayoutControlTable = [
  "<w:tbl>",
  `<w:tblPr><w:tblW w:w="3600" w:type="dxa"/>${tableBorders}</w:tblPr>`,
  "<w:tblGrid>",
  '<w:gridCol w:w="1800"/>',
  '<w:gridCol w:w="1800"/>',
  "</w:tblGrid>",
  "<w:tr>",
  tableCell({ text: "Control A", fill: "FFFFFF", width: "1800" }),
  tableCell({
    text: "Control B",
    fill: "F8FAFC",
    width: "1800",
    extraTcPr: '<w:noWrap w:val="0"/>'
  }),
  "</w:tr>",
  "</w:tbl>"
].join("");

const tableCellContentControl = [
  '<w:sdt>',
  '<w:sdtPr>',
  '<w:alias w:val="Fixture approval status"/>',
  '<w:tag w:val="dockit-fixture-approval-status"/>',
  '</w:sdtPr>',
  '<w:sdtContent>',
  paragraph([textRun("Controlled option")]),
  '</w:sdtContent>',
  '</w:sdt>'
].join("");

const fixtureTableContentControlTable = [
  "<w:tbl>",
  `<w:tblPr><w:tblW w:w="4800" w:type="dxa"/>${tableBorders}</w:tblPr>`,
  "<w:tblGrid>",
  '<w:gridCol w:w="2400"/>',
  '<w:gridCol w:w="2400"/>',
  "</w:tblGrid>",
  "<w:tr>",
  tableCell({ text: "Regular cell", fill: "F8FAFC", width: "2400" }),
  tableCell({
    text: "Before control",
    fill: "FEF3C7",
    width: "2400",
    extraBlocks: [tableCellContentControl]
  }),
  "</w:tr>",
  "</w:tbl>"
].join("");

const imageParagraph = [
  "<w:p><w:r><w:drawing>",
  '<wp:inline distT="0" distB="0" distL="0" distR="0">',
  '<wp:extent cx="762000" cy="381000"/>',
  '<wp:effectExtent l="0" t="0" r="0" b="0"/>',
  '<wp:docPr id="1" name="Fixture image" descr="Fixture image alt"/>',
  '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>',
  '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">',
  "<pic:pic>",
  '<pic:nvPicPr><pic:cNvPr id="0" name="dockit-image-fixture.png" descr="Fixture image alt"/><pic:cNvPicPr/></pic:nvPicPr>',
  '<pic:blipFill><a:blip r:embed="rId4"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>',
  '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="762000" cy="381000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>',
  "</pic:pic>",
  "</a:graphicData></a:graphic>",
  "</wp:inline>",
  "</w:drawing></w:r></w:p>"
].join("");

const externalImageParagraph = imageParagraph
  .replace(
    'name="Fixture image" descr="Fixture image alt"',
    'name="External fixture image" descr="External fixture image alt"'
  )
  .replace(
    'name="dockit-image-fixture.png" descr="Fixture image alt"',
    'name="remote-image.png" descr="External fixture image alt"'
  )
  .replace('r:embed="rId4"', 'r:link="rId4"');

const missingImageParagraph = imageParagraph
  .replace(
    'name="Fixture image" descr="Fixture image alt"',
    'name="Missing fixture image" descr="Missing fixture image alt"'
  )
  .replace(
    'name="dockit-image-fixture.png" descr="Fixture image alt"',
    'name="missing-image.png" descr="Missing fixture image alt"'
  );

const unsupportedGifImageParagraph = imageParagraph
  .replace(
    'name="Fixture image" descr="Fixture image alt"',
    'name="Unsupported GIF fixture image" descr="Unsupported GIF fixture image alt"'
  )
  .replace(
    'name="dockit-image-fixture.png" descr="Fixture image alt"',
    'name="unsupported-image.gif" descr="Unsupported GIF fixture image alt"'
  );

const anchoredImageParagraph = [
  "<w:p><w:r><w:drawing>",
  '<wp:anchor distT="0" distB="0" distL="114300" distR="114300" simplePos="0" relativeHeight="251659264" behindDoc="0" locked="0" layoutInCell="1" allowOverlap="1">',
  '<wp:simplePos x="0" y="0"/>',
  '<wp:positionH relativeFrom="page"><wp:posOffset>914400</wp:posOffset></wp:positionH>',
  '<wp:positionV relativeFrom="paragraph"><wp:posOffset>182880</wp:posOffset></wp:positionV>',
  '<wp:extent cx="762000" cy="381000"/>',
  '<wp:effectExtent l="0" t="0" r="0" b="0"/>',
  '<wp:wrapSquare wrapText="bothSides"/>',
  '<wp:docPr id="2" name="Anchored fixture image" descr="Anchored fixture image alt"/>',
  '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>',
  '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">',
  "<pic:pic>",
  '<pic:nvPicPr><pic:cNvPr id="0" name="dockit-image-fixture.png" descr="Anchored fixture image alt"/><pic:cNvPicPr/></pic:nvPicPr>',
  '<pic:blipFill><a:blip r:embed="rId4"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>',
  '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="762000" cy="381000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>',
  "</pic:pic>",
  "</a:graphicData></a:graphic>",
  "</wp:anchor>",
  "</w:drawing></w:r></w:p>"
].join("");

const advancedAnchoredImageParagraph = [
  "<w:p><w:r><w:drawing>",
  '<wp:anchor distT="228600" distB="342900" distL="457200" distR="571500" simplePos="0" relativeHeight="42" behindDoc="1" locked="1" layoutInCell="0" allowOverlap="0">',
  '<wp:simplePos x="0" y="0"/>',
  '<wp:positionH relativeFrom="margin"><wp:align>center</wp:align></wp:positionH>',
  '<wp:positionV relativeFrom="page"><wp:align>bottom</wp:align></wp:positionV>',
  '<wp:extent cx="914400" cy="457200"/>',
  '<wp:effectExtent l="0" t="0" r="0" b="0"/>',
  "<wp:wrapNone/>",
  '<wp:docPr id="3" name="Advanced anchored fixture image" descr="Advanced anchored fixture image alt"/>',
  '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>',
  '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">',
  "<pic:pic>",
  '<pic:nvPicPr><pic:cNvPr id="0" name="dockit-image-fixture.png" descr="Advanced anchored fixture image alt"/><pic:cNvPicPr/></pic:nvPicPr>',
  '<pic:blipFill><a:blip r:embed="rId4"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>',
  '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="457200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>',
  "</pic:pic>",
  "</a:graphicData></a:graphic>",
  "</wp:anchor>",
  "</w:drawing></w:r></w:p>"
].join("");

const documentXml = (bodyBlocks, sectionProperties = defaultSectPr) => [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  `<w:document ${WORD_NS}>`,
  "<w:body>",
  ...bodyBlocks,
  sectionProperties,
  "</w:body>",
  "</w:document>"
].join("");

const realSimpleListBody = [
  headingParagraph("Real fixture list"),
  paragraph([textRun("Import samples")], listPPr("11")),
  paragraph([textRun("Export samples")], listPPr("11")),
  paragraph([textRun("Keep warnings explicit")], listPPr("12"))
];

const realTableLinkBody = [
  headingParagraph("Real fixture table"),
  paragraph([
    textRun("Review "),
    hyperlinkRun("DOCX guide"),
    textRun(" before release.")
  ]),
  fixtureTable
];

const realMergedTableBody = [
  headingParagraph("Real merged table"),
  fixtureMergedTable
];

const realNestedTableBody = [
  headingParagraph("Real nested table"),
  fixtureNestedTable
];

const realMixedWidthTableBody = [
  headingParagraph("Real mixed width table"),
  fixtureMixedWidthTable,
  fixtureMixedWidthNoGridTable
];

const realRepeatedHeaderTableBody = [
  headingParagraph("Real repeated header table"),
  fixtureRepeatedHeaderTable
];

const realTableCellLayoutBody = [
  headingParagraph("Real table cell layout metadata"),
  fixtureTableCellLayoutTable,
  fixtureTableCellLayoutControlTable
];

const realTableContentControlBody = [
  headingParagraph("Real table content control"),
  fixtureTableContentControlTable
];

const realParagraphSpacingBody = [
  headingParagraph("Real paragraph spacing"),
  paragraph(
    [textRun("Direct spacing paragraph")],
    '<w:spacing w:before="240" w:after="120" w:line="276" w:lineRule="auto"/>'
  ),
  paragraph(
    [textRun("Style spacing paragraph")],
    '<w:pStyle w:val="DockitFixtureSpacedParagraph"/>'
  ),
  paragraph([textRun("Control paragraph")])
];

const realParagraphStyleMetadataBody = [
  headingParagraph("Real paragraph style metadata"),
  paragraph(
    [textRun("Styled body paragraph")],
    '<w:pStyle w:val="DockitFixtureBodyStyle"/>'
  ),
  paragraph(
    [textRun("Styled heading paragraph")],
    '<w:pStyle w:val="DockitFixtureNamedHeading"/>'
  ),
  paragraph(
    [textRun("Missing style paragraph")],
    '<w:pStyle w:val="DockitMissingStyle"/>'
  ),
  paragraph([textRun("Control paragraph")])
];

const directParagraphTabsPPr = [
  '<w:tabs>',
  '<w:tab w:val="left" w:pos="720"/>',
  '<w:tab w:val="clear" w:pos="1440"/>',
  '<w:tab w:val="right" w:pos="9360" w:leader="dot"/>',
  "</w:tabs>"
].join("");

const overrideParagraphTabsPPr = [
  '<w:pStyle w:val="DockitFixtureTabbedParagraph"/>',
  '<w:tabs><w:tab w:val="center" w:pos="1440" w:leader="hyphen"/></w:tabs>'
].join("");

const spacingParagraphTabsPPr = [
  '<w:spacing w:before="240" w:after="120"/>',
  '<w:tabs><w:tab w:val="decimal" w:pos="3600"/></w:tabs>'
].join("");

const realParagraphTabsBody = [
  headingParagraph("Real paragraph tabs"),
  paragraph(
    [textRun("Direct tabs paragraph")],
    directParagraphTabsPPr
  ),
  paragraph(
    [textRun("Style tabs paragraph")],
    '<w:pStyle w:val="DockitFixtureTabbedParagraph"/>'
  ),
  paragraph(
    [textRun("Direct overrides style tabs paragraph")],
    overrideParagraphTabsPPr
  ),
  paragraph(
    [textRun("Spacing tabs paragraph")],
    spacingParagraphTabsPPr
  ),
  paragraph(
    [textRun("Style spacing tabs paragraph")],
    '<w:pStyle w:val="DockitFixtureSpacedTabbedParagraph"/>'
  ),
  paragraph([textRun("Control paragraph")])
];

const paragraphSectionBreakPPr = buildSectPr({
  type: "nextPage",
  width: "15840",
  height: "12240",
  orient: "landscape",
  top: "720",
  right: "936",
  bottom: "864",
  left: "1080",
  columns: { num: "2", space: "720" },
  titlePage: true
});

const trailingSectionPageSettings = buildSectPr({
  width: "12240",
  height: "15840",
  top: "1440",
  right: "1800",
  bottom: "1200",
  left: "900",
  header: "720",
  footer: "540",
  gutter: "360",
  pageNumberStart: "7"
});

const realSectionPageSettingsBody = [
  headingParagraph("Real section/page settings"),
  paragraph([textRun("Intro paragraph before section break")]),
  paragraph(
    [textRun("Paragraph-level section break to landscape")],
    paragraphSectionBreakPPr
  ),
  headingParagraph("Second section heading"),
  paragraph([textRun("Trailing paragraph after page setting variance")])
];

const realCharacterStyleBody = [
  headingParagraph("Real character style"),
  paragraph([
    textRun("Styled character run", '<w:rStyle w:val="DockitFixtureEmphasisChar"/><w:b/><w:color w:val="1D4ED8"/>'),
    textRun(" and direct control", "<w:i/>")
  ])
];

const realEmbeddedImageBody = [
  paragraph([textRun("Embedded image fixture", "<w:b/>")]),
  imageParagraph
];

const realAnchoredImageBody = [
  paragraph([textRun("Anchored image fixture", "<w:b/>")]),
  anchoredImageParagraph
];

const realAdvancedAnchoredImageBody = [
  paragraph([textRun("Advanced anchored image fixture", "<w:b/>")]),
  advancedAnchoredImageParagraph
];

const realExternalImageBody = [
  paragraph([textRun("External image fixture", "<w:b/>")]),
  externalImageParagraph
];

const realMissingImageBody = [
  paragraph([textRun("Missing image fixture", "<w:b/>")]),
  missingImageParagraph
];

const realUnsupportedGifImageBody = [
  paragraph([textRun("Unsupported GIF image fixture", "<w:b/>")]),
  unsupportedGifImageParagraph
];

const realSupportedMixedBody = [
  headingParagraph("Dockit launch memo"),
  paragraph([
    textRun("Review "),
    textRun("HWPX", "<w:b/>"),
    textRun(" and "),
    hyperlinkRun("DOCX guide"),
    textRun(" before release.")
  ]),
  paragraph([textRun("Import samples")], listPPr("11")),
  paragraph([textRun("Export samples")], listPPr("11")),
  paragraph([textRun("Keep warnings explicit")], listPPr("12")),
  fixtureTable,
  imageParagraph
];

const createDOCX = ({
  bodyBlocks,
  hyperlink = false,
  image = false,
  imageTarget = "media/dockit-image-fixture.png",
  imageTargetMode = null,
  mediaEntry = "png",
  stylesXmlOverride = stylesXml,
  sectionProperties = defaultSectPr
}) => {
  const entries = {
    "[Content_Types].xml": strToU8(contentTypesXml),
    "_rels/.rels": strToU8(packageRelsXml),
    "word/document.xml": strToU8(documentXml(bodyBlocks, sectionProperties)),
    "word/styles.xml": strToU8(stylesXmlOverride),
    "word/numbering.xml": strToU8(numberingXml),
    "word/_rels/document.xml.rels": strToU8(
      relationshipXml({ hyperlink, image, imageTarget, imageTargetMode })
    )
  };

  if (image && mediaEntry === "png") {
    entries["word/media/dockit-image-fixture.png"] = readFileSync(pngFixturePath);
  }

  if (image && mediaEntry === "gif") {
    entries["word/media/unsupported-image.gif"] = Buffer.from(
      "R0lGODlhAQABAIAAAAUEBA==",
      "base64"
    );
  }

  return zipSync(entries, { mtime: FIXTURE_ZIP_MTIME });
};

const fixtures = [
  {
    fileName: "real-simple-list.docx",
    bodyBlocks: realSimpleListBody
  },
  {
    fileName: "real-table-link.docx",
    bodyBlocks: realTableLinkBody,
    hyperlink: true
  },
  {
    fileName: "real-merged-table.docx",
    bodyBlocks: realMergedTableBody
  },
  {
    fileName: "real-nested-table.docx",
    bodyBlocks: realNestedTableBody
  },
  {
    fileName: "real-mixed-width-table.docx",
    bodyBlocks: realMixedWidthTableBody
  },
  {
    fileName: "real-repeated-header-table.docx",
    bodyBlocks: realRepeatedHeaderTableBody
  },
  {
    fileName: "real-table-cell-layout-unsupported.docx",
    bodyBlocks: realTableCellLayoutBody
  },
  {
    fileName: "real-table-content-control-unsupported.docx",
    bodyBlocks: realTableContentControlBody
  },
  {
    fileName: "real-paragraph-spacing.docx",
    bodyBlocks: realParagraphSpacingBody,
    stylesXmlOverride: paragraphSpacingStylesXml
  },
  {
    fileName: "real-paragraph-style-metadata.docx",
    bodyBlocks: realParagraphStyleMetadataBody,
    stylesXmlOverride: paragraphStyleMetadataStylesXml
  },
  {
    fileName: "real-paragraph-tabs.docx",
    bodyBlocks: realParagraphTabsBody,
    stylesXmlOverride: paragraphTabsStylesXml
  },
  {
    fileName: "real-section-page-settings-unsupported.docx",
    bodyBlocks: realSectionPageSettingsBody,
    sectionProperties: trailingSectionPageSettings
  },
  {
    fileName: "real-character-style-unsupported.docx",
    bodyBlocks: realCharacterStyleBody,
    stylesXmlOverride: characterStyleStylesXml
  },
  {
    fileName: "real-embedded-image.docx",
    bodyBlocks: realEmbeddedImageBody,
    image: true
  },
  {
    fileName: "real-anchored-image.docx",
    bodyBlocks: realAnchoredImageBody,
    image: true
  },
  {
    fileName: "real-advanced-anchored-image.docx",
    bodyBlocks: realAdvancedAnchoredImageBody,
    image: true
  },
  {
    fileName: "real-external-image.docx",
    bodyBlocks: realExternalImageBody,
    image: true,
    imageTarget: "https://example.com/remote-image.png",
    imageTargetMode: "External",
    mediaEntry: null
  },
  {
    fileName: "real-missing-image.docx",
    bodyBlocks: realMissingImageBody,
    image: true,
    imageTarget: "media/missing-image.png",
    mediaEntry: null
  },
  {
    fileName: "real-unsupported-gif-image.docx",
    bodyBlocks: realUnsupportedGifImageBody,
    image: true,
    imageTarget: "media/unsupported-image.gif",
    mediaEntry: "gif"
  },
  {
    fileName: "real-supported-s2-mixed.docx",
    bodyBlocks: realSupportedMixedBody,
    hyperlink: true,
    image: true
  }
];

mkdirSync(fixtureDir, { recursive: true });

fixtures.forEach((fixture) => {
  writeFileSync(
    path.join(fixtureDir, fixture.fileName),
    createDOCX(fixture)
  );
});
