CONSUMER_KEY="723cf7cc038ef544e04f58eeb4a6bf1c";
CONSUMER_SECRET="6020cfcb85a6b712";
USERID="45276723@N03";
OAUTH_TOKEN = '72157637855446934-209bfc0ef8429623';

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
	factory.whichRowAmI = {};
	factory.photosets = {};
	factory.tags['deleteme'] = {};
	factory.doNotRender = ['deleteme'];
	factory.tagImages = function(listOfPhotoIds, tag) {
		return listOfPhotoIds.map(function(photoId) {
			return factory.tagImage(photoId, tag);
		});
	};

	var MAX_PER_ROW = 15,
		currentPage = 0,
		currentRow = 0;

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

	factory.fetchMoreImages = function($scope, getrecent) {
		if ($scope.isLoading()) {
			return;
		}
		$scope.isLoading(true);
		var getRecent = typeof(getrecent)!=='undefined',
			getPage = getRecent ? 1 : currentPage+=1,
			data2 = {
				api_key: CONSUMER_KEY,
				auth_token: OAUTH_TOKEN,
				format: 'rest',
				method: 'flickr.photos.search',
				page: getPage,
				user_id: USERID,
				per_page: 500,
				content_type: 7,
				extras: 'url_n, url_o, last_update, tags',
				sort: 'date-posted-desc'
			};
		data2.api_sig = sign(data2);
		var oParser = new DOMParser();  // We're using XML vs JSON for this particular request because $http seems to cache it
		$http({method: 'GET', url:path, params:data2}).success(function(xml, status, headers, config) {
			var doc = oParser.parseFromString(xml, "text/xml"),
				res = doc.getElementsByTagName("rsp")[0],
				injectPhotos = [], stats;
			if (res.getAttribute("stat")==='ok') {
				stats = res.getElementsByTagName("photos")[0];
				factory.stats.totalPages = parseInt(stats.getAttribute("pages"),10);
				factory.stats.totalImages = parseInt(stats.getAttribute("total"), 10);
				// Normalize the XML into JS objects
				var photoXMLElements = doc.getElementsByTagName("photo");
				$.each(photoXMLElements, function(i, photo) {
					try {
						var p = {
							id: photo.getAttribute("id"),
							size: photo.getAttribute("width_n") + "x" + photo.getAttribute("height_n"),
							src: photo.getAttribute("url_n").replace("_n","_s"),
							o: photo.getAttribute("url_o"),
							tags: photo.getAttribute("tags").split(" "),
							updated: photo.getAttribute("lastupdate"),
							ui: {
								xpanded: false,
								deleted: false,
								dimwit: true
							}
						};
						if (p.tags.indexOf("deleteme")<0) {
							injectPhotos.push(p);
							p.tags.forEach(function(tag) {
								associateTagWithImage(tag, 1, p.id);
							});
						}
					} catch(e) { /*pass*/ }
				});

				if (getRecent) { injectPhotos.reverse(); }

				if (injectPhotos.length===0) {
					$scope.isLoading(false);
					return;
				}

				injectPhotos.forEach(function(photo, i) {
					var photoId = photo.id;
					if (typeof(factory.db[photoId])==='undefined') {
						factory.db[photoId] = photo;

						// TODO: Implement "getrecent" for tableRows method
						// var method = getRecent ? 'unshift' : 'push';
						// factory.photos[method](p);

						if (typeof(factory.photoRows[currentRow])==='undefined') {
							factory.photoRows[currentRow] = {
								images:[],
								alive: 0,
								hits: 0
							};
						}

						factory.photoRows[currentRow].images.push(photo);
						factory.whichRowAmI[photoId] = currentRow;
						factory.stream.push(photoId);

						if (factory.photoRows[currentRow].images.length > MAX_PER_ROW) {
							currentRow+=1;
						}
						if (currentPage===1 && i===0) {
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
		});
	};

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
			photo_id: photoId,
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

	_FlickrFactory = factory;

	return factory;

});