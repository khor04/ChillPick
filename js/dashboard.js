document.addEventListener("DOMContentLoaded", function () {
  if (window.ChillPickHistoryBadges) {
    window.ChillPickHistoryBadges.applyAllBadges(".media-card");
  }

  document.querySelectorAll(".rec-pager").forEach(function (pager) {
    const items = pager.querySelectorAll(".rec-pager-item");
    const pageCount = Math.max(
      ...Array.from(items).map((el) => parseInt(el.dataset.page, 10) + 1)
    );
    let currentPage = 0;

    const prevBtn = document.querySelector(
      `.rec-prev[data-target="${pager.id}"]`
    );
    const nextBtn = document.querySelector(
      `.rec-next[data-target="${pager.id}"]`
    );

    function render() {
      items.forEach((el) => {
        el.style.display =
          parseInt(el.dataset.page, 10) === currentPage ? "" : "none";
      });
      if (prevBtn) prevBtn.disabled = currentPage === 0;
      if (nextBtn) nextBtn.disabled = currentPage === pageCount - 1;
    }

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        if (currentPage > 0) {
          currentPage -= 1;
          render();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        if (currentPage < pageCount - 1) {
          currentPage += 1;
          render();
        }
      });
    }

    render();
  });
});
