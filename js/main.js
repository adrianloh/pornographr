/*global $, ko, document, window */
"use strict";

function has_key(o,k) {
	return !(o[k]===undefined);
}

var HeaderControls = (function() {
	var self = {};
	self.isLoading = ko.observable(false);
	return self;
})();

ko.applyBindings(HeaderControls, document.getElementById("headerControls"));

// --------------------- MAIN ------------------------- //

var firebase = new Firebase('https://oogly.firebaseio-demo.com/');

var Peekaboo = {};

var Pornographr = angular.module('Pornographr', ['flickrFactory', 'flickrAuth', 'pasvaz.bindonce']);

Pornographr.config(function ($anchorScrollProvider, $locationProvider) {
	$locationProvider.html5Mode(true);
	$anchorScrollProvider.disableAutoScrolling();
});

Pornographr.directive('onFinishImageRender', function ($timeout, flickrFactory) {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			$(element).one("load", function(e) {
				var photoId = element.attr("id");
				if (photoId===flickrFactory.photoidOfLastImage) {
					$timeout(function () {
						scope.$emit('lastImageRendered');
					});
				}
			});
		}
	};
});

Pornographr.directive('keyboardEvents', function ($document, $rootScope, flickrFactory, tagService, keyboardService) {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			var keys = {
					shift: 16,
					arrow_right: 39,
					arrow_left: 37,
					spacebar: 32,
					enter: 13,
					del: 46,
					backspace: 8,
					alpha_o: 79,
					alpha_p: 80,
					alpha_q: 81,
					alpha_i: 73,
					pageUp: 33,
					pageDown: 34,
					end: 35,
					home: 36,
					arrow_up: 38,
					arrow_down: 40,
					tilde: 192,
					esc: 27,
					plus: 187,
					backslash: 191,
					alt: 18,
					zero: 48
				},
				boundKeyCodes = {},
				alphabets = {},
				numbers_over_zero = {},
				i,k;
			for (k in keys) {
				boundKeyCodes[keys[k]] = true;
			}
			for (i=65;i<91;++i) {
				alphabets[i] = true;
				boundKeyCodes[i] = true;
			}
			for (i=49;i<58;++i) {
				numbers_over_zero[i] = true;
				boundKeyCodes[i] = true;
			}

			var inputBoxHolder = $("#tagInputBoxHolder"),
				inputBox = $("#tagInputBox");

			var editingShorcutForTag = null;
			$rootScope.$on("editingShortcutNumber", function(event, tagName) {
				// This is emitted from GalleryController
				editingShorcutForTag = tagName;
			});

			$document.on("keydown", function(e) {
				var keyCode = e.keyCode;
				if (has_key(boundKeyCodes, keyCode)) {
					if (has_key(alphabets, keyCode)) {
						// If we start typing words, open the input box and start
						// reading input ala entering timecodes in FCP
						if (!inputBoxHolder.is(":visible")) {
							inputBoxHolder.show();
							inputBox.focus();
						} else {
							if ($(document.activeElement)[0].tagName.toLowerCase()!=='input') {
								inputBox.val("");
								inputBox.focus();
							}
						}
					} else if (numbers_over_zero.hasOwnProperty(keyCode)) {
						// If we're entering numbers...
						if (editingShorcutForTag!==null) {
							// We're renumbering a shortcut
							var data = {tag: editingShorcutForTag, number: keyCode-48};
							$rootScope.$broadcast("setShortcutNumber", data); // This is intercepted by GalleryController
							editingShorcutForTag = null;
							e.preventDefault();
						} else if ($(document.activeElement)[0].tagName.toLowerCase()!=='input') {
							// We're entering numbers but not into the input box,
							// activate a tag for painting
							var index = keyCode-48-1,
								newTag = tagService.shortcuts[index];
							if (newTag) {
								$rootScope.$broadcast("keyboardArmTag", {
									tag: newTag
								});
							}
							e.preventDefault();
						}
					} else {
						switch (keyCode)
						{
							case keys.arrow_right:
								$rootScope.$broadcast("goToNextImage");
								e.preventDefault();
								break;
							case keys.arrow_left:
								$rootScope.$broadcast("goToPreviousImage");
								e.preventDefault();
								break;
							case keys.tilde:
								flickrFactory.fetchMoreImages($scope, true);
								e.preventDefault();
								break;
							case keys.esc:
								if (inputBoxHolder.is(":visible")) {
									inputBoxHolder.blur().hide();
									inputBox.val("");
								} else {
									$(".ui-selected").removeClass("ui-selected");
									tagService.resetTileColors();
								}
								e.preventDefault();
								break;
							case keys.spacebar:
								if ($(document.activeElement)[0].tagName.toLowerCase()!=='input') {
									e.preventDefault();
								}
								break;
							case keys.backspace:
								if ($(document.activeElement)[0].tagName.toLowerCase()!=='input') {
									e.preventDefault();
								}
								break;
							case keys.shift:
								keyboardService.shiftKeyDown = true;
								e.preventDefault();
								break;
							case keys.alt:
								keyboardService.altKeyDown = true;
								e.preventDefault();
								break;
						}
					}
				}
			}).on("keyup", function(e) {
				var keyCode = e.keyCode;
				if (has_key(boundKeyCodes, keyCode)) {
					if (numbers_over_zero.hasOwnProperty(keyCode)) {
						// Pass
					} else {
						switch (keyCode)
						{
							case keys.shift:
								keyboardService.shiftKeyDown = false;
								e.preventDefault();
								break;
							case keys.alt:
								keyboardService.altKeyDown = false;
								e.preventDefault();
								break;
						}
					}
				}
			});
		}
	};
});

