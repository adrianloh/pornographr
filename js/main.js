/*global $, ko, document, window */
"use strict";

var Proteus = angular.module('Proteus', ['flickrFactory', 'flickrAuth', 'pasvaz.bindonce']);

Proteus.config(function ($anchorScrollProvider, $locationProvider) {
	$locationProvider.html5Mode(true);
	$anchorScrollProvider.disableAutoScrolling();
});

Proteus.factory("utilityFunctions", function($timeout) {

	var _utilityFunctions = {};

	_utilityFunctions.regulateFunc = function(frequency, funcToRegulate) {
		var buffer = [], lastArgs, isexcuted = $timeout(function() {});
		function regulatedFunc() {
			var _this = this;
			$timeout.cancel(isexcuted);
			isexcuted = $timeout(function() {
				if (buffer.length>0 && buffer.slice(-1)[0]!==lastArgs) {
					funcToRegulate.apply(_this, buffer.splice(-1)[0]);
					buffer = [];
				}
			}, frequency);
			if (buffer.length===0) {
				funcToRegulate.apply(_this, arguments);
				lastArgs = arguments;
				buffer.push(arguments);
			} else {
				buffer.push(arguments);
			}
		}
		return regulatedFunc;
	};

	return _utilityFunctions;

});

Proteus.factory("heatFactory", function(flickrFactory) {

	var _heatFactory = {},
		Heat,
		heatSelector = "heatmapArea",
		rowSelector = ".photoRow",
		el = $("#" + heatSelector),
		container = $("#container");

	_heatFactory.dataPoints = [];

	var waitForRows = setInterval(function() {
		if ($(rowSelector).width()!==null) {
			launch();
			clearInterval(waitForRows);
		}
	}, 500);

	function launch() {

		var	width_heat = el.width()*0.95,
			height_heat = el.height()*0.95,
			width_row = $(rowSelector).width(),
			width_cell = 80;

		Heat = h337.create({
			"element": document.getElementById(heatSelector),
			"radius": 8,
			"visible": true
		});
		container.scrollTo();

		Heat.get("canvas").onclick = function(ev){
			var pos = h337.util.mousePosition(ev),
				row = parseInt((pos[1]/height_heat)*(flickrFactory.photoRows.length-1), 10);
			container.scrollTo($($(rowSelector)[row]), 600);
		};

		Heat.newData = function(coor) {
			// Where coor is [index_of_photo_in_row, id_of_row]
			var x = coor[0] * width_cell,
				y = $(rowSelector).index($("#"+coor[1])),
				elX = (x/width_row)*width_heat,
				elY = (y/flickrFactory.photoRows.length)*height_heat;
			Heat.store.addDataPoint(elX, elY);
		}

	}

	_heatFactory.drawFilterMap = function(listOfPhotoIds) {
		el.addClass("heatMapUnderFilter");
		Heat.clear();
		var i, coor;
		for (i=0; i<listOfPhotoIds.length; i++) {
			coor = flickrFactory.getCoordinatesOfPhotoId(listOfPhotoIds[i]);
			Heat.newData(coor);
		}
	};

	_heatFactory.refresh = function() {
		try {
			Heat.clear();
		} catch(e) {
			/* On first launch, Heat could still be undefined */
		}
		el.removeClass("heatMapUnderFilter");
		var i = _heatFactory.dataPoints.length;
		while (i--) {
			Heat.newData(_heatFactory.dataPoints[i]);
		}
	};

	_heatFactory.addHeatPoint = function(coor) {
		Heat.newData(coor);
	};

	return _heatFactory;

});

Proteus.factory("firebaseService", function($q, flickrAuth) {

	var firebase = new Firebase('https://oogly.firebaseio-demo.com/'),
		ready = $q.defer(),
		_firebaseService = {
			ready: ready.promise,
			userRef: null
		};

	flickrAuth.authorized.then(function() {
		var userRef = firebase.child(flickrAuth.userid);
		_firebaseService.userRef = userRef;
		ready.resolve(userRef);
	});

	return _firebaseService;

});

