import { describe, expect, it } from "vitest";
import { CsvParseError, parseCsv } from "@/lib/csv/parse";
import { suggestAreaUnit, suggestMapping, type ImportOptions } from "@/lib/csv/mapping";
import { normalizeRow, parseDate, parseNumber, parsePropertyType, parseVerificationStatus } from "@/lib/csv/normalize";
import { csvCell, toCsv } from "@/lib/csv/export";

const opts: ImportOptions = { decimalSeparator: ".", dateFormat: "DMY", landAreaUnit: "M2", buildingAreaUnit: "M2", isSynthetic: false };

describe("parseCsv", () => {
  it("parses quoted fields, strips BOM and detects comma delimiter", () => {
    const parsed = parseCsv('﻿id,name,address\r\nA-1,"Torre, Norte","Calle 1 ""Sur"""\r\n');
    expect(parsed.headers).toEqual(["id", "name", "address"]);
    expect(parsed.delimiter).toBe(",");
    expect(parsed.rows[0].values).toEqual({ id: "A-1", name: "Torre, Norte", address: 'Calle 1 "Sur"' });
  });

  it("detects semicolon delimiters", () => {
    const parsed = parseCsv("Código;Precio\nX;1.250.000,00\n");
    expect(parsed.delimiter).toBe(";");
    expect(parsed.rows[0].values["Precio"]).toBe("1.250.000,00");
  });

  it("flags rows with the wrong column count instead of dropping them", () => {
    const parsed = parseCsv("a,b,c\n1,2,3\n4,5\n");
    expect(parsed.rows[0].errors).toEqual([]);
    expect(parsed.rows[1].errors[0]).toMatch(/Expected 3 columns but found 2/);
  });

  it("skips blank lines", () => {
    expect(parseCsv("a,b\n1,2\n\n   \n3,4\n").rows).toHaveLength(2);
  });

  it.each([
    ["", /empty/],
    ["a,b\n", /no data rows/],
    ["a,a\n1,2\n", /Duplicate column header/],
  ])("rejects invalid files (%j)", (text, message) => {
    expect(() => parseCsv(text)).toThrow(CsvParseError);
    expect(() => parseCsv(text)).toThrow(message);
  });
});

