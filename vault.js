LATITUDE = WINDOW_HEIGHT*2;

function isVisible(top) {
	var a = -LATITUDE,
		b = WINDOW_HEIGHT+LATITUDE;
	return a<top==top<b;
}

app.directive('garbageCollect', function () {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			console.log(scope);
			var el = $(element),
				photoRow = scope.photoRow,
				last_update = Date.now();
			$("#container").scroll(function() {
				var top = el.offset().top,
					inFrame = isVisible(top);
				if (inFrame) {
					photoRow.alive=0;
				} else {
					if (Date.now()-last_update>250) {
						photoRow.alive+=1;
						last_update = Date.now();
					}
				}
			});
		}
	}
});


// Do something once the user is idle...
var idleTime = 0;
$(document).ready(function () {
	setInterval(function() {
		idleTime +=1;
		if (idleTime>5) {
			$scope.$apply();
			idleTime = 0;
		}
	}, 1000);

	$(document).mousemove(function (e) {
		idleTime = 0;
	});
	$(document).keypress(function (e) {
		idleTime = 0;
	});
});

// ---- OAuth stuff ---- //

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

var path="http://www.flickr.com/services/rest/";
var data = {
	oauth_nonce: uuid(),
	oauth_timestamp: Date.now(),
	oauth_consumer_key: CONSUMER_KEY,
	oauth_signature_method: "HMAC-SHA1",
	oauth_callback: "fuckerall",
	oauth_version: "1.0"
};

// Heatmap //

window.onload = function() {
	Heat = h337.create({"element":document.getElementById("heatmapArea"), "radius":8, "visible":true});
		Heat.get("canvas").onclick = function(ev){
			var pos = h337.util.mousePosition(ev);
			Heat.store.addDataPoint(pos[0],pos[1]);
		};
		document.getElementById("gen").onclick = function(){
			Heat.store.generateRandomDataSet(100);
		};
};

Pornographr.directive('inputBoxOps', function ($rootScope, flickrFactory) {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			$(element).on("submit", function(e) {
				var kv = scope.textValue.split(":"),
					key = $.trim(kv[0]),
					value = $.trim(kv[1]);
				if (key.match(/hide/)) {
					// Hide images matching tag
					flickrFactory.excludeTags.push(value);
				} else if (key.match(/set/)) {
					// TODO: Create a new set from selected
				} else if (key.match(/unhide/)) {
					// Unhide what was previously hidden
					var i = flickrFactory.excludeTags.indexOf(value);
					if (i>=0) {
						flickrFactory.excludeTags.splice(i,1);
					}
				} else if (key.match(/only/)) {
					// TODO: Show only photos matching tag
					$rootScope.$broadcast("matchOnly", value);
				} else if (key.match(/showall/)) {
					$rootScope.$broadcast("matchOnly", null);
				} else if (key.match(/tag/)) {
					var widget = {name: value};
					if (!has_key(scope.existingWidgets, widget.name)) {
						scope.existingWidgets[widget.name] = widget;
						scope.$apply(function() {
							scope.tagWidgets.push(widget);
						});
					}
					//$rootScope.$broadcast("tagSelected", value);
				}
			});
		}
	}
});