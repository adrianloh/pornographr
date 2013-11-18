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
