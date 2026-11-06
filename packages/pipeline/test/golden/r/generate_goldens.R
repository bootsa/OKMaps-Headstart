# Generate golden outputs for the TypeScript pipeline from the R pipeline.
#
# Usage (from the repository root):
#   Rscript packages/pipeline/test/golden/r/generate_goldens.R \
#     legacy/workers/tests/knowncases packages/pipeline/test/golden/data
#
# Runs the same functions as vis_layout() (overview, default ranking mode 0 and
# n-gram setting 0) on each known case and writes the intermediate stages that
# the TypeScript port is compared against. Needs R with tm, vegan, SnowballC,
# proxy, stringi, stringr, stringdist, logging, doParallel, plyr, dplyr, jsonlite.
# GMD is replaced by gmd_shim.R.

args <- commandArgs(TRUE)
cases_dir <- normalizePath(args[1])
out_dir <- args[2]
dir.create(out_dir, showWarnings = FALSE, recursive = TRUE)
out_dir <- normalizePath(out_dir)
shim <- normalizePath(file.path(dirname(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE))), "gmd_shim.R"))
scripts <- normalizePath("legacy/preprocessing/other-scripts")
setwd(scripts)

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
source(shim)
setup_logging("WARN")
# Same locale as run_vis_layout.R: term order (and so tf-idf tie order) follows it.
Sys.setlocale(category = "LC_ALL", locale = "en_US.UTF-8")
MAX_CLUSTERS <- 15

files <- sort(list.files(cases_dir, pattern = "^testcase.*\\.json$", full.names = TRUE))
for (f in files) {
  name <- sub("\\.json$", "", basename(f))
  d <- fromJSON(f)
  params <- d$params
  .GlobalEnv$VIS_ID <- name
  text <- fromJSON(d$input_data$text)
  metadata <- fromJSON(d$input_data$metadata)
  if (nrow(metadata) < 3) { message("skip ", name, " (", nrow(metadata), " docs)"); next }
  set.seed(1)
  service <- params$service
  metadata <- sanitize_abstract(metadata)
  languages <- names(head(sort(table(unlist(lapply(metadata$lang, strsplit, "; "))), decreasing = TRUE), 2))
  stops <- get_stopwords(languages)
  corpus <- create_corpus(metadata, text, stops)
  tdm_matrix <- create_tdm_matrix(corpus$stemmed)
  dm <- get_distance_matrix(tdm_matrix)
  dd <- as.dist(dm)
  cssobj <- css.hclust(dd, hclust.FUN.MoreArgs = list(method = "ward.D"))
  hc <- attr(cssobj, "meta")$hclust.obj
  clusters <- create_clusters(dd, max_clusters = MAX_CLUSTERS)
  layout <- get_ndms(dd, mindim = 2, maxdim = 2)
  # metaMDS uses random starts: a second run with another seed shows how much
  # R's own layouts differ from run to run (the tolerance for the port)
  set.seed(2)
  layout_b <- get_ndms(dd, mindim = 2, maxdim = 2)
  set.seed(1)
  meta2 <- replace_keywords_if_empty(metadata, stops)
  type_counts <- get_type_counts(lower_allcaps_spans(corpus$unlowered, meta2))
  named <- create_cluster_labels(clusters, meta2, type_counts, weightingspec = "ntn",
                                 top_n = 3, stops = stops, taxonomy_separator = ";",
                                 params = params, service = service)
  out <- list(
    name = name, service = service, query = params$q,
    languages = languages, stopword_count = length(stops),
    ids = as.character(text$id),
    stemmed = vapply(seq_along(corpus$stemmed), function(i) paste(content(corpus$stemmed[[i]]), collapse = " "), ""),
    terms = colnames(tdm_matrix),
    distances = signif(as.vector(dd), 15),
    merge = hc$merge, height = round(hc$height, 10),
    ev = round(cssobj$ev, 10),
    num_clusters = clusters$num_clusters,
    groups = unname(clusters$groups),
    layout = cbind(round(layout$X1, 8), round(layout$X2, 8)),
    layout_b = cbind(round(layout_b$X1, 8), round(layout_b$X2, 8)),
    subject = meta2$subject,
    subject_is_heuristic = meta2$subject_is_heuristic,
    type_counts = as.list(type_counts),
    labels = named$cluster_labels
  )
  writeLines(toJSON(out, auto_unbox = TRUE, digits = NA, null = "null", na = "null"),
             file.path(out_dir, paste0(name, ".json")))
  message("wrote ", name, " k=", clusters$num_clusters)
}
