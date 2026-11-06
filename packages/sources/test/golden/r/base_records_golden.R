# Golden data for BASE record set-up: rbace's parser, then etl(),
# sanitize_abstract() and mark_duplicates() from base.R / preprocess.R, as
# get_papers() runs them on the first page of results. The output is the
# metadata JSON that run_base.R prints for the Python worker.
#
#   Rscript test/golden/r/base_records_golden.R test/fixtures/base test/golden/base_records
suppressMessages({ library(jsonlite); library(logging); library(stringr); library(dplyr); library(stringdist) })
invisible(Sys.setlocale("LC_ALL", "en_US.UTF-8"))
args <- commandArgs(TRUE)
here <- normalizePath(dirname(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE))))
scripts <- normalizePath(file.path(here, "../../../../../legacy/preprocessing/other-scripts"))
basicConfig(level = "ERROR")
.GlobalEnv$VIS_ID <- "golden"
source(file.path(here, "rbace_parse.R"))
src <- readLines(file.path(scripts, "base.R"), encoding = "UTF-8", warn = FALSE)
src <- src[!grepl("^library\\(rbace\\)", src)]
src <- gsub("rbace::bs_retry_options(3,60,3,4)", "list()", src, fixed = TRUE)
old <- setwd(scripts)
source("utils.R")
eval(parse(text = src, encoding = "UTF-8"))
setwd(old)
dir.create(args[2], showWarnings = FALSE, recursive = TRUE)

files <- normalizePath(list.files(args[1], pattern = "\\.xml\\.gz$", full.names = TRUE))
outdir <- normalizePath(args[2])
setwd(scripts)  # etl() loads MeSH resources relative to the R scripts
for (f in files) {
  for (vis_type in c("overview", "timeline")) {
    params <- list(vis_type = vis_type)
    raw <- bs_parse(paste(readLines(gzfile(f), encoding = "UTF-8", warn = FALSE), collapse = "\n"), "df")
    res <- raw$docs
    metadata <- etl(res, NULL, FALSE)
    metadata <- sanitize_abstract(metadata)
    metadata <- mark_duplicates(metadata)
    metadata$has_dataset <- unlist(lapply(metadata$resulttype, function(x) "Dataset" %in% x))
    out <- file.path(outdir, paste0(sub("\\.xml\\.gz$", "", basename(f)), "_", vis_type, ".json.gz"))
    con <- gzfile(out, "w")
    # Same encoding as run_base.R (toJSON defaults), wrapped with numFound.
    writeLines(paste0("{\"numFound\":", attr(raw, "numFound"), ",\"metadata\":", toJSON(metadata), "}"), con, useBytes = TRUE)
    close(con)
    cat(out, nrow(metadata), "records,", sum(metadata$is_duplicate), "duplicates\n")
  }
}
