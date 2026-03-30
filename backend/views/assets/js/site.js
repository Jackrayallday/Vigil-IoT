(function () {
  var layer = document.getElementById("drift-layer");
  if (layer) {
    var dotCount = 54;
    for (var index = 0; index < dotCount; index += 1) {
      var dot = document.createElement("span");
      dot.className = "drift-dot";
      dot.style.setProperty("--dot-size", (0.12 + Math.random() * 0.28).toFixed(3) + "rem");
      dot.style.setProperty("--dot-opacity", (0.25 + Math.random() * 0.55).toFixed(3));
      dot.style.setProperty("--dot-duration", (18 + Math.random() * 32).toFixed(3) + "s");
      dot.style.setProperty("--dot-delay", (Math.random() * 6).toFixed(3) + "s");
      dot.style.setProperty("--dot-x", (Math.random() * 100).toFixed(3) + "%");
      dot.style.setProperty("--dot-y", (Math.random() * 100).toFixed(3) + "%");
      dot.style.setProperty("--dot-lightness", (52 + Math.random() * 24).toFixed(3) + "%");
      dot.style.setProperty("--dot-blur", (Math.random() * 0.6).toFixed(3) + "px");
      layer.appendChild(dot);
    }
  }

  var yearNode = document.getElementById("copyright-year");
  if (yearNode) {
    yearNode.textContent = String(new Date().getFullYear());
  }

  function initScreenshotCarousel() {
    var carousel = document.getElementById("screenshot-carousel");
    if (!carousel) return;

    var slides = Array.prototype.slice.call(carousel.querySelectorAll("[data-slide]"));
    if (slides.length === 0) return;

    var prevBtn = carousel.querySelector("[data-carousel-prev]");
    var nextBtn = carousel.querySelector("[data-carousel-next]");
    var dotsHost = carousel.querySelector("[data-carousel-dots]");
    var lightbox = document.getElementById("screenshot-lightbox");
    var lightboxImage = lightbox ? lightbox.querySelector("[data-lightbox-image]") : null;
    var lightboxCaption = lightbox ? lightbox.querySelector("[data-lightbox-caption]") : null;
    var lightboxPrevBtn = lightbox ? lightbox.querySelector("[data-lightbox-prev]") : null;
    var lightboxNextBtn = lightbox ? lightbox.querySelector("[data-lightbox-next]") : null;
    var lightboxCloseBtn = lightbox ? lightbox.querySelector(".lightbox-btn--close") : null;
    var lightboxCloseTriggers = lightbox
      ? Array.prototype.slice.call(lightbox.querySelectorAll("[data-lightbox-close]"))
      : [];
    var dots = [];
    var activeIndex = 0;
    var timerId = null;
    var isPaused = false;
    var lightboxIsOpen = false;
    var lastFocusedElement = null;
    var parsedInterval = Number(carousel.getAttribute("data-interval-ms"));
    var intervalMs = Number.isFinite(parsedInterval) ? parsedInterval : 5000;
    var reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function getSlideImage(index) {
      return slides[index] ? slides[index].querySelector("img") : null;
    }

    function getSlideCaption(index) {
      return slides[index] ? slides[index].querySelector("figcaption") : null;
    }

    function setActive(nextIndex) {
      var boundedIndex = nextIndex;
      if (boundedIndex < 0) boundedIndex = slides.length - 1;
      if (boundedIndex >= slides.length) boundedIndex = 0;
      activeIndex = boundedIndex;

      for (var i = 0; i < slides.length; i += 1) {
        var isActive = i === activeIndex;
        slides[i].classList.toggle("is-active", isActive);
        slides[i].setAttribute("aria-hidden", isActive ? "false" : "true");
        if (dots[i]) {
          dots[i].classList.toggle("is-active", isActive);
          dots[i].setAttribute("aria-current", isActive ? "true" : "false");
        }
      }

      if (lightboxIsOpen) {
        syncLightboxContent();
      }
    }

    function stopTimer() {
      if (timerId !== null) {
        window.clearInterval(timerId);
        timerId = null;
      }
    }

    function startTimer() {
      stopTimer();
      if (isPaused || lightboxIsOpen || slides.length < 2 || reduceMotion || intervalMs <= 0) return;
      timerId = window.setInterval(function () {
        setActive(activeIndex + 1);
      }, intervalMs);
    }

    function syncLightboxContent() {
      if (!lightboxImage || !lightboxCaption) return;
      var image = getSlideImage(activeIndex);
      if (!image) return;
      var caption = getSlideCaption(activeIndex);
      lightboxImage.setAttribute("src", image.getAttribute("src") || "");
      lightboxImage.setAttribute("alt", image.getAttribute("alt") || "");
      lightboxCaption.textContent = caption ? caption.textContent : "";
    }

    function openLightbox(index) {
      if (!lightbox || !lightboxImage || !lightboxCaption) return;
      lastFocusedElement = document.activeElement;
      setActive(index);
      syncLightboxContent();
      lightbox.hidden = false;
      lightbox.setAttribute("aria-hidden", "false");
      lightboxIsOpen = true;
      isPaused = true;
      stopTimer();
      document.body.classList.add("has-lightbox-open");
      if (lightboxCloseBtn && typeof lightboxCloseBtn.focus === "function") {
        lightboxCloseBtn.focus();
      }
    }

    function closeLightbox() {
      if (!lightbox || !lightboxIsOpen) return;
      lightboxIsOpen = false;
      lightbox.hidden = true;
      lightbox.setAttribute("aria-hidden", "true");
      document.body.classList.remove("has-lightbox-open");
      isPaused = false;
      startTimer();
      if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
        lastFocusedElement.focus();
      }
    }

    if (dotsHost) {
      for (var index = 0; index < slides.length; index += 1) {
        var dot = document.createElement("button");
        dot.type = "button";
        dot.className = "carousel-dot";
        dot.setAttribute("aria-label", "Show screenshot " + (index + 1));
        (function (dotIndex) {
          dot.addEventListener("click", function () {
            setActive(dotIndex);
            startTimer();
          });
        })(index);
        dotsHost.appendChild(dot);
        dots.push(dot);
      }
    }

    for (var slideIndex = 0; slideIndex < slides.length; slideIndex += 1) {
      (function (imageIndex) {
        slides[imageIndex].addEventListener("click", function (event) {
          var clickedImage = event.target && event.target.closest("img");
          if (!clickedImage) return;
          openLightbox(imageIndex);
        });
      })(slideIndex);
    }

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        setActive(activeIndex - 1);
        startTimer();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        setActive(activeIndex + 1);
        startTimer();
      });
    }

    if (lightboxPrevBtn) {
      lightboxPrevBtn.addEventListener("click", function () {
        setActive(activeIndex - 1);
      });
    }

    if (lightboxNextBtn) {
      lightboxNextBtn.addEventListener("click", function () {
        setActive(activeIndex + 1);
      });
    }

    if (lightboxCloseTriggers.length > 0) {
      for (var closeIndex = 0; closeIndex < lightboxCloseTriggers.length; closeIndex += 1) {
        lightboxCloseTriggers[closeIndex].addEventListener("click", function () {
          closeLightbox();
        });
      }
    }

    document.addEventListener("keydown", function (event) {
      if (!lightboxIsOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeLightbox();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setActive(activeIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setActive(activeIndex + 1);
      }
    });

    carousel.addEventListener("mouseenter", function () {
      isPaused = true;
      stopTimer();
    });

    carousel.addEventListener("mouseleave", function () {
      isPaused = false;
      startTimer();
    });

    carousel.addEventListener("focusin", function () {
      isPaused = true;
      stopTimer();
    });

    carousel.addEventListener("focusout", function () {
      if (!carousel.contains(document.activeElement)) {
        isPaused = false;
        startTimer();
      }
    });

    setActive(0);
    startTimer();
  }

  initScreenshotCarousel();
})();
