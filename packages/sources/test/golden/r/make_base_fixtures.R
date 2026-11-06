# Builds BASE API responses (XML, the format rbace parses) from the real BASE
# records in the R labelling replay inputs, and adds altered copies of some
# records so that duplicate handling is exercised: same or slightly changed
# titles, other open-access states, DOI versions, missing fields, datasets.
#
#   Rscript test/golden/r/make_base_fixtures.R test/fixtures/base
suppressMessages(library(xml2))
invisible(Sys.setlocale("LC_ALL", "en_US.UTF-8"))
outdir <- commandArgs(TRUE)[1]
here <- normalizePath(dirname(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE))))
replay <- normalizePath(file.path(here, "../../../../../server/preprocessing/other-scripts/test/replay"))
dir.create(outdir, showWarnings = FALSE, recursive = TRUE)

split_multi <- function(x) {
  x <- unlist(x)
  if (length(x) == 0 || is.na(x[1]) || x[1] == "") character(0) else strsplit(x[1], "; ", fixed = TRUE)[[1]]
}
one <- function(x) { x <- unlist(x); if (length(x) == 0) NA_character_ else as.character(x[1]) }
strip_doi <- function(x) gsub("https://doi.org/", "", x, fixed = TRUE)

to_doc <- function(r) {
  multi <- list(dcsubject = split_multi(r$subject_orig), dccreator = split_multi(r$authors),
                dctypenorm = split_multi(r$typenorm), dcdoi = strip_doi(split_multi(r$additional_dois)),
                dclang = split_multi(r$lang))
  r <- c(lapply(r[c("id", "title", "paper_abstract", "published_in", "year", "link", "oa_state", "identifier",
                   "relation", "type", "content_provider", "language", "coverage", "collection")], one),
         r[c("subject_orig", "authors", "typenorm", "additional_dois", "lang")])
  single <- list(dcdocid = r$id, dctitle = r$title, dcdescription = r$paper_abstract, dcsource = r$published_in,
                 dcdate = r$year, dclink = r$link, dcoa = r$oa_state, dcidentifier = r$identifier,
                 dcrelation = r$relation, dctype = r$type, dcprovider = r$content_provider,
                 dclanguage = r$language, dccoverage = r$coverage, dccollection = r$collection)
  list(single = single, multi = multi)
}

write_response <- function(docs, file, num_found) {
  x <- xml_new_root("response")
  h <- xml_add_child(x, "lst", name = "responseHeader")
  xml_add_child(h, "int", "0", name = "status")
  res <- xml_add_child(x, "result", name = "response", numFound = as.character(num_found), start = "0")
  for (d in docs) {
    doc <- xml_add_child(res, "doc")
    for (n in sort(c(names(d$single), names(d$multi)))) {
      if (n %in% names(d$multi)) {
        v <- d$multi[[n]]
        if (length(v) == 0) next
        a <- xml_add_child(doc, "arr", name = n)
        for (s in v) xml_add_child(a, "str", s)
      } else {
        v <- d$single[[n]]
        if (is.null(v) || is.na(v)) next
        xml_add_child(doc, if (n == "dcoa") "int" else "str", v, name = n)
      }
    }
  }
  write_xml(x, file)
}

set.seed(42)
for (name in c("base_cancer_research", "base_digital_education", "base_cancer_fallback")) {
  m <- readRDS(file.path(replay, paste0(name, ".inputs.rds")))$metadata
  docs <- lapply(seq_len(nrow(m)), function(i) to_doc(as.list(m[i, ])))
  picks <- sample(seq_along(docs), 14)
  extra <- list()
  for (k in seq_along(picks)) {
    d <- docs[[picks[k]]]
    d$single$dcdocid <- paste0(d$single$dcdocid, "dup", k)
    kind <- k %% 7
    if (kind == 0) d$single$dctitle <- toupper(d$single$dctitle)
    if (kind == 1) { d$single$dctitle <- paste0(d$single$dctitle, "."); d$single$dcoa <- "0" }
    if (kind == 2) { d$single$dcoa <- "1"; d$single$dcdescription <- NA }
    if (kind == 3) { d$multi$dcdoi <- c("10.5281/zenodo.100", "10.5281/zenodo.100.v2"); d$single$dclink <- "http://dx.doi.org/10.5281/zenodo.100.v2" }
    if (kind == 4) { d$multi$dctypenorm <- "7"; d$single$dcoa <- NA }
    if (kind == 5) d$single$dctitle <- paste(d$single$dctitle, "...")
    if (kind == 6) { d$multi$dcsubject <- c(d$multi$dcsubject, "ddc:570", "[SDV]Life Sciences [q-bio]"); d$single$dccollection <- "ftdoajarticles" }
    extra[[k]] <- d
  }
  # Two records sharing a DOI with unrelated titles, and a short title.
  a <- docs[[1]]; a$single$dcdocid <- "sharedoi_a"; a$single$dclink <- "https://doi.org/10.1234/shared"; a$single$dctitle <- "Totally unrelated work about soil"
  b <- docs[[2]]; b$single$dcdocid <- "sharedoi_b"; b$single$dclink <- "https://doi.org/10.1234/shared"
  s <- docs[[3]]; s$single$dcdocid <- "shorttitle"; s$single$dctitle <- "Cancer"
  all <- c(docs, extra, list(a, b, s))
  all <- all[sample(seq_along(all))]
  write_response(all, file.path(outdir, paste0(name, ".xml")), num_found = 5000)
  cat(name, length(all), "docs\n")
}
