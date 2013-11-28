"use strict";

var FlickrAuth = angular.module('flickrAuth', []);

FlickrAuth.factory("flickrAuth", function($http, $q) {

	var self = {},
		authorizeScreen = $("#authorizeScreen");
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

	function getAuthorizationUrl(callback) {
		var preFrobData = {
			api_key: self.key,
			format: 'json',
			nojsoncallback: 1,
			method: 'flickr.auth.getFrob'
		};
		preFrobData.api_sig = self.sign(preFrobData);
		$http({method: 'GET', url:"http://api.flickr.com/services/rest/", params: preFrobData}).then(function(resObject) {
			var _frob = resObject.data.frob._content,
				permissions = "delete",
				redirectData = {
					api_key: self.key,
					perms: permissions,
					frob: _frob
				},
				sig = self.sign(redirectData),
				redirect_url = "http://flickr.com/services/auth/?api_key=" + self.key + "&perms=" + permissions + "&frob=" + _frob + "&api_sig=" + sig;
			callback({
				frob: _frob,
				url: redirect_url
			});
		});
	}

	function getTokenFromFrob(frob, callback) {
		var getTokenData = {
				api_key: self.key,
				frob: frob,
				format: 'json',
				nojsoncallback: 1,
				method: 'flickr.auth.getToken'
			},
			request = {
				method: 'GET',
				url:"http://api.flickr.com/services/rest/",
				params: getTokenData
			},
			startTime = Date.now();
		getTokenData.api_sig = self.sign(getTokenData);
		var checkForAuthorization = setInterval(function() {
			$http(request).then(function(resObject) {
				var res = resObject.data;
				if (res.hasOwnProperty('auth')) {
					clearInterval(checkForAuthorization);
					callback(res)
				} else if ((Date.now()-startTime)>60000) {
					clearInterval(checkForAuthorization);
					callback({error: "Timedout waiting for user"});
				} else {
					console.warn("Still waiting for token, bub...");
				}
			});
		}, 5000);
	}

	var authorized = $q.defer();
	self.authorized = authorized.promise;
	self.authorized.then(function() {
		authorizeScreen.hide();
	});

	if (!localStorage.hasOwnProperty("auth_token")) {
		getAuthorizationUrl(function(res) {
			var frob = res.frob,
				url = res.url;
			$("#authorizeUrl").attr("href", url);
			authorizeScreen.show();
			console.log("Go here: " + url);
			getTokenFromFrob(frob, function(res) {
				var token = res.auth.token._content,
					userId = res.auth.user.nsid;
				localStorage.auth_token = self.token = token;
				localStorage.userid = self.userid = res.auth.user.nsid;
				authorized.resolve();
				console.log("TOKEN: " + self.token);
				console.log("USERID: " + self.userid);
			});
		});
	} else {
		self.userid = localStorage.userid;
		self.token = localStorage.auth_token;
		authorized.resolve();
	}



	return self;

});