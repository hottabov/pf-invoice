import type { z } from "zod";

/** One quote item, flattened for form rendering. */
export type FormItem = {
  id: string;
  code: string;
  name: string;
  spec: Record<string, unknown>;
  /** Option codes on this item, e.g. ["VRB-220", "MTS", "HFV-M"]. */
  optionCodes: string[];
  /** Attribute bags keyed by option code, e.g. { MTS: { metres: 14 } }. */
  optionAttributes: Record<string, Record<string, unknown>>;
  /**
   * Option codes paired with their sold quantity, e.g.
   * [{ code: "EL-2420 Additional 1.2M lengths", qty: 6 }]. `optionCodes` is
   * a flat list with no quantity; a form that prints how many of something
   * was sold needs the count too.
   */
  optionQtys: { code: string; qty: number }[];
};

/** Everything a form needs that is not the item itself. */
export type FormContext = {
  distributorName: string;
  authorName: string;
  company: { name: string; addressLines: string[]; industry: string | null };
  contact: { fullName: string; position: string | null; phone: string | null; email: string | null };
  deliveryAddressLines: string[];
  /** Document-level software product codes, e.g. ["PTW(I)", "ANT-V6"]. */
  softwareCodes: string[];
  item: FormItem;
};

export type FormSpec = {
  id: string;
  title: string;
  template: string;
  /** Path of the worksheet inside the xlsx zip. */
  sheetPath: string;
  matches: (code: string) => boolean;
  /** Written into blank cells. */
  values: Array<{ cell: string; from: (ctx: FormContext) => string | number | null | undefined }>;
  /** Overwrites printed label text -- rare, and declared separately so it is visible. */
  replaces: Array<{ cell: string; from: (ctx: FormContext) => string | null | undefined }>;
  /**
   * `covers` names the option code pattern a tick consumes. It is what lets
   * the engine work out which of an item's options the form has no box for --
   * a tick's `when` alone cannot say that, and an option that silently
   * vanishes is the worst failure this feature could have. Ticks driven by
   * the product code or the production spec leave it undefined.
   */
  ticks: Array<{ cell: string; when: (ctx: FormContext) => boolean; covers?: RegExp }>;
  /**
   * Options this form accounts for without a tick of their own -- the
   * EasyLoader's table lengths, which the section rows and the printed total
   * already represent. Without this they would be reported unmatched and
   * printed again on the Additional items sheet, telling the workshop the
   * form had missed something it did not miss.
   */
  coversOptions?: RegExp[];
  /** productionSpec keys that block generation while unanswered. */
  requires: string[];
  specSchema: z.ZodTypeAny;
};
