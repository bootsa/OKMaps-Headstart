# Runs server/preprocessing/other-scripts/openaire.R (get_papers) and the
# parse_project part of run_openaire_projectdata.R on saved OpenAIRE
# responses, so the TypeScript adaptor can be compared with R.
#
#   Rscript test/golden/r/openaire_golden.R test/fixtures/openaire test/golden/openaire
#
# ropenaire is replaced by stubs that read the saved responses. ropenaire's
# xml_project (used only to count projects) is reproduced from its source.
# Needs xml2, plyr, data.table, stringr, jsonlite, logging.
suppressMessages({
  library(jsonlite)
  library(logging)
  library(xml2)
  library(plyr)
  library(stringr)
})
invisible(Sys.setlocale(category = "LC_ALL", locale = "en_US.UTF-8"))

args <- commandArgs(TRUE)
fixtures <- args[1]
out <- args[2]
here <- normalizePath(dirname(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE))))
scripts <- normalizePath(file.path(here, "../../../../../server/preprocessing/other-scripts"))
basicConfig(level = "ERROR")
.GlobalEnv$VIS_ID <- "golden"

fx <- function(name) file.path(fixtures, name)
roa_projects <- function(...) {
  doc <- read_xml(fx("project.xml"))
  data.frame(n = seq_along(xml_find_all(doc, "//results/result")))
}
roa_pubs <- function(...) read_xml(fx("publications.xml"))
roa_datasets <- function(...) read_xml(fx("datasets.xml"))

src <- readLines(file.path(scripts, "openaire.R"), encoding = "UTF-8")
src <- src[!grepl("^library\\(ropenaire\\)", src)]
eval(parse(text = src, encoding = "UTF-8"))

res <- get_papers("643410", list(project_id = "643410", funder = "EC"))
writeLines(toJSON(list(metadata = res$metadata, text = res$text), digits = NA), file.path(out, "search.json"))

# Only publications: datasets fail to parse (as when the project has none).
roa_datasets <- function(...) read_xml("<response><results/></response>")
res <- get_papers("643410", list(project_id = "643410", funder = "EC"))
writeLines(toJSON(list(metadata = res$metadata, text = res$text), digits = NA), file.path(out, "search_pubs_only.json"))

# Project data: the functions of run_openaire_projectdata.R, without its runner code.
src <- readLines(file.path(scripts, "run_openaire_projectdata.R"), encoding = "UTF-8")
from <- grep("^projectdata_nodes <- ", src)
to <- grep("^failed <- ", src) - 1
eval(parse(text = src[from:to], encoding = "UTF-8"))
raw <- paste(readLines(fx("project.xml"), encoding = "UTF-8"), collapse = "\n")
writeLines(toJSON(parse_project(raw), auto_unbox = TRUE), file.path(out, "project.json"))
