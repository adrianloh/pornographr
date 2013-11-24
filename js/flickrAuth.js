var FlickrAuth = angular.module('flickrAuth', []);

FlickrAuth.factory("flickrAuth", function($http) {

	var self = {};
	self.key = "fdfd759b5d6dc97444c0757cd51b730e";
	self.secret = "03f13f18b10e2072";
	self.token = null;
	self.userid = null;
	self.sign = function(params) {
		var data = [self.secret],
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
	};
	if (!localStorage.hasOwnProperty("auth_token")) {
		$.getJSON("/authenticate", function(res) {
			var authorizePage = res.url,
				frob = res.frob,
				t1 = Date.now();
			window.open(authorizePage);
			var checkForToken = setInterval(function() {
				if (Date.now()-t1>60000) {
					console.error("Abort getting token");
					clearInterval(checkForToken);
				} else {
					$.getJSON("/gettoken/"+frob, function(res) {
						if (res.ok && self.token===null) {
							console.warn("Got auth_token:" + res.token);
							clearInterval(checkForToken);
							self.token = res.token;
							localStorage.auth_token = res.token;
							var data2 = {
								api_key: self.key,
								auth_token: self.token,
								format: 'json',
								nojsoncallback: 1,
								method: 'flickr.urls.getUserProfile'
							};
							data2.api_sig = self.sign(data2);
							$http({method: 'GET', url:"http://www.flickr.com/services/rest/", params:data2}).then(function(resObject) {
								self.userid = resObject.data.user.nsid;
								localStorage.userid = self.userid;
							});
						} else {
							console.error("Waiting for token...");
							console.error(res);
						}
					});
				}
			}, 5000);
		});
	} else {
		self.userid = localStorage.userid;
		self.token = localStorage.auth_token;
	}

	return self;

});