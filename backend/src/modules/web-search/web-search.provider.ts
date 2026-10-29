import type { RawWebSearchResult, WebSearchInput } from "./web-search.types.js";

export interface WebSearchProvider {
  search(input: WebSearchInput): Promise<RawWebSearchResult[]>;
}
