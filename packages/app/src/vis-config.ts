/**
 * Settings for the existing visualisation (vis/), per service. They follow
 * the old local examples (examples/public/main_integration on the
 * legacy-server branch), with the features
 * that need the PHP server (PDF preview, share and embed links, export,
 * annotations, analytics) turned off until the browser app has its own.
 */
import type { Service } from "./search.ts";

const common = {
  tag: "visualization",
  mode: "local_files",
  input_format: "json",
  bubble_max_scale: 1,
  paper_min_scale: 1,
  paper_max_scale: 1,
  title: "",
  use_area_uri: true,
  show_multiples: false,
  is_force_areas: true,
  show_list: true,
  show_context: true,
  create_title_from_context: true,
  context_most_relevant_tooltip: true,
  show_context_oa_number: false,
  doi_outlink: true,
  filter_menu_dropdown: true,
  filter_options: ["all", "open_access"],
  show_keywords: true,
  show_cite_button: true,
  highlight_query_terms: true,
  faqs_button: false,
  faqs_url: "https://openknowledgemaps.org/faq",
  // Need the PHP server.
  preview_type: "none",
  embed_modal: false,
  share_modal: false,
  use_hypothesis: false,
  is_evaluation: false,
  show_export_button: false,
  server_url: "",
};

const byService: Record<Service, Record<string, unknown>> = {
  pubmed: {
    service: "pubmed",
    bubble_min_scale: 1.2,
    base_unit: "citations",
    sort_options: ["readers", "title", "authors", "year"],
    language: "eng_pubmed",
    area_force_alpha: 0.015,
    content_based: false,
  },
  base: {
    service: "base",
    bubble_min_scale: 1,
    base_unit: "citations",
    sort_options: ["relevance", "title", "authors", "year"],
    language: "eng",
    area_force_alpha: 0.02,
    content_based: true,
    url_prefix: "https://www.base-search.net/Record/",
    cite_papers: true,
  },
  openaire: {
    service: "openaire",
    bubble_min_scale: 1,
    dynamic_sizing: true,
    dynamic_force_area: true,
    dynamic_force_papers: true,
    base_unit: "citations",
    sort_options: ["relevance", "title", "authors", "year"],
    language: "eng_openaire",
    area_force_alpha: 0.015,
    content_based: true,
    url_prefix: "https://www.openaire.eu/search/publication?articleId=",
    url_prefix_datasets: "https://www.openaire.eu/en/search/dataset?datasetId=",
    create_title_from_context_style: "viper",
    metric_list: false,
    credit: true,
    scale_toolbar: false,
    modal_info_type: "openaire",
  },
};

export function visConfig(service: Service, file: { title: string; file: string }): Record<string, unknown> {
  return { ...common, ...byService[service], files: [file] };
}