describe("column mapping", () => {
  it("maps English snake_case headers", () => {
    const m = suggestMapping(["property_id", "property_name", "address", "municipality", "department", "property_type", "land_area_m2", "building_area_m2", "asking_price_usd", "price_per_m2_usd", "verification_status", "last_updated"]);
    expect(m).toMatchObject({ referenceCode: "property_id", name: "property_name", landArea: "land_area_m2", buildingArea: "building_area_m2", askingPrice: "asking_price_usd", pricePerArea: "price_per_m2_usd", verificationStatus: "verification_status", lastUpdated: "last_updated" });
  });

  it("maps Spanish headers with accents and units", () => {
    const m = suggestMapping(["Código", "Nombre", "Dirección", "Municipio", "Departamento", "Tipo", "Clave catastral", "Área terreno (v²)", "Área construcción (v²)", "Precio (USD)", "Estado verificación"]);
    expect(m).toMatchObject({ referenceCode: "Código", address: "Dirección", cadastralId: "Clave catastral", landArea: "Área terreno (v²)", buildingArea: "Área construcción (v²)", askingPrice: "Precio (USD)", verificationStatus: "Estado verificación" });
    expect(suggestAreaUnit(m.landArea)).toBe("V2");
    expect(suggestAreaUnit("land_area_m2")).toBe("M2");
  });

  it("never maps one header to two fields", () => {
    const values = Object.values(suggestMapping(["id", "name", "status"]));
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("value parsing", () => {
  it.each([
    ["US$ 1,250,000.50", ".", "1250000.5"],
    ["$950", ".", "950"],
    ["1.250.000,00", ",", "1250000"],
    ["2 346,56", ",", "2346.56"],
    ["1500 m²", ".", "1500"],
    ["-350.00", ".", "-350"],
  ])("parseNumber(%j, %j) = %s", (raw, sep, expected) => {
    const r = parseNumber(raw, sep as "." | ",");
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") expect(r.value.toString()).toBe(expected);
  });

  it("distinguishes empty tokens from unreadable values", () => {
    expect(parseNumber("", ".").kind).toBe("empty");
    expect(parseNumber("N/A", ".").kind).toBe("empty");
    expect(parseNumber("Consultar", ".")).toEqual({ kind: "invalid", raw: "Consultar" });
  });

  it("parses ISO and day-first dates and rejects impossible dates", () => {
    expect((parseDate("2026-03-08", "DMY") as Date).toISOString()).toBe("2026-03-08T00:00:00.000Z");
    expect((parseDate("03/09/2026", "DMY") as Date).toISOString()).toBe("2026-09-03T00:00:00.000Z");
    expect((parseDate("03/09/2026", "MDY") as Date).toISOString()).toBe("2026-03-09T00:00:00.000Z");
    expect(parseDate("31/02/2026", "DMY")).toBe("invalid");
    expect(parseDate("", "DMY")).toBeNull();
  });

  it("maps property types and verification statuses in English and Spanish", () => {
    expect(parsePropertyType("Local comercial")).toBe("RETAIL");
    expect(parsePropertyType("Bodega")).toBe("WAREHOUSE_INDUSTRIAL");
    expect(parsePropertyType("Office building")).toBe("OFFICE");
    expect(parsePropertyType("Hotel")).toBeNull();
    expect(parseVerificationStatus("Verificado")).toBe("VERIFIED");
    expect(parseVerificationStatus("Pending review")).toBe("PENDING_REVIEW");
    expect(parseVerificationStatus("En trámite")).toBeNull();
  });
});

describe("normalizeRow", () => {
  const mapping = { referenceCode: "id", name: "name", address: "addr", municipality: "mun", department: "dep", propertyType: "type", landArea: "land", buildingArea: "bldg", askingPrice: "price", pricePerArea: "ppa" } as const;

  it("converts v² to m², canonicalizes locations and keeps unsupported types raw", () => {
    const r = normalizeRow(
      { id: "syn-1", name: "Test", addr: "Calle 1", mun: "antiguo cuscatlan", dep: "la libertad", type: "Hotel", land: "1.000,00", bldg: "", price: "500.000,00", ppa: "" },
      mapping,
      { ...opts, decimalSeparator: ",", landAreaUnit: "V2" },
    );
    expect(r.property.referenceCode).toBe("SYN-1");
    expect(r.property.landAreaM2?.toFixed(2)).toBe("698.90");
    expect(r.property.municipality).toBe("Antiguo Cuscatlán");
    expect(r.property.department).toBe("La Libertad");
    expect(r.property.propertyType).toBeNull();
    expect(r.property.rawPropertyType).toBe("Hotel");
    expect(r.rejectionReasons).toEqual([]);
  });

  it("converts a stated price per v² into price per m²", () => {
    const r = normalizeRow({ id: "A", name: "n", addr: "a", mun: "x", dep: "y", type: "Terreno", land: "100", bldg: "", price: "1000", ppa: "69.89" }, mapping, { ...opts, landAreaUnit: "V2" });
    expect(r.property.sourcePricePerM2?.toFixed(2)).toBe("100.00");
  });

  it("records unreadable values as messages and leaves the field empty", () => {
    const r = normalizeRow({ id: "A", name: "n", addr: "a", mun: "x", dep: "y", type: "Retail", land: "10", bldg: "10", price: "Consultar", ppa: "" }, mapping, opts);
    expect(r.property.askingPriceUsd).toBeNull();
    expect(r.messages).toContainEqual(expect.objectContaining({ code: "UNPARSEABLE_VALUE", field: "askingPrice", rawValue: "Consultar" }));
  });

  it("rejects rows that cannot be identified or are structurally broken", () => {
    expect(normalizeRow({ price: "100" }, mapping, opts).rejectionReasons[0]).toMatch(/cannot be identified/);
    expect(normalizeRow({ id: "A" }, mapping, opts, ["Expected 10 columns but found 3."]).rejectionReasons).toHaveLength(1);
  });
});

describe("CSV export", () => {
  it("neutralizes spreadsheet formula injection but keeps negative numbers", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+cmd")).toBe("'+cmd");
    expect(csvCell("-350.00")).toBe("-350.00");
    expect(csvCell(null)).toBe("");
  });

  it("writes a BOM and a header row", () => {
    const csv = toCsv([{ a: "x,y" }], [{ header: "col", value: (r) => r.a }]);
    expect(csv).toBe('﻿col\r\n"x,y"\r\n');
  });
});

describe("commit request validation", () => {
  it("accepts a partial mapping and applies option defaults", async () => {
    const { commitImportSchema } = await import("@/lib/csv/mapping");
    const parsed = commitImportSchema.parse({ mapping: { referenceCode: "Código", askingPrice: "Precio" }, options: {} });
    expect(parsed.options).toEqual({ decimalSeparator: ".", landAreaUnit: "M2", buildingAreaUnit: "M2", dateFormat: "DMY", isSynthetic: false });
    expect(() => commitImportSchema.parse({ mapping: {}, options: {} })).toThrow(/Map at least one column/);
    expect(() => commitImportSchema.parse({ mapping: { notAField: "x" }, options: {} })).toThrow();
  });
});
