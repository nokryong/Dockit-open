import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { importDOCXToIR } from "../../app/LIB/ir/docxImport";
import {
  createDOCXMinimalExportInput,
  exportIRToMinimalDOCX
} from "../../app/LIB/ir/docxMinimalExport";

const WORD_NS =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REL_TYPE_PREFIX =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/";

const textRun = (text, marks = []) => ({ type: "textRun", text, marks });
const noteReference = (noteId, kind) => ({
  type: "noteReference",
  noteId,
  kind
});
const paragraph = (runs) => ({ type: "paragraph", attrs: {}, runs });
const noteParagraph = (runs = []) => ({ type: "paragraph", runs });

const createComplexNoteIR = () => ({
  type: "document",
  version: "ir-v1.1-draft",
  metadata: {
    extractedAt: "2026-07-15T00:00:00.000Z",
    extractorVersion: "n5b-test",
    source: { editor: "dockit", mode: "editor-json" },
    warnings: []
  },
  sections: [
    {
      type: "section",
      id: "section-1",
      breakType: "continuous",
      pageSettings: {},
      blocks: [
        paragraph([
          textRun("first ", [
            { type: "link", attrs: { href: "https://dockit.example/main" } }
          ]),
          noteReference("note-v1-end-1", "endnote")
        ]),
        {
          type: "list",
          listType: "ordered",
          attrs: { start: 1 },
          items: [
            {
              type: "listItem",
              attrs: {},
              blocks: [
                paragraph([
                  textRun("list "),
                  noteReference("note-v1-foot-1", "footnote")
                ])
              ]
            }
          ]
        },
        {
          type: "table",
          attrs: {},
          rows: [
            {
              type: "tableRow",
              attrs: {},
              cells: [
                {
                  type: "tableCell",
                  role: "cell",
                  attrs: {},
                  blocks: [
                    paragraph([
                      textRun("cell "),
                      noteReference("note-v1-end-2", "endnote")
                    ])
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ],
  notes: [
    {
      noteId: "note-v1-end-1",
      kind: "endnote",
      referenceOrder: 0,
      paragraphs: [
        noteParagraph([
          textRun("end one", [
            { type: "bold" },
            { type: "textStyle", attrs: { color: "#336699" } }
          ]),
          { type: "hardBreak" },
          textRun("source", [
            { type: "link", attrs: { href: "https://example.com/source" } }
          ])
        ]),
        noteParagraph([textRun("second paragraph", [{ type: "italic" }])])
      ]
    },
    {
      noteId: "note-v1-foot-1",
      kind: "footnote",
      referenceOrder: 1,
      paragraphs: [noteParagraph()]
    },
    {
      noteId: "note-v1-end-2",
      kind: "endnote",
      referenceOrder: 2,
      paragraphs: [noteParagraph([textRun("end two", [{ type: "underline" }])])]
    }
  ]
});

const exportFixture = (irDocument = createComplexNoteIR()) =>
  exportIRToMinimalDOCX(createDOCXMinimalExportInput(irDocument));

const mutatePackage = (packageBytes, mutate) => {
  const entries = unzipSync(packageBytes);
  const api = {
    entries,
    getText: (path) => strFromU8(entries[path]),
    setText: (path, value) => {
      entries[path] = strToU8(value);
    },
    remove: (path) => {
      delete entries[path];
    },
    move: (from, to) => {
      entries[to] = entries[from];
      delete entries[from];
    }
  };

  mutate(api);
  return zipSync(entries);
};

const mutateTextEntry = (packageBytes, path, update) =>
  mutatePackage(packageBytes, ({ getText, setText }) =>
    setText(path, update(getText(path)))
  );

const mutateNormalNote = (xml, kind, id, update) => {
  const expression = new RegExp(
    `<w:${kind} w:id="${id}">[\\s\\S]*?</w:${kind}>`
  );
  return xml.replace(expression, (noteXml) => update(noteXml));
};

const errorCodes = (packageBytes) =>
  importDOCXToIR(packageBytes).warnings
    .filter((warning) => warning.severity === "error")
    .map((warning) => warning.code);

const expectBlockingCode = (packageBytes, code) => {
  const result = importDOCXToIR(packageBytes);
  expect(
    result.warnings
      .filter((warning) => warning.severity === "error")
      .map((warning) => warning.code)
  ).toContain(code);
  expect(result.irDocument.notes).toBeUndefined();
};

const canonicalSettings = ({
  footnote = [
    '<w:pos w:val="pageBottom"/>',
    '<w:numFmt w:val="decimal"/>',
    '<w:numStart w:val="1"/>',
    '<w:numRestart w:val="continuous"/>',
    '<w:footnote w:id="-1"/>',
    '<w:footnote w:id="0"/>'
  ].join(""),
  endnote = [
    '<w:pos w:val="docEnd"/>',
    '<w:numFmt w:val="decimal"/>',
    '<w:numStart w:val="1"/>',
    '<w:numRestart w:val="continuous"/>',
    '<w:endnote w:id="-1"/>',
    '<w:endnote w:id="0"/>'
  ].join("")
} = {}) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="${WORD_NS}"><w:footnotePr>${footnote}</w:footnotePr><w:endnotePr>${endnote}</w:endnotePr></w:settings>`;

describe("N5b native DOCX footnote/endnote adapter", () => {
  it("writes standard native parts, content types, relationships, and special entries", () => {
    const exported = exportFixture();
    const entries = new Map(exported.entries.map((entry) => [entry.path, String(entry.content)]));
    const paths = [...entries.keys()];
    const documentRelationships = entries.get("word/_rels/document.xml.rels");
    const relationshipIds = [
      ...documentRelationships.matchAll(/Relationship Id="([^"]+)"/g)
    ].map((match) => match[1]);

    expect(paths).toEqual(
      expect.arrayContaining([
        "word/footnotes.xml",
        "word/endnotes.xml",
        "word/_rels/footnotes.xml.rels",
        "word/_rels/endnotes.xml.rels"
      ])
    );
    expect(entries.get("[Content_Types].xml")).toContain(
      "wordprocessingml.footnotes+xml"
    );
    expect(entries.get("[Content_Types].xml")).toContain(
      "wordprocessingml.endnotes+xml"
    );
    expect(documentRelationships).toContain(`${REL_TYPE_PREFIX}footnotes`);
    expect(documentRelationships).toContain(`${REL_TYPE_PREFIX}endnotes`);
    expect(new Set(relationshipIds).size).toBe(relationshipIds.length);
    expect(entries.get("word/footnotes.xml")).toContain(
      'w:type="separator"'
    );
    expect(entries.get("word/footnotes.xml")).toContain(
      'w:type="continuationSeparator"'
    );
    expect(entries.get("word/endnotes.xml")).toContain("w:endnoteRef");
    expect(entries.get("word/_rels/endnotes.xml.rels")).toContain(
      "https://example.com/source"
    );
  });

  it("roundtrips mixed global order, nested references, marks, links, and empty note paragraphs", () => {
    const result = importDOCXToIR(exportFixture().packageBytes, {
      extractedAt: "2026-07-15T00:00:00.000Z"
    });

    expect(result.warnings.filter((warning) => warning.severity === "error")).toEqual([]);
    expect(result.irDocument.notes).toMatchObject([
      {
        noteId: "note-v1-docx-endnote-1",
        kind: "endnote",
        referenceOrder: 0,
        paragraphs: [{ runs: expect.any(Array) }, { runs: expect.any(Array) }]
      },
      {
        noteId: "note-v1-docx-footnote-1",
        kind: "footnote",
        referenceOrder: 1,
        paragraphs: [{ runs: [] }]
      },
      {
        noteId: "note-v1-docx-endnote-2",
        kind: "endnote",
        referenceOrder: 2
      }
    ]);
    expect(result.irDocument.sections[0].blocks[1].items[0].blocks[0].runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "noteReference",
          noteId: "note-v1-docx-footnote-1"
        })
      ])
    );
    expect(result.irDocument.sections[0].blocks[2].rows[0].cells[0].blocks[0].runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "noteReference",
          noteId: "note-v1-docx-endnote-2"
        })
      ])
    );
    const linkedRun = result.irDocument.notes[0].paragraphs[0].runs.find(
      (run) => run.type === "textRun" && run.text === "source"
    );
    expect(linkedRun.marks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "link",
          attrs: { href: "https://example.com/source" }
        })
      ])
    );
    const secondPass = importDOCXToIR(exportFixture(result.irDocument).packageBytes);
    expect(
      secondPass.warnings.filter((warning) => warning.severity === "error")
    ).toEqual([]);
    expect(secondPass.irDocument.notes).toMatchObject([
      { kind: "endnote", referenceOrder: 0 },
      { kind: "footnote", referenceOrder: 1 },
      { kind: "endnote", referenceOrder: 2 }
    ]);
  });

  it("resolves relationship-local links for a noncanonical note-part target", () => {
    const packageBytes = mutatePackage(exportFixture().packageBytes, (api) => {
      api.setText(
        "word/_rels/document.xml.rels",
        api
          .getText("word/_rels/document.xml.rels")
          .replace('Target="endnotes.xml"', 'Target="notes/custom-endnotes.xml"')
      );
      api.setText(
        "[Content_Types].xml",
        api
          .getText("[Content_Types].xml")
          .replace("/word/endnotes.xml", "/word/notes/custom-endnotes.xml")
      );
      api.move("word/endnotes.xml", "word/notes/custom-endnotes.xml");
      api.move(
        "word/_rels/endnotes.xml.rels",
        "word/notes/_rels/custom-endnotes.xml.rels"
      );
    });
    const result = importDOCXToIR(packageBytes);

    expect(result.warnings.filter((warning) => warning.severity === "error")).toEqual([]);
    expect(result.irDocument.notes[0].paragraphs[0].runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "textRun",
          text: "source",
          marks: expect.arrayContaining([
            expect.objectContaining({ type: "link" })
          ])
        })
      ])
    );
  });

  it("accepts the canonical continuous decimal start-at-one settings subset", () => {
    const packageBytes = mutatePackage(exportFixture().packageBytes, (api) => {
      api.setText("word/settings.xml", canonicalSettings());
    });

    expect(errorCodes(packageBytes)).not.toContain(
      "docx-import-note-numbering-unsupported"
    );
  });

  it("accepts canonical section-level note settings", () => {
    const packageBytes = mutateTextEntry(
      exportFixture().packageBytes,
      "word/document.xml",
      (xml) =>
        xml.replace(
          "</w:sectPr>",
          '<w:footnotePr><w:numFmt w:val="decimal"/><w:numStart w:val="1"/><w:numRestart w:val="continuous"/><w:pos w:val="pageBottom"/></w:footnotePr></w:sectPr>'
        )
    );

    expect(errorCodes(packageBytes)).not.toContain(
      "docx-import-note-numbering-unsupported"
    );
  });

  it("accepts the conventional main-document note reference style", () => {
    const packageBytes = mutateTextEntry(
      exportFixture().packageBytes,
      "word/document.xml",
      (xml) =>
        xml.replace(
          '<w:r><w:endnoteReference w:id="1"/></w:r>',
          '<w:r><w:rPr><w:rStyle w:val="EndnoteReference"/><w:vertAlign w:val="superscript"/></w:rPr><w:endnoteReference w:id="1"/></w:r>'
        )
    );

    expect(errorCodes(packageBytes)).not.toContain("docx-import-note-pair-invalid");
  });

  it("blocks unsupported main-document note reference formatting", () => {
    const packageBytes = mutateTextEntry(
      exportFixture().packageBytes,
      "word/document.xml",
      (xml) =>
        xml.replace(
          '<w:r><w:endnoteReference w:id="1"/></w:r>',
          '<w:r><w:rPr><w:rStyle w:val="Emphasis"/></w:rPr><w:endnoteReference w:id="1"/></w:r>'
        )
    );

    expectBlockingCode(packageBytes, "docx-import-note-pair-invalid");
  });

  it.each([
    ["number format", '<w:numFmt w:val="upperRoman"/>'],
    ["start", '<w:numStart w:val="2"/>'],
    ["restart", '<w:numRestart w:val="eachPage"/>'],
    ["placement", '<w:pos w:val="beneathText"/>'],
    [
      "duplicate property",
      '<w:numFmt w:val="decimal"/><w:numFmt w:val="decimal"/>'
    ],
    ["unknown property", '<w:restart w:val="continuous"/>']
  ])("blocks unsupported note %s settings", (_name, footnote) => {
    const packageBytes = mutatePackage(exportFixture().packageBytes, (api) => {
      api.setText("word/settings.xml", canonicalSettings({ footnote }));
    });

    expectBlockingCode(packageBytes, "docx-import-note-numbering-unsupported");
  });

  it.each([
    [
      "missing relationship",
      (api) =>
        api.setText(
          "word/_rels/document.xml.rels",
          api
            .getText("word/_rels/document.xml.rels")
            .replace(
              /<Relationship [^>]*Type="[^"]*\/footnotes"[^>]*\/>/,
              ""
            )
        ),
      "docx-import-note-part-invalid"
    ],
    [
      "external relationship",
      (api) =>
        api.setText(
          "word/_rels/document.xml.rels",
          api
            .getText("word/_rels/document.xml.rels")
            .replace(
              /Type="([^"]*\/footnotes)" Target="footnotes.xml"/,
              'Type="$1" Target="https://example.com/footnotes.xml" TargetMode="External"'
            )
        ),
      "docx-import-note-part-invalid"
    ],
    [
      "missing part",
      (api) => api.remove("word/footnotes.xml"),
      "docx-import-note-part-invalid"
    ],
    [
      "duplicate part relationship",
      (api) =>
        api.setText(
          "word/_rels/document.xml.rels",
          api
            .getText("word/_rels/document.xml.rels")
            .replace(
              "</Relationships>",
              `<Relationship Id="rId99" Type="${REL_TYPE_PREFIX}footnotes" Target="footnotes.xml"/></Relationships>`
            )
        ),
      "docx-import-note-part-invalid"
    ],
    [
      "unsupported note relationship child",
      (api) =>
        api.setText(
          "word/_rels/endnotes.xml.rels",
          api
            .getText("word/_rels/endnotes.xml.rels")
            .replace("</Relationships>", "<Broken/></Relationships>")
        ),
      "docx-import-note-hyperlink-unsupported"
    ],
    [
      "duplicate note hyperlink relationship",
      (api) => {
        const xml = api.getText("word/_rels/endnotes.xml.rels");
        const relationship = xml.match(/<Relationship [^>]+\/>/)?.[0] ?? "";
        api.setText(
          "word/_rels/endnotes.xml.rels",
          xml.replace("</Relationships>", `${relationship}</Relationships>`)
        );
      },
      "docx-import-note-hyperlink-unsupported"
    ]
  ])("classifies %s without partial apply", (_name, mutate, code) => {
    const packageBytes = mutatePackage(exportFixture().packageBytes, mutate);
    expectBlockingCode(packageBytes, code);
  });

  it.each([
    [
      "custom mark",
      (api) =>
        api.setText(
          "word/document.xml",
          api
            .getText("word/document.xml")
            .replace(
              '<w:endnoteReference w:id="1"/>',
              '<w:endnoteReference w:id="1" w:customMarkFollows="true"/>'
            )
        )
    ],
    [
      "numeric custom mark",
      (api) =>
        api.setText(
          "word/document.xml",
          api
            .getText("word/document.xml")
            .replace(
              '<w:endnoteReference w:id="1"/>',
              '<w:endnoteReference w:id="1" w:customMarkFollows="1"/>'
            )
        )
    ],
    [
      "duplicate reference",
      (api) =>
        api.setText(
          "word/document.xml",
          api
            .getText("word/document.xml")
            .replace(
              '<w:endnoteReference w:id="1"/>',
              '<w:endnoteReference w:id="1"/><w:endnoteReference w:id="1"/>'
            )
        )
    ],
    [
      "missing body",
      (api) =>
        api.setText(
          "word/endnotes.xml",
          mutateNormalNote(api.getText("word/endnotes.xml"), "endnote", 1, () => "")
        )
    ],
    [
      "orphan body",
      (api) =>
        api.setText(
          "word/endnotes.xml",
          api
            .getText("word/endnotes.xml")
            .replace(
              "</w:endnotes>",
              '<w:endnote w:id="9"><w:p><w:r><w:endnoteRef/></w:r><w:r><w:t>orphan</w:t></w:r></w:p></w:endnote></w:endnotes>'
            )
        )
    ],
    [
      "invalid id",
      (api) => {
        api.setText(
          "word/document.xml",
          api
            .getText("word/document.xml")
            .replace('<w:endnoteReference w:id="1"/>', '<w:endnoteReference w:id="0"/>')
        );
        api.setText(
          "word/endnotes.xml",
          api
            .getText("word/endnotes.xml")
            .replace('<w:endnote w:id="1">', '<w:endnote w:id="0">')
        );
      }
    ],
    [
      "duplicate body",
      (api) => {
        const xml = api.getText("word/endnotes.xml");
        const body = xml.match(/<w:endnote w:id="1">[\s\S]*?<\/w:endnote>/)?.[0] ?? "";
        api.setText(
          "word/endnotes.xml",
          xml.replace("</w:endnotes>", `${body}</w:endnotes>`)
        );
      }
    ]
  ])("blocks invalid note pairing: %s", (_name, mutate) => {
    const packageBytes = mutatePackage(exportFixture().packageBytes, mutate);
    expectBlockingCode(packageBytes, "docx-import-note-pair-invalid");
  });

  it.each([
    ["unsupported block", (noteXml) => noteXml.replace("</w:endnote>", "<w:tbl/></w:endnote>")],
    ["paragraph field", (noteXml) => noteXml.replace("</w:p>", "<w:fldSimple/></w:p>")],
    ["run tab", (noteXml) => noteXml.replace("</w:r>", "<w:tab/></w:r>")],
    ["drawing", (noteXml) => noteXml.replace("</w:r>", "<w:drawing/></w:r>")],
    [
      "nested reference",
      (noteXml) => noteXml.replace(
        "</w:r>",
        '<w:footnoteReference w:id="1"/></w:r>'
      )
    ],
    [
      "unsupported paragraph properties",
      (noteXml) => noteXml.replace("<w:p>", "<w:p><w:pPr><w:keepNext/></w:pPr>")
    ],
    [
      "marker after text",
      (noteXml) => noteXml.replace(
        "<w:p><w:r><w:endnoteRef/></w:r>",
        "<w:p><w:r><w:t>prefix</w:t></w:r><w:r><w:endnoteRef/></w:r>"
      )
    ],
    [
      "wrong body marker kind",
      (noteXml) => noteXml.replace("<w:endnoteRef/>", "<w:footnoteRef/>")
    ]
  ])("blocks unsupported note content: %s", (_name, mutateNote) => {
    const packageBytes = mutateTextEntry(
      exportFixture().packageBytes,
      "word/endnotes.xml",
      (xml) => mutateNormalNote(xml, "endnote", 1, mutateNote)
    );
    expectBlockingCode(packageBytes, "docx-import-note-content-unsupported");
  });

  it.each([
    [
      "unsafe link",
      (xml) => xml.replace("https://example.com/source", "javascript:alert(1)")
    ],
    [
      "unresolved link",
      (xml) => xml.replace(/<Relationship [^>]+\/>/, "")
    ]
  ])("blocks %s in a note-local relationship", (_name, updateRelationships) => {
    const packageBytes = mutateTextEntry(
      exportFixture().packageBytes,
      "word/_rels/endnotes.xml.rels",
      updateRelationships
    );
    expectBlockingCode(packageBytes, "docx-import-note-hyperlink-unsupported");
  });

  it("rejects unknown special note types while accepting standard infrastructure entries", () => {
    const validCodes = errorCodes(exportFixture().packageBytes);
    const invalidPackage = mutateTextEntry(
      exportFixture().packageBytes,
      "word/endnotes.xml",
      (xml) => xml.replace('w:type="continuationSeparator"', 'w:type="custom"')
    );

    expect(validCodes).not.toContain("docx-import-note-part-invalid");
    expectBlockingCode(invalidPackage, "docx-import-note-part-invalid");
  });

  it.each([
    [
      "paragraph attrs",
      "DOCX_NOTE_EXPORT_PARAGRAPH_ATTR_UNSUPPORTED",
      (ir) => {
        ir.notes[0].paragraphs[0].attrs = { fontSize: 11 };
      }
    ],
    [
      "link attrs",
      "DOCX_NOTE_EXPORT_UNSAFE_LINK",
      (ir) => {
        ir.notes[0].paragraphs[0].runs[2].marks[0].attrs.title = "source";
      }
    ],
    [
      "unsupported mark",
      "DOCX_NOTE_EXPORT_MARK_UNSUPPORTED",
      (ir) => {
        ir.notes[0].paragraphs[1].runs[0].marks = [
          { type: "highlight", attrs: { color: "yellow" } }
        ];
      }
    ],
    [
      "empty text style",
      "DOCX_NOTE_EXPORT_MARK_UNSUPPORTED",
      (ir) => {
        ir.notes[0].paragraphs[1].runs[0].marks = [
          { type: "textStyle", attrs: {} }
        ];
      }
    ],
    [
      "mark attrs",
      "DOCX_NOTE_EXPORT_MARK_UNSUPPORTED",
      (ir) => {
        ir.notes[0].paragraphs[1].runs[0].marks = [
          { type: "italic", attrs: { value: true } }
        ];
      }
    ],
    [
      "duplicate mark",
      "DOCX_NOTE_EXPORT_MARK_UNSUPPORTED",
      (ir) => {
        ir.notes[0].paragraphs[1].runs[0].marks = [
          { type: "italic" },
          { type: "italic" }
        ];
      }
    ]
  ])("fails before bytes for unsupported export %s", (_name, code, mutate) => {
    const ir = structuredClone(createComplexNoteIR());
    mutate(ir);

    expect(() => exportFixture(ir)).toThrow(expect.objectContaining({ code }));
  });
});
