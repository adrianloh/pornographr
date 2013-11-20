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

var Pornographr = angular.module('Pornographr', ['flickrFactory', 'pasvaz.bindonce']);

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
	}
});

Pornographr.directive('keyboardEvents', function ($document, $rootScope, flickrFactory) {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			var keys = {
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
					backslash: 191
				},
				boundKeyCodes = {},
				alphabets = {};
			for (var k in keys) {
				boundKeyCodes[keys[k]] = true;
			}
			for (var i=65;i<91;i++) {
				alphabets[i] = true;
				boundKeyCodes[i] = true;
			}

			var el = $("#tagInputBoxHolder"),
				input = $("#tagInputBox");
			$document.on("keydown", function(e) {
				var keyCode = e.keyCode;
				if (has_key(boundKeyCodes, keyCode)) {
					if (has_key(alphabets, keyCode)) {
						if (!el.is(":visible")) {
							el.show();
							input.focus();
						} else {
							if ($(document.activeElement)[0].tagName.toLowerCase()!=='input') {
								input.val("");
								input.focus();
							}
						}
					} else {
						switch (keyCode)
						{
							case keys.backslash:
								el.blur().hide();
								input.val("");
								e.preventDefault();
								break;
							case keys.tilde:
								flickrFactory.fetchMoreImages($scope, true);
								e.preventDefault();
								break;
							case keys.esc:
								$(".ui-selected").removeClass("ui-selected");
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
						}
					}
				}
			});
		}
	}
});

