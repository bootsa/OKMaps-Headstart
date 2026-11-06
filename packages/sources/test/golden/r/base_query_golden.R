# Golden data for BASE query building: runs get_papers() from base.R up to
# the first API call and records what it would send. Cases are the queries
# in test/queries.csv and the known test cases, plus hand-written ones that
# exercise quoting, operators and the optional parameters.
#
#   Rscript test/golden/r/base_query_golden.R test/golden/base_query.json
suppressMessages({ library(jsonlite); library(logging); library(stringr); library(dplyr) })
invisible(Sys.setlocale("LC_ALL", "en_US.UTF-8"))
out <- commandArgs(TRUE)[1]
here <- normalizePath(dirname(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE))))
server <- normalizePath(file.path(here, "../../../../../server"))
scripts <- file.path(server, "preprocessing/other-scripts")
basicConfig(level = "ERROR")
.GlobalEnv$VIS_ID <- "golden"

src <- readLines(file.path(scripts, "base.R"), encoding = "UTF-8")
src <- src[!grepl("^library\\(rbace\\)", src)]
src <- gsub("rbace::bs_retry_options(3,60,3,4)", "list()", src, fixed = TRUE)
old <- setwd(scripts)
source("utils.R")
eval(parse(text = src, encoding = "UTF-8"))
setwd(old)
get_raw_data <- function(limit, base_query, return_fields, sortby_string, filter, repo, coll, retry_opts, offset, non_public) {
  captured <<- list(hits = limit, query = base_query, fields = return_fields, sortby = sortby_string,
                    filter = as.character(filter), target = repo, coll = coll, offset = offset, non_public = non_public)
  stop("captured")
}

cases <- list()
add <- function(q, params) cases[[length(cases) + 1]] <<- list(q = q, params = params)
default <- list(document_types = list("121"), from = "1665-01-01", to = "2023-12-07", sorting = "most-relevant",
                limit = 120, list_size = 100)
qs <- read.csv(file.path(scripts, "test/queries.csv"), stringsAsFactors = FALSE)$query
for (q in qs) add(q, default)
for (f in list.files(file.path(server, "workers/tests/knowncases"), pattern = "\\.json$", full.names = TRUE)) {
  p <- fromJSON(f, simplifyVector = FALSE)$params
  if (identical(p$service, "base")) add(p$q, p)
}
tricky <- c(
  '"climate change" adaptation', 'climate+change', 'climate ++ change "a+b"', 'climate -change',
  'climate --  change', '-climate', '(a and b) or (a and c)', 'a OR b', 'a or b', 'a and b',
  '  lots   of    space  ', '"unclosed phrase', '“curly” quotes', 'back\\slash', 'x -"quoted phrase"',
  'title:test', '(climate)', 'a (-b)', '+a +b', 'café société', 'ü-bahn', 'COVID-19', 'a - b',
  '""', 'a "b c" d "e"', 'orange and lemons', 'ordinal andante', '(-a)', '-(a b)', 'a\tb'
)
for (q in tricky) add(q, default)
with <- function(...) { p <- default; v <- list(...); for (n in names(v)) p[[n]] <- v[[n]]; p }
add("climate", with(sorting = "most-recent", document_types = c("121", "7", "F")))
add("climate", modifyList(default, list(lang_id = list("eng", "ger"), min_descsize = 0)))
add("climate", modifyList(default, list(lang_id = list("all-lang"))))
add("climate", modifyList(default, list(exclude_date_filters = TRUE)))
add("climate", modifyList(default, list(exclude_date_filters = "true", vis_type = "timeline", limit = 1000)))
add("climate", modifyList(default, list(q_advanced = "dcsubject:ocean", repo = "ftunivlausanne", coll = "ftx")))
add("climate", modifyList(default, list(q_advanced = "dcsubject:ocean", q_advanced_only = "true")))
add("", modifyList(default, list(repo = "fttriple")))
add("climate", modifyList(default, list(custom_clustering = "title")))
add("climate", modifyList(default, list(custom_clustering = "ORKG")))
add("climate", with(document_types = character(0)))

res <- lapply(cases, function(case) {
  params <<- case$params
  if (!is.null(params$document_types)) params$document_types <<- unlist(params$document_types)
  if (!is.null(params$lang_id)) params$lang_id <<- unlist(params$lang_id)
  if (!is.null(params$q_advanced)) params$q_advanced <<- sanitize_query(params$q_advanced)$sanitized_query
  captured <<- NULL
  q <- sanitize_query(case$q)$sanitized_query
  tryCatch(get_papers(q, params), error = function(e) NULL)
  list(q = case$q, params = case$params, exact = if (is.null(q) || q == "") NULL else preprocess_query(q), request = captured)
})
writeLines(toJSON(res, auto_unbox = TRUE, null = "null", pretty = TRUE), out, useBytes = TRUE)
cat(length(res), "cases\n")
