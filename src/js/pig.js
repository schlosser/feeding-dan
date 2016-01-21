(function(global) {
  'use strict';

  /**
   * optimizedResize is adapted from Mozilla code:
   * https://developer.mozilla.org/en-US/docs/Web/Events/resize
   */
  var optimizedResize = (function() {
    var callbacks = [];
    var running = false;

    // fired on resize event
    function resize() {
      if (!running) {
        running = true;
        if (window.requestAnimationFrame) {
          window.requestAnimationFrame(runCallbacks);
        } else {
          setTimeout(runCallbacks, 66);
        }
      }
    }

    // run the actual callbacks
    function runCallbacks() {
      callbacks.forEach(function(callback) {
        callback();
      });

      running = false;
    }

    return {
      add: function(callback) {
        if (!callbacks.length) {
          window.addEventListener('resize', resize);
        }

        callbacks.push(callback);
      },

      disable: function() {
        window.removeEventListener('resize', resize);
      },

      reEnable: function() {
        window.addEventListener('resize', resize);
      },
    };
  }());

  var DEFAULT_SETTINGS = {

    /**
     * In px
     */
    mobileWidth: 640,

    /**
     * In px
     */
    spaceBetweenImages: 8, // px

    /**
     * In ms
     */
    transitionSpeed: 300,

    /**
     * Get the URL for an image with the given filename & size.
     */
    urlForSize: function(filename, size) {
      return '/' + filename + '?s=' + size;
    },

    /**
     * Get the minimum required aspect ratio for a valid row of images.
     */
    getMinAspectRatio: function() {
      var windowWidth = window.innerWidth;
      if (windowWidth <= 640)
        return 2;
      else if (windowWidth <= 1280)
        return 4;
      else if (windowWidth <= 1920)
        return 5;
      return 6;
    },
  };

  var SIZES = {
    thumbnail: 20,
    small: 100,
    medium: 250,
    large: 500,
  };

  var TRANSITION_TIMEOUT_SCALE_FACTOR = 1.5; // px
  var HEIGHT_OF_PRIMARY_IMAGE_BUFFER = 1500; // px
  var HEIGHT_OF_SECONDARY_IMAGE_BUFFER = 200; // px

  function _extend(obj1, obj2) {
    for (var i in obj2) {
      if (obj2.hasOwnProperty(i)) {
        obj1[i] = obj2[i];
      }
    }
  }

  function Pig(container, imageData, options) {
    this.inRAF = false;
    this.isTransitioning = false;
    this.visibleImages = [];
    this.latestYOffset;
    this.lastWindowWidth = window.innerWidth;
    this.scrollDirection = 'down';

    // Extend default settings with the passed options
    this.settings = DEFAULT_SETTINGS;
    _extend(this.settings, options || {});

    this.container = container;
    this.images = this._parseImageData(imageData);

    if (!container) {
      console.error('Container must not be null.');
    }

    return this;
  }

  /**
   * in ms
   */
  Pig.prototype._getTransitionTimeout = function() {
    return this.settings.transitionSpeed * TRANSITION_TIMEOUT_SCALE_FACTOR;
  };

  Pig.prototype._getTransitionString = function() {
    if (this.isTransitioning) {
      return (this.settings.transitionSpeed / 1000) + 's transform ease';
    }

    return 'none';
  };

  Pig.prototype._maxAspectRatioRequiresTransition = function(maxAspectRatio) {
    var oldMaxAspectRatio = this.latestMaxAspectRatio || maxAspectRatio;
    this.latestMaxAspectRatio = maxAspectRatio;
    return (maxAspectRatio !== oldMaxAspectRatio);
  };

  Pig.prototype._parseImageData = function(imageData) {
    var progressiveImages = [];

    imageData.forEach(function(image, index) {
      var progressiveImage = new ProgressiveImage(image, index, this);
      progressiveImages.push(progressiveImage);
    }.bind(this));

    return progressiveImages;
  };

  Pig.prototype._computeLayout = function() {
    console.log('_computeLayout');
    var row = [];
    var translateX = 0;
    var translateY = 0;
    var rowAspectRatio = 0;
    var wrapperWidth = parseInt(this.container.clientWidth);
    var maxAspectRatio = this.settings.getMinAspectRatio();

    if (!this.isTransitioning && this._maxAspectRatioRequiresTransition(maxAspectRatio)) {
      this.isTransitioning = true;
      setTimeout(function() {
        this.isTransitioning = false;
      }, this._getTransitionTimeout());
    }

    var transition = this._getTransitionString();

    [].forEach.call(this.images, function(image, index) {
      rowAspectRatio += parseFloat(image.aspectRatio);
      row.push(image);

      if (rowAspectRatio >= maxAspectRatio || index + 1 === this.images.length) {
        // compute styles

        var totalWidthOfImages = wrapperWidth - this.settings.spaceBetweenImages * (row.length - 1);
        var rowHeight = totalWidthOfImages / rowAspectRatio;

        row.forEach(function(img) {
          var imageWidth = rowHeight * img.aspectRatio;
          img.style = {
            width: parseInt(imageWidth),
            height: parseInt(rowHeight),
            translateX: translateX,
            translateY: translateY,
            transition: transition,
          };
          translateX += imageWidth + this.settings.spaceBetweenImages;
        }.bind(this));

        // Reset for next row;
        row = [];
        rowAspectRatio = 0;
        translateY += parseInt(rowHeight) + this.settings.spaceBetweenImages;
        translateX = 0;
      }
    }.bind(this));

    // No space below the last image
    this.totalHeight = translateY - this.settings.spaceBetweenImages;
  };

  Pig.prototype._doLayout = function() {
    console.log('_doLayout');
    this.container.style.height = this.totalHeight + 'px';
    var containerOffset = this.container.offsetTop;
    var windowHeight = window.innerHeight;
    var bufferTop = (this.scrollDirection === 'up') ? HEIGHT_OF_PRIMARY_IMAGE_BUFFER : HEIGHT_OF_SECONDARY_IMAGE_BUFFER;
    var bufferBottom = (this.scrollDirection === 'down') ? HEIGHT_OF_PRIMARY_IMAGE_BUFFER : HEIGHT_OF_SECONDARY_IMAGE_BUFFER;
    console.log(bufferTop, bufferBottom);
    var minTranslateYPlusHeight = this.latestYOffset - containerOffset - bufferTop;
    var maxTranslateY = this.latestYOffset + windowHeight + bufferBottom;

    this.images.forEach(function(image) {
      if (image.style.translateY + image.style.height < minTranslateYPlusHeight || image.style.translateY > maxTranslateY) {

        // Hide Image
        if (image.existsOnPage) {
          this.container.removeChild(image.getElement());
        }

        image.hide();
      } else {

        // Show Image
        if (!image.existsOnPage) {
          var imageElement = image.getElement();

          if (!this.visibleImages.length || image.index > this.visibleImages[this.visibleImages.length - 1].index) {
            // Insert at the end
            this.container.appendChild(imageElement);
          } else if (image.index < this.visibleImages[0].index) {
            // Insert at the beginning
            this.container.insertBefore(imageElement, this.visibleImages[0].getElement());
          } else {
            // Insert in the middle
            var visibleIndex = 0;
            while (this.visibleImages[visibleIndex].index < image.index) {
              visibleIndex++;
            }

            this.container.insertBefore(imageElement, this.visibleImages[visibleIndex]);
          }

          image.existsOnPage = true;
        }

        image.load(this.lastWindowWidth);
      }
    }.bind(this));
  };

  Pig.prototype.getOnScroll = function() {
    var _this = this;
    var onScroll = function() {
      var newYOffset = window.pageYOffset;
      _this.previousYOffset = _this.latestYOffset || newYOffset;
      _this.latestYOffset = newYOffset;
      _this.scrollDirection = (_this.latestYOffset > _this.previousYOffset) ? 'down' : 'up';
      if (!_this.inRAF) {
        _this.inRAF = true;
        window.requestAnimationFrame(function() {
          _this._doLayout();
          _this.inRAF = false;
        });
      }
    };

    return onScroll;
  };

  Pig.prototype.enable = function() {
    this.onScroll = this.getOnScroll();
    window.addEventListener('scroll', this.onScroll);

    this.onScroll();
    this._computeLayout();
    this._doLayout();

    optimizedResize.add(function() {
      this.lastWindowWidth = window.innerWidth;
      this._computeLayout();
      this._doLayout();
    }.bind(this));

    return this;
  };

  Pig.prototype.disable = function() {
    window.removeEventListener('scroll', this.onScroll);
    optimizedResize.disable();
    return this;
  };

  Pig.prototype.stats = function() {
    var start = 0;
    var currentState = this.images[0].existsOnPage;
    for (var i = 1; i < this.images.length; i++) {
      var image = this.images[i];
      if (image.existsOnPage !== currentState) {
        console.log(start, i - 1, currentState);
        start = i;
        currentState = image.existsOnPage;
      }
    }
    console.log(start, i, currentState);
  }

  /**
   *
   */
  function ProgressiveImage(singleImageData, index, pig) {
    this.isVisible = false;
    this.existsOnPage = false;

    this.index = index;
    this.date = Date.parse(singleImageData.date);
    this.aspectRatio = singleImageData.aspectRatio;
    this.filename = singleImageData.filename;
    this.sizes = {};
    this.thumbnailLoaded = false;
    this.loaded = false;

    for (var size in SIZES) {
      if (SIZES.hasOwnProperty(size)) {
        this.sizes[size] = pig.settings.urlForSize(this.filename, SIZES[size]);
      }
    }

    return this;
  }

  ProgressiveImage.prototype.load = function(lastWindowWidth) {
    setTimeout(function() {
      if (!this.existsOnPage) {
        return;
      }

      this._updateStyles();

      if (this.isVisible) {
        return;
      }

      // Show thumbnail
      if (!this.thumbnail) {
        console.log('thumbnail')
        this.thumbnail = new Image();
        this.thumbnail.src = this.sizes.thumbnail;
        this.thumbnail.className = 'progressive-thumbnail';
        this.thumbnail.onload = function() {
          // We have to make sure thumbnail still exists, we may have already been
          // deallocated if the user scrolls too fast.
          if (this.thumbnail) {
            this.thumbnail.className += ' loaded';
            this.thumbnailLoaded = true;
          }
        }.bind(this);

        this.element.appendChild(this.thumbnail);
      }

      // Show full image
      if (!this.fullImage) {
        this.fullImage = new Image();

        if (lastWindowWidth <= 640) {
          console.log('small')
          this.fullImage.src = this.sizes.small;
        } else {
          console.log('medium')
          this.fullImage.src = this.sizes.medium;
        }

        this.fullImage.onload = function() {
          // We have to make sure fullImage still exists, we may have already been
          // deallocated if the user scrolls too fast.
          if (this.fullImage) {
            this.fullImage.className += ' loaded';
            this.loaded = true;
          }
        }.bind(this);

        this.element.appendChild(this.fullImage);
      }

    }.bind(this), 100)
  };

  ProgressiveImage.prototype.hide = function() {

    if (this.element) {
      console.log("hiding:", this.loaded, this.thumbnailLoaded);
      if (this.thumbnail) {
        this.element.removeChild(this.thumbnail);
        delete this.thumbnail;
      }

      if (this.fullImage) {
        this.element.removeChild(this.fullImage);
        delete this.fullImage;
      }
    }

    this.existsOnPage = false;
    this.isVisible = false;
  }

  ProgressiveImage.prototype.getElement = function() {
    if (!this.element) {
      this.element = document.createElement('figure');
      this.element.className = 'progressive';
      this._updateStyles();
    }

    return this.element;
  };

  ProgressiveImage.prototype._updateStyles = function() {
    this.element.style.transition = this.style.transition;
    this.element.style.width = this.style.width + 'px';
    this.element.style.height = this.style.height + 'px';
    this.element.style.transform = (
      'translate3d(' + this.style.translateX + 'px,' +
        this.style.translateY + 'px, 0)');
  };

  if (typeof define === 'function' && define.amd) {
    define(Pig);
  } else if (typeof module !== 'undefined' && module.exports) {
    module.exports = Pig;
  } else {
    global.Pig = Pig;
  }

}(this));