Pornographr.directive('selectionInteractions', function ($rootScope, tagService, keyboardService, flickrFactory) {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			// Enable selecting images that are visible
			var _selectRange = false, _deselectQueue = [];
			function deselect(el) {
				$(el).removeClass('ui-selecting').removeClass('ui-selected');
			}
			$(element).selectable({
				filter: ".imageInView", // This class will be added by directive:autoloadContentOnScroll
				selecting: function (event, ui) {
					if (event.detail===0) {
						_selectRange = true;
						return true;
					}
					// If a tag is ARMED
					if (tagService.activeTag.length>0 && !keyboardService.altKeyDown) {
						var self = ui.selecting,
							tag = tagService.activeTag,
							photoId = self.id,
							imageHolder = $("#holder_" + photoId);
						// If this image is already tagged with this keyword...
						if (has_key(flickrFactory.tags, tag) &&
							has_key(flickrFactory.tags[tag], photoId)) {
							if (!keyboardService.shiftKeyDown &&
								tagService.filteredByActiveTag()) {
								// ... and the armed tag is also the active filter and
								// the user is not holding down SHIFT, then untag the image...
								flickrFactory.untagImage(photoId, tag).then(function(resObject) {
									deselect(self);
									$rootScope.$broadcast("refreshFilters");
								});
							} else {
								// Not in filter mode, just give some kind of indication
								// that the image is already tagged
								imageHolder.addClass("imageHolderOK");
								setTimeout(function() {
									imageHolder.removeClass("imageHolderOK");
									deselect(self);
								}, 250);
							}
						} else {
							// This image is not tagged
							flickrFactory.tagImage(photoId, tag).then(function(resObject) {
								var res = resObject.data;
								if (res.stat==='ok') {
									imageHolder.addClass("imageHolderOK");
									setTimeout(function() {
										imageHolder.removeClass("imageHolderOK");
										deselect(self);
									}, 250);
									if (tagService.filteredByActiveTag()) {
										$rootScope.$broadcast("refreshFilters");
//										flickrFactory.db[photoId].ui.dimwit = true;
									}
								}
							});
						}
					} else {
						if (keyboardService.shiftKeyDown) {
							// Makes marquee selections always add to the current set
						} else {
							if ($(ui.selecting).hasClass('ui-selected')) {
								_deselectQueue.push(ui.selecting);
							}
						}
					}
				},
				unselecting: function (event, ui) {
					$(ui.unselecting).addClass('ui-selected');
				},
				stop: function () {
					if (!_selectRange) {
						$.each(_deselectQueue, function (ix, de) {
							$(de)
								.removeClass('ui-selecting')
								.removeClass('ui-selected');
						});
					}
					_selectRange = false;
					_deselectQueue = [];
				}
			});
		}
	}
});

