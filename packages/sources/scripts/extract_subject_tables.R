# Writes the lookup tables of subject_cleaning.R and jel_codes.R to
# resources/subject_tables.json, so the TypeScript port uses the same lists.
# Rerun after editing those R files:
#
#   Rscript scripts/extract_subject_tables.R
suppressMessages(library(jsonlite))
invisible(Sys.setlocale("LC_ALL", "en_US.UTF-8"))
here <- normalizePath(dirname(sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE))))
scripts <- normalizePath(file.path(here, "../../../server/preprocessing/other-scripts"))
old <- setwd(scripts)
source("subject_cleaning.R")
setwd(old)
named <- function(x) as.list(x)
tables <- list(
  meshDeinversionExclusions = MESH_DEINVERSION_EXCLUSIONS,
  meshQualifiers = MESH_QUALIFIERS,
  toulouseSubjects = TOULOUSE_SUBJECTS,
  lccToplevelCaptions = named(LCC_TOPLEVEL_CAPTIONS),
  lccSubclassWords = named(LCC_SUBCLASS_WORDS),
  lccSubclassAbbrev = LCC_SUBCLASS_ABBREV,
  lccDoajCaptionClasses = named(LCC_DOAJ_CAPTION_CLASSES),
  jelCaptions = named(JEL_CAPTIONS),
  jelFalsePositives = JEL_FALSE_POSITIVES
)
writeLines(toJSON(tables, auto_unbox = TRUE, pretty = TRUE), file.path(here, "../resources/subject_tables.json"), useBytes = TRUE)
