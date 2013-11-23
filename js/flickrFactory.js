"use strict";

var CONSUMER_KEY="723cf7cc038ef544e04f58eeb4a6bf1c";
var CONSUMER_SECRET="6020cfcb85a6b712";
var USERID="45276723@N03";
var OAUTH_TOKEN = "72157637855446934-209bfc0ef8429623";

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

var Flickr = angular.module('flickrFactory', []);

Flickr.factory("flickrFactory", function($http, $location) {

	var path="http://www.flickr.com/services/rest/";

	var factory = {};
	factory.db = {};
	factory.stats = {};
	factory.photoidOfLastImage = "";
	factory.photoRows = [];
	factory.stream = [];
	factory.tags = {};
	factory.photosets = {};
	factory.tags.deleteme = {};
	factory.doNotRender = ['deleteme'];
	factory.tagImages = function(listOfPhotoIds, tag) {
		return listOfPhotoIds.map(function(photoId) {
			return factory.tagImage(photoId, tag);
		});
	};

	factory.currentPage= 0;

	var MAX_WIDTH = $("#autopageContent").width()*0.8,
		currentWidth = 0,
		currentRow = 0;

	var m = $location.path().match(/\d+\/\d+/);
	if (m) {
		console.log(m);
	}

	function associateTagWithImage(tag, increment, photoId) {
		if (tag.length<=1 || tag.match(/vision:/)) {
			return;
		}
		if (factory.tags[tag]===undefined) {
			factory.tags[tag] = {};
			factory.tags[tag]._count = 0;
		}
		factory.tags[tag]._count+=increment;
		if (photoId) {
			factory.tags[tag][photoId] = true;
		}
	}

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

	function getLeader() {
		var data2 = {
			api_key: CONSUMER_KEY,
			auth_token: OAUTH_TOKEN,
			format: 'json',
			nojsoncallback: 1,
			method: 'flickr.photos.search',
			page: 1,
			user_id: USERID,
			per_page: 1,
			content_type: 7,
			sort: 'date-posted-desc'
		};
		data2.api_sig = sign(data2);
		return $http({method: 'GET', url:path, params:data2});
	}

	function fetchPage(page, perPage, callback) {
		var oParser = new DOMParser(),  // We're using XML vs JSON for this particular request because $http seems to cache it
			data2 = {
			api_key: CONSUMER_KEY,
			auth_token: OAUTH_TOKEN,
			format: 'rest',
			method: 'flickr.photos.search',
			page: page,
			user_id: USERID,
			per_page: perPage,
			content_type: 7,
			extras: 'url_n, url_o, url_t, last_update, tags',
			sort: 'date-posted-desc'
		};
		data2.api_sig = sign(data2);
		getLeader().then(function(res1) {
			$http({method: 'GET', url:path, params:data2}).then(function(res2) {
				var o = {
					context: res1.data,
					doc: oParser.parseFromString(res2.data, "text/xml")
				};
				var res = o.doc.getElementsByTagName("rsp")[0];
				if (res.getAttribute("stat")==='ok') {
					callback(o);
				}
			});
		});
	}

	factory.fetchMoreImages = function($scope, getrecent) {
		if ($scope.isLoading()) {
			return;
		}
		$scope.isLoading(true);
		var getRecent = getrecent!==undefined,
			getPage = getRecent ? 1 : factory.currentPage+=1;

		fetchPage(getPage, 500).then(function(resp) {
			var ctxt = resp.context,    // This is JSON
				doc = resp.doc,         // This is XML
				total = parseInt(ctxt.photos.total, 10),
				first = ctxt.photo[0].id,
				context = {
					page: getPage,
					first: first,
					total: total
				};
			var injectPhotos = [],
				photoXMLElements = doc.getElementsByTagName("photo");
			$.each(photoXMLElements, function(i, photo) {
				try {
					var p = {
						id: photo.getAttribute("id"),
						size: {w: parseInt(photo.getAttribute("width_n"),10), h: parseInt(photo.getAttribute("height_n"),10)},
						size_thumb: {w: parseInt(photo.getAttribute("width_t"),10), h: parseInt(photo.getAttribute("height_t"),10)},
						src: photo.getAttribute("url_t"),
						o: photo.getAttribute("url_o"),
						tags: photo.getAttribute("tags").split(" "),
						updated: photo.getAttribute("lastupdate"),
						context: context,
						ui: {
							xpanded: false,
							deleted: false,
							dimwit: false
						}
					};
					if (p.tags.indexOf("deleteme")<0) {
						injectPhotos.push(p);
						p.tags.forEach(function(tag) {
							associateTagWithImage(tag, 1, p.id);
						});
					}
				} catch(e) {
					/* In case the XML is malformed, or something fucked up */
				}
			});
			if (injectPhotos.length===0) {
				$scope.isLoading(false);
			} else {
				if (getRecent) { injectPhotos.reverse(); }
				renderImages(injectPhotos);
			}
		});
	};

	function renderImages(injectPhotos) {
		injectPhotos.forEach(function(photo, i) {
			currentWidth+=(photo.size_thumb.w+6);
			if (currentWidth>MAX_WIDTH) {
				currentWidth=0;
				currentRow+=1;
			}
			var photoId = photo.id;
			if (factory.db[photoId]===undefined) {
				factory.db[photoId] = photo;
				if (factory.photoRows[currentRow]===undefined) {
					factory.photoRows[currentRow] = {
						images:[],
						alive: 0,
						hits: 0
					};
				}

				factory.photoRows[currentRow].images.push(photo);
				factory.stream.push(photoId);

				if (factory.currentPage===1 && i===0) {
					// If this is the first load, then push it into the history stack
					$location.hash(photoId);
				}
				if (i===injectPhotos.length-1) {
					// Later on, the directive that fires when each image gets rendered
					// will check this variable against itself so it can tell the application
					// that this current "load" has completed rendering
					factory.photoidOfLastImage = photoId;
					saveFactory();
				}
			}
		});
	}


	factory.tagImage = function(photoId, tag) {
		var data2 = {
			api_key: CONSUMER_KEY,
			auth_token: OAUTH_TOKEN,
			format: 'json',
			nojsoncallback: 1,
			method: 'flickr.photos.addTags',
			photo_id: photoId,
			tags: tag
		};
		data2.api_sig = sign(data2);
		return $http({method: 'GET', url:path, params:data2}).success(function(res, status, headers, config) {
			if (res.stat==='ok') {
				factory.db[photoId].tags.push(tag);
				associateTagWithImage(tag, 1, photoId);
			}
			return res;
		});
	};

	factory.untagImage = function(photoId, tag) {
		var imageTags = factory.db[photoId].tags;
		imageTags.splice(imageTags.indexOf(tag),1);
		delete factory.tags[tag][photoId];
		var data2 = {
			api_key: CONSUMER_KEY,
			auth_token: OAUTH_TOKEN,
			format: 'json',
			nojsoncallback: 1,
			method: 'flickr.photos.getInfo',
			photo_id: photoId
		};
		data2.api_sig = sign(data2);
		return $http({method: 'GET', url:path, params:data2}).success(function(res, status, headers, config) {
			if (res.stat==='ok') {
				var tagId = null;
				try {
					tagId = res.photo.tags.tag.filter(function(tagData) { return tagData.raw===tag; })[0].id;
				} catch(e) { }
				if (tagId!==null) {
					data2.method = 'flickr.photos.removeTag';
					data2.tag_id = tagId;
					delete data2.photo_id;
					delete data2.api_sig;
					data2.api_sig = sign(data2);
					$http({method: 'POST', url:path, params:data2}).success(function(res, status, headers, config) {
						if (res.stat!=='ok') {
							console.error("Could not remove tag" +  tag + " for photo " + photoId);
						}
					});
				} else {
					console.error("Could not getInfo for photo " + photoId);
					console.error(res);
				}
			}
		});
	};

	function createPhotoSet(title, listOfPhotoIds) {
		var primaryPhotoId = listOfPhotoIds[0],
			data2 = {
				api_key: CONSUMER_KEY,
				auth_token: OAUTH_TOKEN,
				format: 'json',
				nojsoncallback: 1,
				method: 'flickr.photosets.create',
				primary_photo_id: primaryPhotoId,
				title: title
			};
		data2.api_sig = sign(data2);
		var oParser = new DOMParser();
		return $http({method: 'GET', url:path, params:data2}).success(function(xml, status, headers, config) {
			var doc = oParser.parseFromString(xml, "text/xml");
			return doc.getElementsByTagName("rsp")[0].getAttribute("stat")==='ok';
		});
	}

	(function getUserTags() {
		var data2 = {
			api_key: CONSUMER_KEY,
			auth_token: OAUTH_TOKEN,
			format: 'json',
			method: 'flickr.tags.getListUserPopular',
			user_id: USERID,
			nojsoncallback: 1,
			count: 50
		};
		data2.api_sig = sign(data2);
		$http({method: 'GET', url:path, params:data2}).success(function(res, status, headers, config) {
			if (res.stat==='ok') {
				res.who.tags.tag.forEach(function(tag) {
					associateTagWithImage( tag._content, parseInt(tag.count,10) );
				});
			} else {
				console.error(res);
			}
		});
	})();

	return factory;

});