Pornographr.directive('autoloadContentOnScroll', function ($timeout, $location, flickrFactory, $rootScope) {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			var last_position = 0,
				scrollingContainer = $(element),
				autopageContent = $("#autopageContent"),
				applyChanges = $timeout(function() {
					scope.$apply();
				});

			var WINDOW_HEIGHT = $(window).height(),
				selectableClassName = "imageInView";

			function isInsideViewport(top) {
				return -10<top==top<WINDOW_HEIGHT;
			}

			// Note, $.debounce regulates the frequency the callback function is invoked
			scrollingContainer.scroll($.debounce(750, function() {
				// The moment we stop scrolling...
				$("."+selectableClassName).removeClass(selectableClassName);
				// Get all visible rows in the viewport
				var rowsInView = $("ul").filter(function(i,el) {
					return isInsideViewport($(el).offset().top);
				});
				// Save the first visible row in localStorage so we can recall
				// it later when we reload the site
				localStorage.firstVisibleRow = rowsInView[0].getAttribute("id");
				// Tag all images in the visible rows as selectable
				rowsInView.find("img").addClass(selectableClassName);
				$rootScope.$broadcast("viewIsRefreshed");
			}));

			scrollingContainer.scroll(function () {
				$timeout.cancel(applyChanges);
				if (!($location.hash()==="null") && !scope.isAutoScroll) {
					scope.$apply(function() {
						$location.hash('null');
					});
				}
				var pos1 = (autopageContent.position().top-scrollingContainer.height())*-1/scrollingContainer.height(),
					pos = pos1/(autopageContent.height()/scrollingContainer.height());
				if (pos>last_position) {
					// User is scrolling down
					if (pos>=0.95) {
						flickrFactory.fetchMoreImages(scope, 1);
					}
				} else {
					// User is scrolling up
					if (pos1===1) {
						flickrFactory.fetchMoreImages(scope, -1);
					}
				}
				last_position = pos;
			});

		}
	}
});

Pornographr.directive('draggableWidget', function () {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			$(element).draggable();
		}
	}
});

Pornographr.directive('inputBoxOps', function () {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			$(element).on("submit", function(e) {
				var kv = scope.textValue.split(":"), // textValue is the ng-model on $("#tagInputBox")
					key = $.trim(kv[0]),
					value = $.trim(kv[1]);
				if (key.match(/hide/)) {
					// Hide images matching tag
				} else if (key.match(/tag/)) {
					scope.createWidgetWithTag(value);
					scope.$apply(function() {
						scope.textValue = "tag: ";
					});
				}
			});
		}
	}
});

Pornographr.factory("keyboardService", function() {

	var factory = {};
	factory.altKeyDown = false;
	factory.shiftKeyDown = false;
	return factory;

});

Pornographr.factory("heatFactory", function(flickrFactory) {

	var factory = {},
		Heat,
		el = $("#heatmapArea"),
		container = $("#container");

	factory.dataPoints = ko.observableArray([]);

	var waitForRows = setInterval(function() {
		if ($(".photoRow").width()!==null) {
			launch();
			clearInterval(waitForRows);
		}
	}, 500);

	function launch() {

		var	width_heat = el.width()*0.95,
			height_heat = el.height()*0.95,
			width_row = $(".photoRow").width(),
			width_cell = 80;

		Heat = h337.create({"element":document.getElementById("heatmapArea"), "radius":10, "visible":true});
		container.scrollTo();

		Heat.get("canvas").onclick = function(ev){
			var pos = h337.util.mousePosition(ev),
				row = parseInt((pos[1]/height_heat)*(flickrFactory.photoRows.length-1), 10);
			container.scrollTo($($(".photoRow")[row]), 600);
		};

		Heat.newData = function(coor) {
			// Where coor is [index_of_photo_in_row, id_of_row]
			var x = coor[0] * width_cell,
				y = $(".photoRow").index($("#"+coor[1])),
				elX = (x/width_row)*width_heat,
				elY = (y/flickrFactory.photoRows.length)*height_heat;
			Heat.store.addDataPoint(elX, elY);
		}

	}

	factory.drawFilterMap = function(listOfPhotoIds) {
		el.addClass("heatMapUnderFilter");
		Heat.clear();
		var i = listOfPhotoIds.length, coor;
		while(i--) {
			coor = flickrFactory.getCoordinatesOfPhotoId(listOfPhotoIds[i]);
			Heat.newData(coor);
		}
	};

	factory.refresh = function() {
		try {
			Heat.clear();
		} catch(e) {
			/* On first launch, Heat could still be undefined */
		}
		el.removeClass("heatMapUnderFilter");
		factory.dataPoints().forEach(function(coor) {
			Heat.newData(coor);
		});
	};

	factory.dataPoints.subscribe(function(dataPoints) {
		var v = dataPoints.slice(-1)[0];
		Heat.newData(v);
	});

	return factory;

});

