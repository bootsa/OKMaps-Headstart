# Minimal re-implementation of the three GMD functions the R pipeline uses
# (css.hclust, elbow, elbow.batch), following GMD 0.3.3 (archived on CRAN).
# Used only to generate golden outputs where GMD itself is not installable.

.gmd_tss <- function(d) {
  n <- attr(d, "Size")
  mean(as.vector(d)^2) / 2 * (n - 1)
}

.gmd_wss <- function(dm, idx) {
  n <- length(idx)
  if (n > 1) {
    sub <- as.dist(dm[idx, idx])
    mean(as.vector(sub)^2) / 2 * (n - 1)
  } else if (n == 1) 0 else NA
}

css.hclust <- function(dist.obj, hclust.obj = NULL, hclust.FUN = hclust,
                       hclust.FUN.MoreArgs = list(method = "ward"), k = NULL) {
  n <- attr(dist.obj, "Size")
  if (is.null(k)) k <- min(n, 20)
  if (is.null(hclust.obj)) hclust.obj <- do.call(hclust.FUN, c(list(dist.obj), hclust.FUN.MoreArgs))
  dm <- as.matrix(dist.obj)
  tss <- .gmd_tss(dist.obj)
  totbss <- vapply(seq_len(k), function(kk) {
    cl <- cutree(hclust.obj, k = kk)
    totwss <- sum(vapply(unique(cl), function(c) .gmd_wss(dm, which(cl == c)), numeric(1)))
    tss - totwss
  }, numeric(1))
  ret <- data.frame(k = seq_len(k), ev = totbss / tss, totbss = totbss, tss = tss)
  attr(ret, "meta") <- list(cmethod = "hclust", dist.obj = dist.obj, k = k, hclust.obj = hclust.obj)
  class(ret) <- c("css.multi", class(ret))
  ret
}

elbow <- function(x, inc.thres, ev.thres, precision = 3, print.warning = TRUE) {
  inc <- c(x$ev[-1] - x$ev[-nrow(x)], 0)
  k1 <- x$k[x$ev - ev.thres >= -0.1^precision][1]
  xi <- x[-nrow(x), ]
  k2 <- xi$k[inc.thres - inc[-nrow(x)] >= -0.1^precision][1]
  k <- max(k1, k2)
  list(k = k, ev = x$ev[x$k == k], inc.thres = inc.thres, ev.thres = ev.thres)
}

elbow.batch <- function(x, inc.thres = c(0.01, 0.05, 0.1),
                        ev.thres = c(0.95, 0.9, 0.8, 0.75, 0.67, 0.5, 0.33), precision = 3) {
  inc.thres <- sort(inc.thres, decreasing = FALSE)
  ev.thres <- sort(ev.thres, decreasing = TRUE)
  for (e in ev.thres) for (i in inc.thres) {
    res <- elbow(x, inc.thres = i, ev.thres = e, precision = precision, print.warning = FALSE)
    if (!is.na(res$k)) {
      attr(res, "description") <- sprintf("k=%s ev.thres=%s inc.thres=%s", res$k, e, i)
      return(res)
    }
  }
  stop("A good `k' is not available with provided inc.thres and ev.thres")
}
