# Convert the R labelling replay fixtures (server/preprocessing/other-scripts/
# test/replay/*.inputs.rds) to JSON for the TypeScript label tests, with the
# labels the current R code produces in the default configuration (mode 0,
# n-gram setting 0).
#
# Usage (from the repository root):
#   Rscript packages/pipeline/test/golden/r/convert_replay.R packages/pipeline/test/golden/replay

args <- commandArgs(TRUE)
out_dir <- args[1]
dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)
out_dir <- normalizePath(out_dir)
setwd("server/preprocessing/other-scripts")
suppressMessages({
  library(tm); library(jsonlite); library(stringi); library(stringr); library(logging)
  library(parallel)
  source("utils.R")
  source("summarize.R")
  source("ranking.R")
})
setup_logging("WARN")
Sys.setlocale(category = "LC_ALL", locale = "en_US.UTF-8")
Sys.unsetenv(c("RANKING_MODE", "NGRAM_SETTING", "INCLUDE_ABSTRACTS"))

stop_lists <- list()
for (f in sort(list.files("test/replay", pattern = "\\.inputs\\.rds$", full.names = TRUE))) {
  name <- sub("\\.inputs\\.rds$", "", basename(f))
  x <- readRDS(f)
  key <- paste(x$stops, collapse = "\n")
  idx <- match(key, names(stop_lists))
  if (is.na(idx)) { stop_lists[[key]] <- x$stops; idx <- length(stop_lists) }
  named <- create_cluster_labels(x$clusters, x$metadata, x$type_counts,
                                 weightingspec = x$weightingspec, top_n = x$top_n,
                                 stops = x$stops, taxonomy_separator = x$taxonomy_separator,
                                 params = x$params, service = x$service)
  m <- x$metadata
  col <- function(n) if (n %in% names(m)) as.character(m[[n]]) else rep(NA_character_, nrow(m))
  out <- list(
    name = name, service = x$service, stops = idx - 1L,
    taxonomy_separator = x$taxonomy_separator, top_n = x$top_n,
    groups = unname(x$clusters$groups), num_clusters = x$clusters$num_clusters,
    title = col("title"), paper_abstract = col("paper_abstract"), subject = col("subject"),
    type_counts = as.list(x$type_counts),
    labels = named$cluster_labels
  )
  writeLines(toJSON(out, auto_unbox = TRUE, digits = NA, null = "null", na = "null"),
             file.path(out_dir, paste0(name, ".json")))
  message("wrote ", name)
}
writeLines(toJSON(unname(stop_lists)), file.path(out_dir, "_stops.json"))