Pornographr.factory("tagService", function() {

	var factory = {};
	factory.activeTag = "";
	factory.tagFilters = [];
	factory.shortcuts = [null, null, null, null, null, null, null, null, null];
	factory.filteredByActiveTag = function() {
		return factory.tagFilters.indexOf(factory.activeTag)>=0;
	};
	factory.resetTileColors = function() {
		["imageHolderError", "imageHolderOK"].forEach(function(selector) {
			$("."+selector).removeClass(selector);
		});
	};
	return factory;

});

Pornographr.controller("TaggingController", function($rootScope, $scope, $timeout, heatFactory, flickrFactory, tagService, keyboardService) {

	Peekaboo.taggingController = $scope;

	$scope.existingWidgets = {};
	$scope.tagWidgets = [];
	$scope.shortcuts = tagService.shortcuts;
	$scope.tagFilters = tagService.tagFilters;

	function persist() {
		var saveData = {};
		saveData.tagWidgets = $scope.tagWidgets;
		saveData.shortcuts = $scope.shortcuts;
		localStorage.taggingController = JSON.stringify(saveData);
	}

	function refreshFilters() {
		if ($scope.tagFilters.length>0) {
			var qualifiedPhotos = [];
			for (var photoId in flickrFactory.db) {
				var isTagged = [],
					photo = flickrFactory.db[photoId];
				$scope.tagFilters.forEach(function(tag) {
					try {
						if (flickrFactory.tags[tag][photoId]!==undefined) {
							isTagged.push(true);
						}
					} catch(e) { /*pass*/ }
				});
				photo.ui.dimwit = isTagged.length===$scope.tagFilters.length;
				if (photo.ui.dimwit) {
					qualifiedPhotos.push(photoId);
				}
			}
			heatFactory.drawFilterMap(qualifiedPhotos);
		} else {
			heatFactory.refresh();
		}
	}

	$rootScope.$on("refreshFilters", refreshFilters);

	$scope.activeTag = function() {
		return tagService.activeTag;
	};

	$scope.createWidgetWithTag = function(name, shortcutNumber) {
		// shortcutNumber is only passed in when we restore state
		// after we reload the site
		if (!$scope.existingWidgets.hasOwnProperty(name)) {
			var availableShortcutSlot,
				widget = {
				name: name
			};
			$scope.existingWidgets[widget.name] = widget;
			$scope.$apply(function() {
				if (shortcutNumber===undefined) {
					availableShortcutSlot = $scope.shortcuts.indexOf(null);
					if (availableShortcutSlot>=0) {
						$scope.shortcuts[availableShortcutSlot] = name;
					}
				} else {
					$scope.shortcuts[shortcutNumber] = name;
				}
				$scope.tagWidgets.push(widget);
				if ($scope.tagWidgets.length===0) {
					$scope.armTagWidget(name);
					$scope.toggleTagFilter(name);
				}
			});
			persist();
		}
	};

	$scope.armTagWidget = function(tagName) {
		var actionArm;
		if (tagService.activeTag===tagName) {
			// Disarm
			tagService.activeTag = "";
			actionArm = false;
		} else {
			// Arm
			tagService.activeTag = tagName;
			actionArm = true;
		}
		var index = $scope.tagFilters.indexOf(tagName);
		if (actionArm) {
			if (index>=0) {
				$scope.tagFilters.splice(index,1);
			}
		} else {
			if (index<0) {
				$scope.tagFilters.push(tagName);
			}
		}
		if (!keyboardService.altKeyDown) {
			$scope.toggleTagFilter(tagName);
		}
	};

	$rootScope.$on("keyboardArmTag", function(event, data) {
		$scope.$apply(function() {
			$scope.armTagWidget(data.tag);
		});
	});

	$rootScope.$on("setShortcutNumber", function(event, data) {
		// data.number is the number pressed on the keyboard, -1 to get the index
		var keyboardNumber = data.number-1,
			tagName = data.tag;
		$scope.$apply(function() {
			$scope.shortcuts[keyboardNumber] = tagName;
			persist();
		});
	});

	$scope.assignShortcut = function(tagName, event) {
		$scope.shortcuts[$scope.shortcuts.indexOf(tagName)] = null;
		$rootScope.$broadcast("editingShortcutNumber", tagName);
	};

	$scope.removeTagWidget = function(widget) {
		delete $scope.existingWidgets[widget.name];
		$scope.tagWidgets.splice($scope.tagWidgets.indexOf(widget),1);
		if (tagService.activeTag===widget.name) {
			tagService.activeTag = "";
		}
		var index = $scope.tagFilters.indexOf(widget.name);
		if (index>=0) {
			$scope.tagFilters.splice(index,1);
		}
		index = $scope.shortcuts.indexOf(widget.name);
		if (index>=0) {
			$scope.shortcuts[index] = null;
		}
		persist();
	};

	$scope.toggleTagFilter = function(tagName) {
		var index = $scope.tagFilters.indexOf(tagName);
		if (index>=0) {
			$scope.tagFilters.splice(index, 1);
			if ($scope.tagFilters.length===0) {
				tagService.resetTileColors();
			}
		} else {
			if (!keyboardService.shiftKeyDown) {
				$scope.tagFilters.splice(0, 1000);
			}
			$scope.tagFilters.push(tagName);
		}
		refreshFilters();
	};

	if (localStorage.hasOwnProperty('taggingController')) {
		$timeout(function() {
			var savedData = JSON.parse(localStorage.taggingController);
			savedData.tagWidgets.forEach(function(tagData) {
				var tagName = tagData.name,
					index = savedData.shortcuts.indexOf(tagName);
				if (index>=0) {
					$scope.createWidgetWithTag(tagName, index);
				} else {
					$scope.createWidgetWithTag(tagName);
				}
			});
		}, 2500);
	}

});