Proteus.directive('mouseTracker', function ($rootScope) {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			var el = $("#container"),
				toolTip = "#tagger-tooltip";

			el.mousemove($.debounce(250, function(e) {
				$rootScope.mouseX = e.pageX;
				$rootScope.mouseY = e.pageY;
			}));

			function annoyMouse(e) {
				$(toolTip).css('left', e.pageX + 0).css('top', e.pageY + 30).css('display', 'block');
			}

			scope.startWatchingMouse = function() {
				el.mousemove(annoyMouse);
			};

			scope.stopWatchingMouse = function() {
				el.unbind("mousemove", annoyMouse);
			};

			$("#heatmapArea").mouseenter(function() {
				$(toolTip).hide();
			});

		}
	};
});

Proteus.directive('myHeadIsSpinning', function (flickrFactory) {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			var mode = {true: 'show', false: 'hide', null: 'hide'};
			scope.$watch(function() {
				return flickrFactory.isBusyLoading;
			}, function(newVal, oldVal) {
				$(element)[mode[newVal]]();
			});
		}
	};
});

Proteus.directive('inputBoxOps', function ($rootScope, tagService) {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			$(element).on("submit", function(e) {
				var textInput = scope.textValue;
				if (textInput.match(/:/)) {
					var kv = textInput.split(":"), // textValue is the ng-model on $("#tagInputBox")
						key = $.trim(kv[0]),
						value = $.trim(kv[1]);
					if (key.match(/tag/)) {
						scope.createWidgetWithTag(value);
						scope.$apply(function() {
							// After we've grabbed the tagname, reset the box
							// to make it easier to enter the next one
							scope.textValue = "tag: ";
						});
					}
				} else {
					var selectedImages = $(".ui-selected");
					if (selectedImages.length>0) {
						$.each(selectedImages, function(i,el) {
							tagService.tagImage(el.getAttribute("id"), textInput);
						});
					} else {
						// This must be executed from GalleryController
						// or the ui won't update
						$rootScope.$broadcast("initSearch", textInput);
					}
				}
			});
		}
	}
});