Pornographr.directive('selectionInteractions', function (tagService, flickrFactory) {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			// Enable selecting images that are visible
			var _selectRange = false, _deselectQueue = [];

			$(element).selectable({
				filter: ".imageInView",
				selected: function(event, ui) {
				//	console.log(ui);
				},
				selecting: function (event, ui) {
					if (event.detail == 0) {
						_selectRange = true;
						return true;
					}
					if (tagService.activeTag.length>0) {
						// If a tag is armed
						var tag = tagService.activeTag,
							photoId = ui.selecting.id;
						// If this image is already tagged with this keyword...
						if (has_key(flickrFactory.tags, tag)
							&& has_key(flickrFactory.tags[tag], photoId)) {
							$("#holder_" + photoId).addClass("imageHolderOK");
						} else {
							flickrFactory.tagImage(photoId, tag).then(function(resObject) {
								var res = resObject.data;
								if (res.stat==='ok') {
									flickrFactory.addTag(tag, 1, photoId);
									$("#holder_" + photoId).addClass("imageHolderOK");
								} else {
									$("#holder_" + photoId).addClass("imageHolderError");
								}
							});
						}
					} else {
						if ($(ui.selecting).hasClass('ui-selected')) {
							_deselectQueue.push(ui.selecting);
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
				resultsSection = $(element),
				autopageContent = $("#autopageContent"),
				applyChanges = $timeout(function() {
					scope.$apply();
				});
			function isInsideViewport(top) {
				return -10<top==top<WINDOW_HEIGHT;
			}
			var WINDOW_HEIGHT = $(window).height(),
				selectableClassName = "imageInView";
			resultsSection.scroll($.debounce(750, function() { // This regulates the amount of times this function is called
				// The moment we stop scrolling, tag all images in
				// the viewport with a class that makes them selectable
				$("."+selectableClassName).removeClass(selectableClassName);
				$("ul").filter(function(i,el) {
					return isInsideViewport($(el).offset().top);
				}).find("img").addClass(selectableClassName);
				$rootScope.$broadcast("viewIsRefreshed");
			}));
			resultsSection.scroll(function () {
				$timeout.cancel(applyChanges);
				if (!($location.hash()==="null") && !scope.isAutoScroll) {
					scope.$apply(function() {
						$location.hash('null');
					});
				}
				var pos = (autopageContent.position().top-resultsSection.height())*-1/resultsSection.height()/(autopageContent.height()/resultsSection.height());
				if (pos>last_position) {
					// User is scrolling down
					if (pos>=0.95) flickrFactory.fetchMoreImages(scope);
				} else {
					// User is scrolling up
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
				var kv = scope.textValue.split(":"),
					key = $.trim(kv[0]),
					value = $.trim(kv[1]);
				if (key.match(/hide/)) {
					// Hide images matching tag
				}  else if (key.match(/tag/)) {
					var widget = {name: value};
					if (!has_key(scope.existingWidgets, widget.name)) {
						scope.existingWidgets[widget.name] = widget;
						scope.$apply(function() {
							scope.tagWidgets.push(widget);
							scope.textValue = "tag: ";
						});
					}
				}
			});
		}
	}
});

Pornographr.factory("heatFactory", function(flickrFactory) {

	var factory = {},
		Heat;

	factory.dataPoints = ko.observableArray([]);

	var waitForRows = setInterval(function() {
		if ($(".photoRow").width()!==null) {
			launch();
			clearInterval(waitForRows);
		}
	}, 500);

	function launch() {

		var	el = $("#heatmapArea"),
			width_heat = el.width(),
			height_heat = el.height(),
			width_row = $(".photoRow").width(),
			width_cell = 80;

		Heat = h337.create({"element":document.getElementById("heatmapArea"), "radius":10, "visible":true});
		$("#container").scrollTo();

		Heat.get("canvas").onclick = function(ev){
			var pos = h337.util.mousePosition(ev),
				row = parseInt((pos[1]/height_heat)*(flickrFactory.photoRows.length-1), 10);
			$("#container").scrollTo($("#photorow_"+row)[0], 600);
		};

		Heat.newData = function(coor) {
			var x = coor[0] * width_cell,
				y = coor[1],
				elX = (x/width_row)*width_heat,
				elY = (y/flickrFactory.photoRows.length)*height_heat;
			Heat.store.addDataPoint(elX, elY);
		}

	}

	factory.refresh = function() {
		try {
			Heat.clear();
		} catch(e) { /* On first launch, Heat could still be undefined */ }
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
	return factory;

});

Pornographr.controller("TaggingController", function($rootScope, $scope, tagService) {

	$scope.existingWidgets = {};
	$scope.tagWidgets = [];
	$scope.tagFilters = tagService.tagFilters;
	$scope.activeTag = function() {
		return tagService.activeTag;
	};

	$scope.armTagWidget = function(tagName) {
		if (tagService.activeTag===tagName) {
			tagService.activeTag = "";
		} else {
			tagService.activeTag = tagName;
		}
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
	};

	$scope.toggleTagFilter = function(tagName) {
		var index = $scope.tagFilters.indexOf(tagName);
		if (index>=0) {
			$scope.tagFilters.splice(index, 1);
		} else {
			$scope.tagFilters.push(tagName);
		}
	};

});

Pornographr.controller("GalleryController", function($rootScope, $scope, $location, $anchorScroll, $timeout, flickrFactory, heatFactory, tagService) {

	$scope.photoRows = flickrFactory.photoRows;
	$scope.isLoading = HeaderControls.isLoading;   // Is a BOOLEAN ko.observable

	// autoloadContentOnScroll directive watches this variable to know whether
	// a user is actually scrolling, or we're jumping around previous history states i.e
	// User jumps to a photo --> hashtag changes --> user jumps again (but the listener,
	// if faced with a non-null hashtag, thus will inject one into the stack, screwing everything
	// up. So if we set this to true, it will not inject the null state.
	$scope.isAutoScroll = false;

	$scope.tagFilters = [];

	$rootScope.$on("viewIsRefreshed", function() {
		$scope.tagFilters = JSON.parse(JSON.stringify(tagService.tagFilters));
	});

	$scope.$on('lastImageRendered', function(renderFinishedEvent) {
		$scope.isLoading(false);
		heatFactory.refresh();
		$("#container").trigger("scroll"); // For the benefit of first load
	});

	$scope.blackout = function(photo) {
		if ($scope.tagFilters.length===0) {
			return false;
		} else {
			var blackout = false,
				i = $scope.tagFilters.length;
			while (i--) {
				var tag = $scope.tagFilters[i];
				if (!flickrFactory.tags.hasOwnProperty(tag)) {
					// No image is tagged, so blackout all
					blackout = true;
					break;
				} else if (flickrFactory.tags[tag][photo.id]===undefined) {
					// This image is not tagged
					blackout = true;
					break;
				}
			}
			return blackout;
		}
	};

	function expandPhoto(photo) {
		photo.xpanded = true;
		var d = photo.size.split("x"),
			width = d[0], height = d[1],
			el = $("#"+photo.id);
		el.attr("src", photo.src.replace("_s", "_n"))
			.css({width: width, height: height})
			.addClass("imgExpanded");
	}

	function shrinkPhoto(photo) {
		photo.xpanded = false;
		var el = $("#"+photo.id);
		el.attr("src", photo.src)
			.css({width: 75, height: 75})
			.removeClass("imgExpanded");
	}

	$scope.onImageDblClick = function(photo, event, photoIndex) {
		var el = $(event.target),
			expanding = !photo.xpanded,
			currentHash = $location.hash();
		if (expanding) {
			if (currentHash==="null") {
				$location.replace();
			}
			if (currentHash!==photo.id) {
				$location.hash(photo.id);
			}
			// Track how many times a row has been "hit" to generate heat map data
			flickrFactory.photoRows[flickrFactory.whichRowAmI[photo.id]].hits+=1;
			expandPhoto(photo);
			var rowIsThis = parseInt(el.parents("ul").attr("id").split("_")[1],10);
			heatFactory.dataPoints.push([photoIndex, rowIsThis])
		} else {
			shrinkPhoto(photo);
		}
	};

	$location.path('/');
	flickrFactory.fetchMoreImages($scope);

	// In the so-called "Angular world", where is this *supposed* to go?
	window.addEventListener("popstate", function(e) {
		if ($location.hash()==="null") {
			return;
		}
		var photo = flickrFactory.db[$location.hash()];
		if (typeof(photo)!=='undefined') {
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