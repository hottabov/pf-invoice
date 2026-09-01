import type { FormSpec } from "../types";
import { mSeriesSpec } from "./m-series";
import { easyLoaderSpec } from "./easyloader";
import { fabricProSpec } from "./fabricpro";

/** Order is irrelevant: matching is by product code and pages follow item sortOrder. */
export const FORM_SPECS: FormSpec[] = [mSeriesSpec, easyLoaderSpec, fabricProSpec];