Proteus.directive('keyboardEvents', function ($document, $rootScope, flickrFactory, tagService, keyboardService) {
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
					zero: 48,
					numpad_zero: 96
				},
				boundKeyCodes = {},
				alphabets = {},
				i, k, printName;
			for (k in keys) {
				boundKeyCodes[keys[k]] = true;
			}
			for (i=65;i<91;++i) {
				alphabets[i] = true;
				boundKeyCodes[i] = true;
			}
			for (i=49;i<58;++i) {   // Main keyboard 1 -> 9
				printName = (i-48).toString();
				tagService.shortcuts[i] = 'empty';
				tagService.shortcutAssignableKeyNames[i] = printName;
				boundKeyCodes[i] = true;
			}
			for (i=112;i<120;++i) { // F1 -> F8 keys
				printName = "F" + (i-111).toString();
				tagService.shortcuts[i] = 'empty';
				tagService.shortcutAssignableKeyNames[i] = printName;
				boundKeyCodes[i] = true;
			}
			for (i=97;i<106;++i) {  // Numpad 1 -> 9
				printName = "N" + (i-96).toString();
				tagService.shortcuts[i] = 'empty';
				tagService.shortcutAssignableKeyNames[i] = printName;
				boundKeyCodes[i] = true;
			}

			var inputBoxHolder = $("#tagInputBoxHolder"),
				inputBox = $("#tagInputBox");

			var editingShorcutForTag = null;
			$rootScope.$on("editingShortcutNumber", function(event, tagName) {
				// This is emitted from GalleryController
				editingShorcutForTag = tagName;
			});

			function toggleWidget(keyCode) {
				// This is a standalone function because it's triggered
				// by both keydown and keyup
				var tagName = tagService.shortcuts[keyCode];
				if (tagName!==undefined && tagName!==null && tagName!=='empty') {
					$rootScope.$broadcast("keyboardArmTag", {
						tag: tagName
					});
				}
			}

			function toggleHotbox() {
				var scrubberHolder = $("#scrubberHolder");
				if (!scrubberHolder.is(":visible")) {
					scrubberHolder.css({
						'left': $rootScope.mouseX,
						'top': $rootScope.mouseY
					}).show();
				} else {
					scrubberHolder.hide();
				}
			}

			var numberKeyIsUp = true,
				spacebarIsUp = true,
				lastKeyPlease = null,
				keyDownTime = Date.now();

			function isTypingIntoInputBox() {
				return $(document.activeElement)[0].tagName.toLowerCase()==='input';
			}

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
							if (!isTypingIntoInputBox()) {
								inputBox.val("");
								inputBox.focus();
							}
						}
					} else if (tagService.shortcutAssignableKeyNames.hasOwnProperty(keyCode)) {
						if (editingShorcutForTag!==null) {
							// We're assigning a shortcut
							var data = {tag: editingShorcutForTag, keyCode: keyCode};
							$rootScope.$broadcast("setShortcutNumber", data); // This is intercepted by GalleryController
							editingShorcutForTag = null;
							e.preventDefault();
						} else if (!isTypingIntoInputBox()) {
							// We're pressing on a shortcut key
							if (!numberKeyIsUp) return;
							numberKeyIsUp = false;
							keyDownTime = Date.now();
							toggleWidget(keyCode);
							e.preventDefault();
						}
					} else {
						switch (keyCode)
						{
							case keys.arrow_right:
								if (!isTypingIntoInputBox()) {
									$rootScope.$broadcast("goToNextImage", 1);
									e.preventDefault();
								}
								break;
							case keys.arrow_left:
								if (!isTypingIntoInputBox()) {
									$rootScope.$broadcast("goToNextImage", -1);
									e.preventDefault();
								}
								break;
							case keys.tilde:
								$rootScope.$broadcast("toggleTagCloud");
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
								if (!isTypingIntoInputBox()) {
									if (!spacebarIsUp) {
										e.preventDefault();
										return
									}
									spacebarIsUp = false;
									toggleHotbox();
									e.preventDefault();
								}
								break;
							case keys.backspace:
								if (!isTypingIntoInputBox()) {
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
				editingShorcutForTag = null;
				if (has_key(boundKeyCodes, keyCode)) {
					if (tagService.shortcutAssignableKeyNames.hasOwnProperty(keyCode)) {
						if (Date.now()-keyDownTime>500) {
							// We are temporarily activating a tag
							if (lastKeyPlease!==null) {
								toggleWidget(lastKeyPlease);
							}
						} else {
							// We are switching tags
							if (tagService.tagFilters.length===0) {
								lastKeyPlease = null
							} else {
								lastKeyPlease = keyCode;
							}
						}
						numberKeyIsUp = true;
					} else {
						switch (keyCode)
						{
							case keys.spacebar:
								if (!isTypingIntoInputBox()) {
									toggleHotbox();
								}
								spacebarIsUp = true;
								e.preventDefault();
								break;
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

Proteus.factory("keyboardService", function() {

	var _keyboardService = {};
	_keyboardService.altKeyDown = false;
	_keyboardService.shiftKeyDown = false;

	$(window).blur(function() {
		// When a user goes to another window, or switches tab
		// using shortcut keys, our event handler won't receive
		// the keydown event, so we gotta do it ourselves
		for (var k in _keyboardService) {
			if (typeof(_keyboardService[k])==='boolean') {
				_keyboardService[k] = false;
			}
		}
	});

	return _keyboardService;

});


/*------------------------------------------------------------------------------------*/
/*----------------------------------- TAGGING ----------------------------------------*/
/*------------------------------------------------------------------------------------*/

Proteus.directive('selectionInteractions', function (tagService, keyboardService, flickrFactory) {
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
								flickrFactory.untagImage(photoId, tag, function(error) {
									if (!error) {
										tagService.refreshFilters();
										deselect(self);
									} else {
										imageHolder.addClass("imageHolderError");
										setTimeout(function() {
											imageHolder.removeClass("imageHolderError");
											deselect(self);
										}, 250);
									}
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
							tagService.tagImage(photoId, tag);
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

Proteus.directive('draggableWidget', function () {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			var el = $(element);
			if (scope.isDoneRestoringTags) {
				el.attr("style","position:fixed; top:200px; left:20px");
			}
			el.draggable();
			el.dblclick(function(event) {
				// When a widget is double-clicked, remove all inline styles
				// from the element so it snaps back into the parent <ul> order
				el.attr("style","position: relative");
			});
		}
	}
});

Proteus.factory("tagService", function(flickrFactory, heatFactory, utilityFunctions) {

	var _tagService = {};
	_tagService.activeTag = "";
	_tagService.tagFilters = [];
	_tagService.mustContainAllTerms = true;
	_tagService.shortcutAssignableKeyNames = {}; // Keyboard directive will populate this

	_tagService.shortcuts = [];
	for (var i=49; i<106; ++i) {
		_tagService.shortcuts[i] = null;
	}

	_tagService.resetTileColors = function() {  // I don't like that this is here
		["imageHolderError", "imageHolderOK"].forEach(function(selector) {
			$("."+selector).removeClass(selector);
		});
	};

	_tagService.filteredByActiveTag = function() {
		return _tagService.tagFilters.indexOf(_tagService.activeTag)>=0;
	};

	var redrawHeatMap = utilityFunctions.regulateFunc(5000, function(qualifiedPhotos) {
		if (qualifiedPhotos) {
			heatFactory.drawFilterMap(qualifiedPhotos);
		} else {
			heatFactory.refresh();
		}
	});

	function refreshFilters() {
		if (_tagService.tagFilters.length>0) {
			var qualifiedPhotos = [];
			for (var photoId in flickrFactory.db) {
				var isTagged = [],
					photo = flickrFactory.db[photoId];
				_tagService.tagFilters.forEach(function(tag) {
					try {
						if (flickrFactory.tags[tag][photoId]!==undefined) {
							isTagged.push(true);
						}
					} catch(e) { /*pass*/ }
				});
				if (_tagService.mustContainAllTerms) {
					photo.ui.dimwit = isTagged.length===_tagService.tagFilters.length;
				} else {
					photo.ui.dimwit = isTagged.length>0;
				}
				if (photo.ui.dimwit) {
					qualifiedPhotos.push(photoId);
				}
			}
			redrawHeatMap(qualifiedPhotos);
		} else {
			redrawHeatMap();
		}
	}

	_tagService.tagImage = function(photoId, tag) {
		var el = $("#"+photoId),
			imageHolder = $("#holder_" + photoId);
		flickrFactory.tagImage(photoId, tag).then(function(resObject) {
			var res = resObject.data;
			if (res.stat==='ok' && res.tags.tag.length>0) {
				imageHolder.addClass("imageHolderOK");
				setTimeout(function() {
					imageHolder.removeClass("imageHolderOK");
					el.removeClass('ui-selecting').removeClass('ui-selected');
				}, 250);
				if (_tagService.filteredByActiveTag()) {
					_tagService.refreshFilters();
				}
			}
		});
	};

	_tagService.refreshFilters = utilityFunctions.regulateFunc(1250, refreshFilters);
	return _tagService;

});

Proteus.controller("TaggingController", function($rootScope, $scope, $timeout, utilityFunctions, firebaseService, heatFactory, flickrFactory, tagService, keyboardService) {

	$scope.existingWidgets = {};
	$scope.tagWidgets = [];
	$scope.shortcuts = tagService.shortcuts;
	$scope.tagFilters = tagService.tagFilters;
	$scope.activeTag = function() {
		return tagService.activeTag;
	};
	// The draggableWidget directive uses this to determine whether to "break" the widget out
	// of $("#tagList") when its created so its near the user. This is set to false right after
	// first load/restoring saved widgets.
	$scope.isDoneRestoringTags = false;

	/* tagWidget save and restore */

	var widgetsRef = null;

	firebaseService.ready.then(function(userRef) {
		widgetsRef = userRef.child("widgets");
		widgetsRef.once('value', function(snapshot) {
			var savedData = snapshot.val();
			if (savedData!==null) {
				savedData = JSON.parse(savedData);
				savedData.tagWidgets.forEach(function(tagName) {
					var index = savedData.shortcuts.indexOf(tagName);
					if (index>=0) {
						$scope.createWidgetWithTag(tagName, index);
					} else {
						$scope.createWidgetWithTag(tagName);
					}
				});
				setTimeout(function() {
					$scope.isDoneRestoringTags = true;
				}, 2500);
			}
		})
	});

	function persist() {
		if (widgetsRef===null) { return; }
		var saveData = {};
		saveData.tagWidgets = $scope.tagWidgets.map(function(o) { return o.name; });
		saveData.shortcuts = $scope.shortcuts;
		widgetsRef.set(JSON.stringify(saveData), function(error) {
			if (error) {
				console.error('widgets could not be saved.' + error);
			}
		});
	}

	/* tag cloud stuff */

	$scope.tagCloudIsVisible = false;
	$scope.tagsCurrentlyVisible = [];
	$scope.tagCloudList = [];
	$scope.tagHighScore = 1;

	$scope.toggleTagCloud = function() {
		var nextState = !$scope.tagCloudIsVisible;
		$timeout(function() {
			if (nextState===true) {
				refreshTags();
				recolorTags();
			}
			$scope.tagCloudIsVisible = nextState;
		});
	};

	$scope.getTagFontSize = function(count) {
		var size = ((count/$scope.tagHighScore)*6).toFixed(2);
		return {'font-size': size+"em"};
	};

	$rootScope.$on("viewIsRefreshed", function() {
		if ($scope.tagCloudIsVisible) {
			$timeout(recolorTags);
		}
	});

	$rootScope.$on("toggleTagCloud", $scope.toggleTagCloud);

	flickrFactory.events.$on("last_image_rendered", function() {
		if ($scope.tagCloudIsVisible) {
			$timeout(refreshTags);
		}
	});

	function recolorTags() {
		$scope.tagsCurrentlyVisible.splice(0,1000000);
		$(".imageInView").toArray().map(function(o) { return o.getAttribute("id") }).forEach(function(id) {
			var tagsOnImage = flickrFactory.db[id].tags;
			$scope.tagsCurrentlyVisible = $scope.tagsCurrentlyVisible.concat(tagsOnImage);
		});
	}

	function refreshTags() {
		$scope.tagCloudList.splice(0,10000);
		for (var tag in flickrFactory.tags) {
			var c = flickrFactory.tags[tag].count;
			if (c>$scope.tagHighScore) {
				$scope.tagHighScore = c;
			}
			$scope.tagCloudList.push({
				name: tag,
				count: c
			});
		}
	}

	/* tagging core */

	$scope.createWidgetWithTag = function(name, shortcutNumber) {
		// shortcutNumber is only passed in when we restore state
		// after we reload the site
		if (!$scope.existingWidgets.hasOwnProperty(name)) {
			var availableShortcutSlot,
				widget = {
				name: name
			};
			$scope.existingWidgets[widget.name] = widget;
			$timeout(function() {
				if (shortcutNumber===undefined) {
					availableShortcutSlot = $scope.shortcuts.map(function(o,i) {
						// Why 58? Because on the main keyboard, numbers 1-9 have
						// keycodes from 49 -> 57
						return (o==='empty' && i<58) ? "suckmebaby" : null;
					}).indexOf("suckmebaby");
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
				persist();
			});
		}
	};

	$scope.armTagWidget = function(tagName) {
		var actionArm;
		if (tagService.activeTag===tagName) {
			// Disarm
			tagService.activeTag = "";
			actionArm = false;
			$scope.stopWatchingMouse();
		} else {
			// Arm
			tagService.activeTag = tagName;
			actionArm = true;
			$scope.startWatchingMouse();
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
		var keyCode = data.keyCode,
			tagName = data.tag;
		$scope.$apply(function() {
			$scope.shortcuts[keyCode] = tagName;
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
			$scope.shortcuts[index] = 'empty';
		}
		persist();
	};

	$scope.filterVisibiltyIconStyle = function(tagName) {
		var iconStyle = 'icon-eye-close';
		if ($scope.tagFilters.indexOf(tagName)>=0) {
			if (tagService.mustContainAllTerms && $scope.tagFilters.length>1) {
				iconStyle = 'icon-link';
			} else {
				iconStyle = 'icon-eye-open';
			}
		}
		return iconStyle;
	};

	$scope.shortcutPrettyName = function(tagName) {
		var keyCode = $scope.shortcuts.indexOf(tagName);
		if (keyCode>=0 && tagService.shortcutAssignableKeyNames.hasOwnProperty(keyCode)) {
			return tagService.shortcutAssignableKeyNames[keyCode];
		} else {
			return "!";
		}
	};

	$scope.toggleTagFilter = function(tagName) {
		var index = $scope.tagFilters.indexOf(tagName);
		if (index>=0) {
			$scope.tagFilters.splice(index, 1);
			if ($scope.tagFilters.length===0) {
				tagService.resetTileColors();
			}
		} else {
			if (!keyboardService.shiftKeyDown && !keyboardService.altKeyDown) {
				// If no modifer keys are held down, then we're just switching
				// between filters, so, empty them out.
				$scope.tagFilters.splice(0, 1000);
			} else {
				tagService.mustContainAllTerms = !keyboardService.altKeyDown;
			}
			$scope.tagFilters.push(tagName);
		}
		tagService.refreshFilters();
	};

});


/*------------------------------------------------------------------------------------*/
/*-----------------------------------GALLERY -----------------------------------------*/
/*------------------------------------------------------------------------------------*/

Proteus.directive('autoloadContentOnScroll', function ($timeout, $location, flickrFactory, galleryService, $rootScope) {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			var last_position = 0,
				scrollingContainer = $(element),
				autopageContent = $("#autopageContent");

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
				var rowsInView = $("ul.photoRow").filter(function(i,el) {
					return isInsideViewport($(el).offset().top);
				});

				// Tag all images in the visible rows as selectable
				rowsInView.find("img").addClass(selectableClassName);
				$rootScope.$broadcast("viewIsRefreshed");

				// Save our position
				var lastSeenIds = rowsInView.slice(1,3).map(function(i,o) {
					var rowId = o.getAttribute("id");
					return flickrFactory.photoIdsInRow[rowId];
				}).toArray().filter(function(o) {
						return o!==undefined;
					});
				if (lastSeenIds.length>0) {
					var firstPhotoId = lastSeenIds[0],
						photoObject = flickrFactory.db[firstPhotoId];
					localStorage.lastPagePosition = photoObject.ui.loadedFromPage;
					localStorage.lastSeenIds = lastSeenIds;
				} else {
					delete localStorage.lastPagePosition;
					delete localStorage.lastSeenIds;
				}
			}));

			scrollingContainer.scroll(function () {
				if (!($location.hash()==="null") && !galleryService.isAutoScroll) {
					scope.$apply(function() {
						$location.hash('null');
					});
				}
				var pos1 = (autopageContent.position().top-scrollingContainer.height())*-1/scrollingContainer.height(),
					pos = pos1/(autopageContent.height()/scrollingContainer.height());
				if (pos>last_position) {
					// User is scrolling down
					if (pos>=0.95) {
						flickrFactory.fetchMoreImages(1);
					}
				} else {
					// User is scrolling up
					if (pos1===1) {
						flickrFactory.fetchMoreImages(-1);
					}
				}
				last_position = pos;
			});

		}
	}
});

Proteus.factory('galleryService', function($timeout, $rootScope, $location, flickrFactory) {

	var _galleryService = {};
	var afterFirstRenderCallback = null;

	flickrFactory.events.$on("last_image_rendered", function() {
		if (typeof(afterFirstRenderCallback)==='function') {
			afterFirstRenderCallback();
			afterFirstRenderCallback = null;
		}
	});

	_galleryService.isAutoScroll = false;
	_galleryService.container = $("#container");

	// For expandPhoto and shrinkPhoto, we're not using angular's
	// data binding cause we don't want it listening to this property
	// cause we'll end up with thousands of it
	_galleryService.ui = {
		expandPhoto: function(photo) {
			photo.ui.xpanded = true;
			var el = $("#"+photo.id);
			el.attr("src", photo.src.replace("_t", "_n"))
				.css({width: photo.size.w, height: photo.size.h})
				.addClass("imgExpanded");
		},
		shrinkPhoto: function(photo) {
			photo.ui.xpanded = false;
			var el = $("#"+photo.id);
			el.attr("src", photo.src)
				.css({width: photo.size_thumb.w, height: photo.size_thumb.h})
				.removeClass("imgExpanded");
		}
	};

	_galleryService.updateUrl = function(data) {
		var currentHash = $location.hash(),
			hash = null,
			prefix,
			title = "";

		if (currentHash==="null") {
			$location.replace();
		}

		if (data.hasOwnProperty('keyword')) {
			prefix = "/search/" + data.keyword + "/";
			title += "Search for " + data.keyword + " | ";
		} else {
			prefix = "/stream/";
			title += "Photostream | "
		}

		title += "Page " + data.page + " | ";

		if (data.hasOwnProperty('photoId')) {
			hash = data.photoId;
			title += "Image " + data.photoId;
		}

		$location.path(prefix + data.page);
		if (hash!==null) $location.hash(hash);
		$rootScope.mainTitle = title;

	};


	var lastTopOffset = -10000;
	_galleryService.scrollTo = function() {
		var argv = parseArguments(arguments),
			elementId = arguments[0],
			default_option = {offset:{top: -100, left:0}},
			animation_option = argv.options!==null ? argv.options : default_option,
			el = $(elementId),
			photoId = $location.hash(),
			skip = false,
			expandAfterWards = false;
		if (el.length>0) {
			if (el.offset().top===lastTopOffset) {
				skip = true;
			}
			if (el.hasClass("galleryPhoto")) {
				expandAfterWards = true;
				photoId = el.attr("id");
			}
			if (expandAfterWards===false &&
				typeof(photoId)==='string' &&
				flickrFactory.db.hasOwnProperty(photoId)) {
				expandAfterWards = true;
			}
			if (!skip) {
				if (expandAfterWards) {
					animation_option.onAfter = function() {
						_galleryService.ui.expandPhoto(flickrFactory.db[photoId]);
					}
				}
				_galleryService.isAutoScroll = true;
				_galleryService.container.scrollTo(el, 250, animation_option);
				setTimeout(function() {
					_galleryService.isAutoScroll = false;
				}, 1500);
			} else {
				if (expandAfterWards) {
					_galleryService.ui.expandPhoto(flickrFactory.db[photoId]);
				}
			}
			lastTopOffset = el.offset().top;
		} else {
			var msg = 'Could not find $("' + elementId + '") to scroll to';
			console.error(msg);
			if (argv.callback!==null) argv.callback({error:msg});
		}
	};

	_galleryService.restoreLastPosition = function() {
		var lastSeenRowId = findLastPosition();
		if (lastSeenRowId!==null) {
			_galleryService.scrollTo("#"+lastSeenRowId);
		} else {
			console.warn("findLastPosition: Failed to find last restore position");
		}
	};

	_galleryService.loadPage = function() {
		// From the location url, figure out the position to load from the url, whether
		// we're loading:
		// 1) A specific photo that was last expanded
		// 2) We were just scrolling around (restore the last seen row)
		// 3) Restoring a previous search
		var m = $location.path().match(/\/(stream|search).+\d+/);
		if (m) {
			var args = $location.path().split("/"),
				page = parseInt(args.slice(-1),10),
				isStream = args[1]==='stream',
				search_term = isStream ? null : args[2],
				photoId = $location.hash();
			if (photoId.length>0 && photoId!=='null') {
				// We are restoring a photo
				afterFirstRenderCallback = function() {
					_galleryService.scrollTo("#"+photoId);
				};
			} else if (photoId==='null' && localStorage.hasOwnProperty('lastPagePosition')) {
				// We are restoring a "general area" the user was last looking at
				// Warning: If there is '#null' in the hash, this will *always* return you to
				// the last location you were viewing when you left the site *irregardless*
				// of which page you're requesting at load. Which means, to jump to a specific page,
				// you must give it a url *without* a hash
				page = parseInt(localStorage.lastPagePosition, 10);
				afterFirstRenderCallback = function() {
					_galleryService.restoreLastPosition();
				};
			}
			if (isStream) {
				_galleryService.updateUrl({page:page});
				flickrFactory.initOnPage(page);
			} else {
				_galleryService.updateUrl({keyword: search_term, page:page});
				flickrFactory.initSearch(search_term, page);
			}
		} else {
			_galleryService.updateUrl({page:1});
			flickrFactory.initOnPage(1);
		}
	};

	_galleryService.goToPage = function(data) {
		_galleryService.updateUrl(data);
		$timeout(function() {
			_galleryService.loadPage();
		},500);
	};

	function findLastPosition() {
		var moveToRowId = null, totals = {}, rowId;
		if (localStorage.hasOwnProperty('lastSeenIds')) {
			localStorage.lastSeenIds.split(",").forEach(function(photoId) {
				var rowId = flickrFactory.whichRowIdAmI[photoId];
				if (rowId!==undefined) {
					if (!totals.hasOwnProperty(rowId)) {
						totals[rowId] = 0;
					}
					totals[rowId]+=1;
				}
			});
			if (!$.isEmptyObject(totals)) {
				var currentHighScore = 0,
					currentWinner = null;
				for (rowId in totals) {
					if (totals[rowId]>currentHighScore) {
						currentHighScore = totals[rowId];
						currentWinner = rowId;
					}
				}
				if (currentHighScore>0) {
					moveToRowId = currentWinner;
				}
			}
		}
		return moveToRowId;
	}

	return _galleryService;

});

Proteus.controller("GalleryController", function($window, $rootScope, $scope, $location, $timeout, flickrAuth, flickrFactory, galleryService, keyboardService, heatFactory, tagService) {

	$scope.photoRows = flickrFactory.photoRows;
	$scope.tagFilters = tagService.tagFilters;
	$scope.activeImageId = null;

	var container = galleryService.container;

	flickrAuth.authorized.then(function() {
		// TODO: How to move these two DOM references away into a directive?
		container.show();
		flickrFactory.screen_width = $("#autopageContent").width()*0.8;
		galleryService.loadPage();
	});

	var firstLoad = true;
	flickrFactory.events.$on("last_image_rendered", function() {
		tagService.refreshFilters();
		if (firstLoad) {
			container.trigger("scroll"); // To trigger the ability to select
			firstLoad = false;
		}
	});

	$rootScope.$on("initSearch", function(event, search_term) {
		var page = 1;
		galleryService.updateUrl({
			keyword: search_term,
			page: page
		});
		flickrFactory.initSearch(search_term, page);
	});

	$scope.openOriginalLink = function(event, originalImageLink) {
		$window.open(originalImageLink);
	};

	$scope.onImageDblClick = function(photo, photoIndex, photoRowId) {
		var expanding = !photo.ui.xpanded,
			pageNumber = photoRowId.split("_")[1];
		$scope.activeImageId = photo.id;
		if (expanding) {
			galleryService.updateUrl({
				photoId: photo.id,
				page: pageNumber
			});
			galleryService.ui.expandPhoto(photo);
			heatFactory.addHeatPoint([photoIndex, photoRowId]);
		} else {
			galleryService.ui.shrinkPhoto(photo);
		}
	};

	$scope.shrinkPhoto = galleryService.ui.shrinkPhoto;

	$scope.updateCurrentProgress = function() {
		// Called by ng-style from $("#loadedPages")
		// to draw the horizontal progress bar
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

	$rootScope.$on("goToNextImage", function arrowNavigate(event, direction) {
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
			galleryService.scrollTo("#"+nextPhotoId);
		});
	});

	// In the so-called "Angular world", where is this *supposed* to go?
	$window.addEventListener("popstate", function(e) {
		var hash = $location.hash();
		if (typeof(hash)==='string') {
			var selector = "#" + hash;
			if ($(selector).length!==0) {
				var opt = {offset:{top:0, left:0}};
				galleryService.scrollTo(selector, opt);
			} else if (hash!=='null') {
//				galleryService.loadPage();
			}
		}
	});

});


/*------------------------------------------------------------------------------------*/
/*----------------------------------- HOTBOX -----------------------------------------*/
/*------------------------------------------------------------------------------------*/

Proteus.directive('scrubberMousePosition', function () {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			$(element).mousemove(function(e) {
				scope.$apply(function() {
					scope.model.mouseX = e.offsetX;
				});
			});
		}
	};
});

Proteus.controller("ScrubberController", function($rootScope, $scope, $timeout, keyboardService, flickrTrack, flickrFactory, galleryService) {

	$scope.model = {
		mouseX: 0
	};

	$scope.thumbnails = [
		{id:null, page:1, src:"/img/slip.png"},
		{id:null, page:1, src:"/img/slip.png"},
		{id:null, page:1, src:"/img/slip.png"}
	];

	function push(photos) {
		$timeout(function() {
			photos.slice(0,3).forEach(function(t,i) {
				$scope.thumbnails[i].id = t.id;
				$scope.thumbnails[i].page = t.page;
				$scope.thumbnails[i].src = t.src;
			});
		});
	}

	flickrTrack.loaded.then(function() {
		push(flickrTrack.thumbnails[0]);
	});

	$scope.refreshThumbs = function() {
		var photos = flickrTrack.thumbnails[$scope.model.mouseX];
		if (photos!==undefined) { push(photos); }
	};

	$scope.goToPage = function(goToPage, photoId) {
		var page, photo, photos, jumpDest;
		if (photoId!==undefined) {
			photo = {
				id: photoId,
				page: goToPage
			};
		} else {
			photos = flickrTrack.thumbnails[$scope.model.mouseX];
			if (photos!==undefined) {
				photo = photos[0];
			}
		}
		if (photo!==undefined) {
			page = Math.ceil((photo.page*flickrTrack.imagesToFetchPerPage)/flickrFactory.imagesPerGalleryLoad);
			galleryService.goToPage({
				page: page,
				photoId: photo.id
			});
		} else {
			console.error("Cannot derive page");
		}

	};

});