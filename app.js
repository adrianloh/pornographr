CONSUMER_KEY="723cf7cc038ef544e04f58eeb4a6bf1c";
CONSUMER_SECRET="6020cfcb85a6b712";

// --------------------- UTILITIES ------------------------- //

function uuid() {
	var S4 = function () {
		return Math.floor(
			Math.random() * 0x10000 /* 65536 */
		).toString(16);
	};
	return (
		S4() + S4() + "-" +
			S4() + "-" +
			S4() + "-" +
			S4() + "-" +
			S4() + S4() + S4()
		);
}

function sign(params) {
	var data = [CONSUMER_SECRET],
		unsortedKeys = [],
		key;
	for (key in params) {
		unsortedKeys.push(key);
	}
	unsortedKeys.sort().forEach(function(key) {
		data.push(key);
		data.push(params[key]);
	});
	return MD5(data.join(""));
}

var path="http://www.flickr.com/services/rest/";
var data = {
	oauth_nonce: uuid(),
	oauth_timestamp: Date.now(),
	oauth_consumer_key: CONSUMER_KEY,
	oauth_signature_method: "HMAC-SHA1",
	oauth_callback: "fuckerall",
	oauth_version: "1.0"
};

var keys = {
		arrow_right: 39,
		arrow_left: 37,
		spacebar: 32,
		enter: 13,
		del: 46,
		backspace: 81112, // Don't intercept backspace, too risky
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
		esc: 27
	},
	boundKeys = $.map(keys, function(o) { return o; });

var HeaderControls = (function() {
	var self = {};
	self.isLoading = ko.observable(false);
	return self;
})();

ko.applyBindings(HeaderControls, document.getElementById("headerControls"));

// --------------------- MAIN ------------------------- //

var firebase = new Firebase('https://oogly.firebaseio-demo.com/');

var app = angular.module('myApp', ['pasvaz.bindonce']);

app.config(function ($anchorScrollProvider, $locationProvider) {
	$locationProvider.html5Mode(true);
	$anchorScrollProvider.disableAutoScrolling();
});

