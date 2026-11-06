# Golden data for the BASE subject cleaning (subject_cleaning.R,
# clean_subject_string). The corpus is every distinct raw subject (subject_orig)
# in the R labelling replay inputs and the known test cases, which are real BASE
# records, plus extra cases from test_subject_cleaning.R. Output: gzipped JSON
# with the input, the DOAJ flag and the cleaned result for both map types.
#
#   Rscript test/golden/r/subject_golden.R test/golden/subject_cleaning.json.gz
suppressMessages(library(jsonlite))
invisible(Sys.setlocale("LC_ALL", "en_US.UTF-8"))
out <- commandArgs(TRUE)[1]
here <- normalizePath(dirname(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE))))
server <- normalizePath(file.path(here, "../../../../../server"))
scripts <- file.path(server, "preprocessing/other-scripts")
old <- setwd(scripts)
source("subject_cleaning.R")
setwd(old)

subjects <- character(0)
doaj <- logical(0)
add <- function(s, coll) {
  s[is.na(s)] <- ""
  coll[is.na(coll)] <- ""
  subjects <<- c(subjects, s)
  doaj <<- c(doaj, coll == "ftdoajarticles")
}
for (f in list.files(file.path(scripts, "test/replay"), pattern = "inputs\\.rds$", full.names = TRUE)) {
  m <- readRDS(f)$metadata
  if (!is.null(m$subject_orig)) add(m$subject_orig, if (is.null(m$collection)) rep("", nrow(m)) else m$collection)
}
for (f in list.files(file.path(server, "workers/tests/knowncases"), pattern = "\\.json$", full.names = TRUE)) {
  m <- fromJSON(fromJSON(f)$input_data$metadata)
  if (!is.null(m$subject_orig)) add(m$subject_orig, if (is.null(m$collection)) rep("", nrow(m)) else m$collection)
}
# String literals from the R unit tests of the cleaning chain.
for (t in c("test/test_subject_cleaning.R", "test/test_subject_chain.R")) {
  src <- paste(readLines(file.path(scripts, t), encoding = "UTF-8", warn = FALSE), collapse = "\n")
  lit <- regmatches(src, gregexpr('"([^"\\\\]|\\\\.)*"', src))[[1]]
  lit <- vapply(lit, function(l) tryCatch(eval(parse(text = l)), error = function(e) NA_character_), "", USE.NAMES = FALSE)
  lit <- lit[!is.na(lit) & nchar(lit) > 0]
  add(lit, rep("", length(lit)))
  add(lit, rep("ftdoajarticles", length(lit)))
}
key <- paste(doaj, subjects)
keep <- !duplicated(key)
subjects <- subjects[keep]
doaj <- doaj[keep]
res <- list(
  subject = subjects,
  doaj = doaj,
  overview = clean_subject_string(subjects, NULL, doaj),
  timeline = clean_subject_string(subjects, "timeline", doaj)
)
con <- gzfile(out, "w")
writeLines(toJSON(res, auto_unbox = FALSE), con, useBytes = TRUE)
close(con)
cat(length(subjects), "subjects\n")
