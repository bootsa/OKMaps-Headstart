# The maps the current server makes from the recorded provider answers the
# app's tests use, for the end-to-end comparison in parity.test.ts.
#
#   Rscript apps/frontend/test/parity/legacy_maps.R apps/frontend/test/parity/legacy
#   python3 apps/frontend/test/parity/legacy_finish.py apps/frontend/test/parity/legacy
#
# (from the repository root). The inputs to the layout are the outputs of the
# source stages, which packages/sources already checks against R and Python
# (test/golden: pubmed_efetch.json, base_worker/*, openaire/search.json). This
# script adds what happens next on the server:
#   PubMed:   ESummary readers and pmcid, then Crossref citation counts as the
#             metrics worker merges them (metrics.R add_citations), with the
#             same answers as test/fake-net.ts
#   all:      vis_layout() with the dataprocessing worker's parameters
# vis_layout is run twice (seeds 1 and 2): metaMDS starts at random, so the
# second run shows how much R differs from itself. legacy_finish.py then does
# what Python (pandas) and PHP do to the output before vis/ reads it.
# Needs the R packages of packages/pipeline/test/golden/r/generate_goldens.R.

args <- commandArgs(TRUE)
out_dir <- normalizePath(args[1])
here <- normalizePath(dirname(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE))))
root <- normalizePath(file.path(here, "../../../.."))
golden <- file.path(root, "packages/sources/test/golden")
setwd(file.path(root, "legacy/preprocessing/other-scripts"))

library <- function(pkg, ...) {
  p <- as.character(substitute(pkg))
  if (identical(p, "GMD")) return(invisible(NULL))
  base::library(p, character.only = TRUE, ...)
}
suppressMessages({
  source("utils.R")
  source("vis_layout.R")
})
rm(library)
source(file.path(root, "packages/pipeline/test/golden/r/gmd_shim.R"))
setup_logging("WARN")
Sys.setlocale(category = "LC_ALL", locale = "en_US.UTF-8")
MAX_CLUSTERS <- 15  # run_vis_layout.R sets this global, which cluster.R reads

# The dataprocessing worker's defaults (server/workers/dataprocessing/src/headstart.py on the legacy-server branch),
# then each API's settings (server/workers/api/src/apis/*.py).
defaults <- list(MAX_CLUSTERS = 15, language = "english", taxonomy_separator = ";", list_size = -1)
with_defaults <- function(p) modifyList(defaults, p)

# PubMed: the parsed EFetch table, plus what pubmed.R and the metrics worker add.
pubmed <- function() {
  df <- fromJSON(file.path(golden, "pubmed_efetch.json"))
  df$readers <- as.character(seq_len(nrow(df)) - 1)  # fake-net.ts: pmcrefcount = position
  df$pmcid <- ""
  dois <- df$doi
  valid <- unique(dois[which(dois != "")])
  cc <- data.frame(doi = valid, citation_count = 10L + seq_along(valid) - 1L, stringsAsFactors = FALSE)
  df <- merge(x = df, y = cc, by = "doi", all.x = TRUE)
  # pandas round trip in the pubmed worker
  df <- fromJSON(toJSON(df, na = "null", digits = NA))
  list(metadata = df, text = df[, c("id", "content")],
       params = with_defaults(list(q = "ecology", service = "pubmed", from = "1809-01-01", to = "2026-11-06",
                                   sorting = "most-relevant", limit = 100, list_size = 100)))
}

base <- function() {
  d <- fromJSON(gzfile(file.path(golden, "base_worker/base_digital_education_overview.json.gz")))
  list(metadata = d$metadata, text = d$text,
       params = with_defaults(list(q = "digital education", service = "base", from = "1665-01-01", to = "2026-11-06",
                                   sorting = "most-relevant", document_types = list("121"), limit = 120, list_size = 100)))
}

openaire <- function() {
  d <- fromJSON(file.path(golden, "openaire/search.json"))
  list(metadata = d$metadata, text = d$text,
       params = with_defaults(list(q = "643410", service = "openaire", project_id = "643410", funder = "EC",
                                   limit = 100, list_size = -1)))
}

for (case in c("pubmed", "base", "openaire")) {
  d <- get(case)()
  .GlobalEnv$VIS_ID <- case
  runs <- lapply(1:2, function(seed) {
    set.seed(seed)
    vis_layout(d$text, d$metadata, d$params$service,
               max_clusters = d$params$MAX_CLUSTERS,
               taxonomy_separator = d$params$taxonomy_separator,
               vis_type = "overview", list_size = d$params$list_size, params = d$params)
  })
  writeLines(sprintf('{"params":%s,"output":%s,"output_b":%s}',
                     toJSON(d$params, auto_unbox = TRUE), runs[[1]], runs[[2]]),
             file.path(out_dir, paste0(case, ".raw.json")), useBytes = TRUE)
  message("wrote ", case)
}