app.directive('onFinishImageRender', function ($timeout, flickrFactory) {
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

app.directive('autoloadContentOnScroll', function ($timeout, $location, flickrFactory) {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			var last_position = 0,
				resultsSection = $(element),
				autopageContent = $("#autopageContent"),
				applyChanges = $timeout(function() {
					scope.$apply();
				});
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

app.factory("flickrFactory", function($http, $location, $timeout) {

	var factory = {};
	factory.db = {};
	factory.photoidOfLastImage = "";
	factory.photoRows = [];

	var MAX_PER_ROW = 15,
		currentPage = 0,
		currentRow = 0;

	function saveFactory() {
		$.ajax({
			url: "https://smack.s3-ap-southeast-1.amazonaws.com/flickrLibrary.json",
			type: "PUT",
			headers: {
				"Cache-Control":"max-age=315360000",
				"x-amz-acl": "public-read-write",
				"x-amz-storage-class": "REDUCED_REDUNDANCY"
			},
			contentType: "application/json",
			data: JSON.stringify({photos:factory.photoRows}),
			success: function(results) {
				// pass
			}
		});
	}

	factory.fetchMoreImages = function($scope, getrecent) {
		if ($scope.isLoading()) {
			return;
		}
		$scope.isLoading(true);
		var getRecent = typeof(getrecent)!=='undefined',
			getPage = getRecent ? 1 : currentPage+=1,
			data2 = {
				api_key: CONSUMER_KEY,
				auth_token:'72157637621644456-7e21a10a78b52894',
				format: 'rest',
				method: 'flickr.photos.search',
				page: getPage.toString(),
				user_id: '45276723@N03',
				per_page: '500',
				content_type: '7',
				extras: 'url_n, url_o, last_update',
				sort: 'date-posted-desc'
			};
		data2.api_sig = sign(data2);
		var oParser = new DOMParser();
		$http({method: 'GET', url:path, params:data2}).success(function(xml, status, headers, config) {
			var doc = oParser.parseFromString(xml, "text/xml"),
				injectPhotos = [];
			if (doc.getElementsByTagName("rsp")[0].getAttribute("stat")==='ok') {
				// Normalize the XML into JS objects
				var photoXMLElements = doc.getElementsByTagName("photo");

				$.each(photoXMLElements, function(i, photo) {
					try {
						var p = {
							id: photo.getAttribute("id"),
							size: photo.getAttribute("width_n") + "x" + photo.getAttribute("height_n"),
							src: photo.getAttribute("url_n").replace("_n","_s"),
							o: photo.getAttribute("url_o"),
							updated: photo.getAttribute("lastupdate"),
							xpanded: false,
							deleted: false
						};
						injectPhotos.push(p);
					} catch(e) { /*pass*/ }
				});

				if (getRecent) { injectPhotos.reverse(); }

				if (injectPhotos.length===0) {
					$scope.isLoading(false);
					return;
				}

				var targetTable = getRecent ? [] : factory.photoRows;

				injectPhotos.forEach(function(photo, i) {
					var p = photo;
					if (typeof(factory.db[p.id])==='undefined') {
						factory.db[p.id] = p;

						// TODO: Implement "getrecent" for tableRows method
						// var method = getRecent ? 'unshift' : 'push';
						// factory.photos[method](p);

						if (typeof(factory.photoRows[currentRow])==='undefined') {
							factory.photoRows[currentRow] = {
								images:[],
								alive: 0
							};
						}
						factory.photoRows[currentRow].images.push(p);
						if (factory.photoRows[currentRow].images.length > MAX_PER_ROW) {
							currentRow+=1;
						}
						if (currentPage===1 && i===0) {
							// If this is the first load, then push it into the history stack
							$location.hash(p.id);
						}
						if (i===injectPhotos.length-1) {
							// Later on, the directive that fires when each image gets rendered
							// will check this variable against itself so it can tell the application
							// that this current "load" has completed rendering
							factory.photoidOfLastImage = p.id;
							saveFactory();
						}
					}
				});
			}
		});
	};

	return factory;

});

app.controller("GalleryController", function($scope, $location, $anchorScroll, $timeout, flickrFactory) {

	$scope.photoRows = flickrFactory.photoRows;
	$scope.isLoading = HeaderControls.isLoading;   // Is a BOOLEAN ko.observable

	// autoloadContentOnScroll directive watches this variable to know whether
	// a user is actually scrolling, or we're jumping around previous history states i.e
	// User jumps to a photo --> hashtag changes --> user jumps again (but the listener,
	// if faced with a non-null hashtag, thus will inject one into the stack, screwing everything
	// up. So if we set this to true, it will not inject the null state.
	$scope.isAutoScroll = false;

	$scope.$on('lastImageRendered', function(renderFinishedEvent) {
		$scope.isLoading(false);
		setTimeout(function() {
			$("#container").trigger("scroll");
		},250);
	});

	function expandPhoto(photo) {
		var d = photo.size.split("x"),
			width = d[0], height = d[1],
			el = $("#"+photo.id);
		el.attr("src", photo.src.replace("_s", "_n"))
			.css({width: width, height: height})
			.addClass("imgExpanded");
		photo.xpanded = true;
	}

	function shrinkPhoto(photo) {
		var el = $("#"+photo.id);
		el.attr("src", photo.src)
			.css({width: 75, height: 75})
			.removeClass("imgExpanded");
		photo.xpanded = false;
	}

	$scope.onImageDblClick = function(photo, event) {
		var el = $(event.target),
			expanding = !el.hasClass("imgExpanded"),
			currentHash = $location.hash();
		if (expanding) {
			if (currentHash==="null") {
				$location.replace();
			}
			if (currentHash!==photo.id) {
				$location.hash(photo.id);
			}
			expandPhoto(photo);
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

	$(document).keydown(function(e) {
		if (boundKeys.indexOf(e.keyCode)>=0) {
			switch (e.keyCode)
			{
				case keys.tilde:
					flickrFactory.fetchMoreImages($scope, true);
					break;
			}
			return;
		}
	});

});

var WINDOW_HEIGHT = $(window).height();
function isInsideViewport(top) {
	return -10<top==top<WINDOW_HEIGHT;
}

$("#container").scroll($.debounce(1500, function(){
	// The moment we stop scrolling, tag all images in the viewport with
	// a class that makes them selectable
	$(".imageInView").removeClass("imageinView");
	$("ul").filter(function(i,el) {
			return isInsideViewport($(el).offset().top);
		})
		.find("img")
		.addClass("imageinView");
}));

var _selectRange = false, _deselectQueue = [];
$( "#autopageContent" ).selectable({
	filter: ".imageinView",
	selecting: function (event, ui) {
		if (event.detail == 0) {
			_selectRange = true;
			return true;
		}
		if ($(ui.selecting).hasClass('ui-selected')) {
			_deselectQueue.push(ui.selecting);
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