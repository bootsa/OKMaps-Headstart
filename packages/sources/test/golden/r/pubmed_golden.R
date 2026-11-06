# Runs the parsing part of server/preprocessing/other-scripts/pubmed.R on a
# saved EFetch response, so the TypeScript adaptor can be compared with R.
#
#   Rscript test/golden/r/pubmed_golden.R test/fixtures/pubmed_efetch.xml > test/golden/pubmed_efetch.json
#
# rentrez is replaced by stubs that return the saved response (search and
# summary calls are stubbed out; ESummary mapping is tested separately).
# Needs xml2, data.table, jsonlite, logging, stringi, dplyr.
suppressMessages({
  library(jsonlite)
  library(dplyr)
  library(logging)
  library(parallel)
})
invisible(Sys.setlocale(category = "LC_ALL", locale = "en_US.UTF-8"))

args <- commandArgs(TRUE)
fixture <- args[1]
here <- normalizePath(dirname(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE))))
scripts <- normalizePath(file.path(here, "../../../../../server/preprocessing/other-scripts"))

entrez_retry_options <- function(...) list()
entrez_search <- function(...) list(web_history = NULL)
entrez_fetch <- function(...) paste(readLines(fixture, encoding = "UTF-8", warn = FALSE), collapse = "\n")
entrez_summary <- function(...) list()
extract_from_esummary <- function(summary, field) if (field == "pmcrefcount") rep("", n_records) else NULL

src <- readLines(file.path(scripts, "pubmed.R"), encoding = "UTF-8")
src <- src[!grepl('^library\\("rentrez"\\)', src)]
src <- gsub("rentrez::", "", src, fixed = TRUE)
# Stop before the ESummary part: return the parsed table.
cut <- grep("summary <- ", src, fixed = TRUE)[1]
src <- c(src[1:(cut - 1)], "  return(df)", "}", "xtext <- function(x) xml2::xml_text(x)")
old <- setwd(scripts)
eval(parse(text = src, encoding = "UTF-8"))
setwd(old)
.GlobalEnv$VIS_ID <- "golden"
basicConfig(level = "ERROR")

df <- get_papers("ecology", list(limit = 100, sorting = "most-relevant", from = "2016-01-01", to = "2025-01-01"))
cat(toJSON(df, na = "null", auto_unbox = TRUE, digits = NA))
