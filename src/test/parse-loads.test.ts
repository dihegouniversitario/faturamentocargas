import { describe, expect, it } from "vitest";
import { parseLoads, parseNumberBR, loadLabel } from "@/lib/parse-loads";

const L1 = "26/10/2026\t14\tB0AC\tBFDY\tAntonio Carlos\t92527\tCRYSTAL 500ML SEM GÁS 12UN\t4.368\t26\tDinon\tJCY5B51\t106875705";

describe("parseLoads", () => {
  it("reads all 12 columns of a tab-separated line", () => {
    const r = parseLoads(L1);
    expect(r.rejected).toEqual([]);
    expect(r.loads).toHaveLength(1);
    const l = r.loads[0]!;
    expect(l.dt).toBe("106875705");
    expect(l.plate).toBe("JCY5B51");
    expect(l.load_date).toBe("2026-10-26");
    expect(l.items[0]).toEqual({ sap_code: "92527", description: "CRYSTAL 500ML SEM GÁS 12UN", boxes: 4368, pallets: 26 });
  });

  it("groups lines with the same DT into one load", () => {
    const L2 = L1.replace("92527", "11111").replace("4.368", "100");
    const r = parseLoads(`${L1}\n${L2}`);
    expect(r.loads).toHaveLength(1);
    expect(r.loads[0]!.items).toHaveLength(2);
  });

  it("inherits plate and header data when plate is '-'", () => {
    const cont = "-\t-\t-\t-\t-\t22222\tCOCA 2L\t500\t3\t-\t-\t-";
    const r = parseLoads(`${L1}\n${cont}`);
    expect(r.loads).toHaveLength(1);
    expect(r.loads[0]!.items[1]!.sap_code).toBe("22222");
  });

  it("accepts two-or-more-space separation and ignores blank lines", () => {
    const r = parseLoads(`\n${L1.replace(/\t/g, "   ")}\n\n`);
    expect(r.loads).toHaveLength(1);
    expect(r.rejected).toEqual([]);
  });

  it("reports lines it could not understand", () => {
    const r = parseLoads(`${L1}\nisso nao e uma carga`);
    expect(r.loads).toHaveLength(1);
    expect(r.rejected).toEqual(["isso nao e uma carga"]);
  });

  it("parses thousands separator and builds the label with last 4 DT digits", () => {
    expect(parseNumberBR("4.368")).toBe(4368);
    expect(loadLabel("JCY5B51", "106875705", "Dinon")).toBe("JCY5B51 - 5705 | Dinon");
  });
});
