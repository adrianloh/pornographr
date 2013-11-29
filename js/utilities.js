function has_key(o,k) {
	return !(o[k]===undefined);
}

function regulateFunc(frequency, funcToRegulate) {
	var buffer = [], lastArgs, isexcuted = setTimeout(function() {},0);
	function regulatedFunc() {
		var _this = this;
		clearTimeout(isexcuted);
		isexcuted = setTimeout(function() {
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
}

function parseArguments(args) {
	// Figure out, if a function is given 2||3 arguments,
	// which is an options array, which is a callback
	var data = {
		options: null,
		callback: null
	};
	if (args.length===3) {
		data.options = args[1];
		data.callback = args[2];
	} else if (args.length===2) {
		var lastArg = args[1];
		console.log(lastArg);
		if (typeof(lastArg)==="function") {
			data.callback = lastArg;
		} else if (typeof(lastArg)==="object") {
			data.options = lastArg;
		}
	}
	return data;
}

var Set  = (function() {

	var self = {};

	self.sample = function(arr, size) {
		var shuffled = arr.slice(0), i = arr.length, min = i - size, temp, index;
		while (i-- > min) {
			index = Math.floor(i * Math.random());
			temp = shuffled[index];
			shuffled[index] = shuffled[i];
			shuffled[i] = temp;
		}
		return shuffled.slice(min);
	};

	self.randrange = function(minVal, maxVal, floatVal) {
		var randVal = minVal+(Math.random()*(maxVal-minVal));
		return floatVal===undefined ? Math.round(randVal) : randVal.toFixed(floatVal);
	};

	self.intersection1 = function(a, b) {
		var t;
		if (b.length > a.length) t = b, b = a, a = t; // indexOf to loop over shorter
		return a.filter(function (e) {
			if (b.indexOf(e) !== -1) return true;
		});
	};

	var largeArraySize = 30;

	function cachedContains(array, fromIndex, largeSize) {
		fromIndex || (fromIndex = 0);

		var length = array.length,
			isLarge = (length - fromIndex) >= (largeSize || largeArraySize);

		if (isLarge) {
			var cache = {},
				index = fromIndex - 1;

			while (++index < length) {
				// manually coerce `value` to a string because `hasOwnProperty`, in some
				// older versions of Firefox, coerces objects incorrectly
				var key = array[index] + '';
				(hasOwnProperty.call(cache, key) ? cache[key] : (cache[key] = [])).push(array[index]);
			}
		}
		return function(value) {
			if (isLarge) {
				var key = value + '';
				return hasOwnProperty.call(cache, key) && indexOf(cache[key], value) > -1;
			}
			return indexOf(array, value, fromIndex) > -1;
		}
	}

	function indexOf(array, value, fromIndex) {
		var index = -1,
			length = array ? array.length : 0;

		if (typeof fromIndex == 'number') {
			index = (fromIndex < 0 ? nativeMax(0, length + fromIndex) : fromIndex || 0) - 1;
		} else if (fromIndex) {
			index = sortedIndex(array, value);
			return array[index] === value ? index : -1;
		}
		while (++index < length) {
			if (array[index] === value) {
				return index;
			}
		}
		return -1;
	}

	self.intersection2 = function(array) {
		var args = arguments,
			argsLength = args.length,
			index = -1,
			length = array ? array.length : 0,
			cache = {},
			result = [];

		outer:
			while (++index < length) {
				var value = array[index];
				if (indexOf(result, value) < 0) {
					var argsIndex = argsLength;
					while (--argsIndex) {
						if (!(cache[argsIndex] || (cache[argsIndex] = cachedContains(args[argsIndex])))(value)) {
							continue outer;
						}
					}
					result.push(value);
				}
			}
		return result;
	};

	return self;

})();