Pornographr.controller("GalleryController", function($rootScope, $scope, $location, $anchorScroll, $timeout, flickrAuth, flickrFactory, keyboardService, heatFactory, tagService) {

	Peekaboo.flickrFactory = flickrFactory;
	Peekaboo.galleryController = $scope;

	$scope.photoRows = flickrFactory.photoRows;
	$scope.isLoading = HeaderControls.isLoading;   // Is a BOOLEAN ko.observable
	$scope.isAutoScroll = false;
	$scope.tagFilters = tagService.tagFilters;
	$scope.activeImageId = null;

	var checkReadyToScroll,
		container = $("#container"),
		lastBookmarkImageId = null,
		m = $location.path().match(/\/(\d+)/);

	function init() {
		if (m) {
			var page = parseInt(m[1],10),
				photoId = $location.hash(),
				selector = null;
			if (photoId.length>0 && photoId!=='null') {
				lastBookmarkImageId = photoId;
				selector = "#"+photoId;
			} else if (photoId==='null' && localStorage.hasOwnProperty('firstVisibleRow')) {
				// If there is a null in the hash, this *always* automatically returns you to
				// the last position you you were viewing when you reload the site, which
				// means, to jump to a specific page, you must give it a url *without* a hash
				page = parseInt(localStorage.firstVisibleRow.split("_")[1]);
				lastBookmarkImageId = 'useLastPosition';
				selector = "#"+localStorage.firstVisibleRow;
				$location.path("/"+page);
			}
			if (selector!==null) {
				// Wait for the element to appear, then scroll to it.
				// If the element *never* appears, then the "lastImageRendered"
				// event callback will clear this check
				checkReadyToScroll = setInterval(function() {
					var el = $(selector);
					if (el.length>0) {
						clearInterval(checkReadyToScroll);
						lastBookmarkImageId = null;
						$scope.isAutoScroll = true;
						container.scrollTo(el, 500);
						var photo = flickrFactory.db[photoId];
						if (photo) {
							$scope.$apply(function() {
								expandPhoto(photo);
							});
						}
						setTimeout(function() {
							$scope.isAutoScroll = false;
						}, 1500);
					}
				}, 500);
			}
			flickrFactory.initOnPage($scope, page);
		} else {
			$location.path("/1");
			flickrFactory.initOnPage($scope, 1);
		}
	}

	var checkReady = setInterval(function(){
		if (flickrAuth.userid!==null) {
			init();
			clearInterval(checkReady);
		}
	}, 1000);

	var firstLoad = true;
	$scope.$on('lastImageRendered', function(renderFinishedEvent) {
		$scope.isLoading(false);
		$rootScope.$broadcast("refreshFilters");
		if (lastBookmarkImageId!==null) {
			setTimeout(function() {
				clearInterval(checkReadyToScroll);
				lastBookmarkImageId = null;
			}, 1000);
		}
		if (firstLoad) {
			container.trigger("scroll"); // To trigger the ability to select
			firstLoad = false;
		}
	});

	function expandPhoto(photo) {
		photo.ui.xpanded = true;
		var el = $("#"+photo.id);
		el.attr("src", photo.src.replace("_t", "_n"))
			.css({width: photo.size.w, height: photo.size.h})
			.addClass("imgExpanded");
	}

	function shrinkPhoto(photo) {
		photo.ui.xpanded = false;
		var el = $("#"+photo.id);
		el.attr("src", photo.src)
			.css({width: photo.size_thumb.w, height: photo.size_thumb.h})
			.removeClass("imgExpanded");
	}

	$scope.openOriginalLink = function(event, originalImageLink) {
		window.open(originalImageLink);
		keyboardService.altKeyDown = false; // BUG?!!
	};

	$scope.onImageDblClick = function(photo, photoIndex, photoRowId) {
		var expanding = !photo.ui.xpanded,
			currentHash = $location.hash(),
			pageNumber = photoRowId.split("_")[1];
		$scope.activeImageId = photo.id;
		if (expanding) {
			if (currentHash==="null") {
				$location.replace();
			}
			if (currentHash!==photo.id) {
				$location.path("/" + pageNumber);
				$location.hash(photo.id);
			}
			expandPhoto(photo);
			heatFactory.dataPoints.push([photoIndex, photoRowId])
		} else {
			shrinkPhoto(photo);
		}
	};

	$rootScope.$on("goToNextImage", function() {
		arrowNavigate(1);
	});

	$rootScope.$on("goToPreviousImage", function() {
		arrowNavigate(-1);
	});

	$scope.updateCurrentProgress = function() {
		// Called by ng-style from $("#loadedPages")
		var lower = flickrFactory.upPage,
			upper = flickrFactory.downPage,
			total = flickrFactory.totalPages,
			left = (lower/total*100).toFixed(2),
			width = ((upper-lower)/total*100).toFixed(2);
		// When the width becomes too narrow, just make sure it's pretty
		// and we have at least something to look at
		if ("0.10">width) width = "0.50";
		// When loading page 1, this value is ~0.86%, force it to zero
		if ("0.90">left) left = "0.00";
		return {left: left+"%", width: width+"%"};
	};

	function arrowNavigate(direction) {
		var stream = flickrFactory.stream,
			nextPhotoId;
		if ($scope.activeImageId===null) {
			nextPhotoId = stream[0];
		} else {
			var i = stream.indexOf($scope.activeImageId) + direction;
			if (i>=stream.length || i<0) {
				i = 0;
			}
			nextPhotoId = flickrFactory.stream[i]
		}
		$scope.activeImageId = nextPhotoId;
		$scope.$apply(function() {
			expandPhoto(flickrFactory.db[nextPhotoId]);
			container.scrollTo($("#"+nextPhotoId)[0], 600, {over:{top:-0.8, left:0}} );
		});
	}

	// In the so-called "Angular world", where is this *supposed* to go?
	window.addEventListener("popstate", function(e) {
		if ($location.hash()==="null") {
			return;
		}
		var photo = flickrFactory.db[$location.hash()];
		if (photo) {
			$scope.$apply(function() {
				expandPhoto(photo);
			});
			$scope.isAutoScroll = true;
			$anchorScroll();
			setTimeout(function() {
				$scope.isAutoScroll = false;
			}, 1500);
		}
	});

});