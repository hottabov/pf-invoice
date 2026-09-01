import type { FormSpec } from "../types";
import { mSeriesSpec } from "./m-series";

/** Order is irrelevant: matching is by product code and pages follow item sortOrder. */
export const FORM_SPECS: FormSpec[] = [mSeriesSpec];
