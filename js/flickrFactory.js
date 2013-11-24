"use strict";

var Flickr = angular.module('flickrFactory', ['flickrAuth']);

Flickr.factory("flickrFactory", function($http, $location, flickrAuth) {

	var path="http://www.flickr.com/services/rest/";

	var factory = {};
	factory.db = {};
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

	var MAX_WIDTH = $("#autopageContent").width()*0.8,
		currentPage = 0;

	factory.upPage = 0;
	factory.downPage = 0;
	factory.totalPages = 1;

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
			api_key: flickrAuth.key,
			auth_token: flickrAuth.token,
			format: 'json',
			nojsoncallback: 1,
			method: 'flickr.photos.search',
			page: 1,
			user_id: flickrAuth.userid,
			per_page: 1,
			content_type: 7,
			sort: 'date-posted-desc'
		};
		data2.api_sig = flickrAuth.sign(data2);
		return $http({method: 'GET', url:path, params:data2});
	}

	function fetchPage(page, perPage, callback) {
		var oParser = new DOMParser(),  // We're using XML vs JSON for this particular request because $http seems to cache it
			data2 = {
			api_key: flickrAuth.key,
			auth_token: flickrAuth.token,
			format: 'rest',
			method: 'flickr.photos.search',
			page: page,
			user_id: flickrAuth.userid,
			per_page: perPage,
			content_type: 7,
			extras: 'url_n, url_o, url_t, last_update, tags',
			sort: 'date-posted-desc'
		};
		data2.api_sig = flickrAuth.sign(data2);
		getLeader().then(function(res1) {
			$http({method: 'GET', url:path, params:data2}).then(function(res2) {
				var o = {
					context: res1.data,
					doc: oParser.parseFromString(res2.data, "text/xml")
				};
				var res = o.doc.getElementsByTagName("rsp")[0];
				if (res.getAttribute("stat")==='ok') {
					callback(o);
				} else {
					console.error("ERROR: fetchPage page " + page);
				}
			});
		});
	}

	factory.initOnPage = function($scope, page) {
		factory.upPage = page;
		factory.downPage = page;
		currentPage = page;
		factory.fetchMoreImages($scope, 0);
	};

	factory.fetchMoreImages = function($scope, direction) {
		if ($scope.isLoading()) {
			return;
		}
		$scope.isLoading(true);
		if (direction>0) {
			factory.downPage+=1;
			currentPage = factory.downPage;
		} else if (direction<0) {
			factory.upPage-=1;
			factory.upPage = factory.upPage<=0 ? 1 : factory.upPage;
			currentPage = factory.upPage;
		}
		fetchPage(currentPage, 500, function(resp) {
			var ctxt = resp.context,    // This is JSON
				doc = resp.doc,         // This is XML
				total = parseInt(ctxt.photos.total, 10),
				first = ctxt.photos.photo[0].id,
				context = {
					page: currentPage,
					first: first,
					total: total
				};
			var injectPhotos = [],
				photoXMLElements = doc.getElementsByTagName("photo");
			factory.totalPages = parseInt(doc.getElementsByTagName("photos")[0].getAttribute("pages"),10);
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
					if (p.tags.indexOf("deleteme")<0 && factory.db[p.id]===undefined) {
						injectPhotos.push(p);
						p.tags.forEach(function(tag) {
							associateTagWithImage(tag, 1, p.id);
						});
					}
				} catch(e) {
					console.error(e);
					/* In case the XML is malformed, or something fucked up */
				}
			});
			if (injectPhotos.length===0) {
				console.warn("factory.fetchMoreImages got nothing to inject");
				$scope.isLoading(false);
			} else {
				renderImages(injectPhotos, currentPage, direction);
			}
		});
	};

	// For the benefit of fast lookups to get coordinate
	// points for generating heatmap
	var whichRowIdAmI = {},
		idsInRow = {};

	factory.getCoordinatesOfPhotoId = function(photoId) {
		var rowId = whichRowIdAmI[photoId],
			index = idsInRow[rowId].indexOf(photoId);
		return [index,rowId];
	};

	function renderImages(injectPhotos, currentP, direction) {
		var activeRow,
			currentWidth = MAX_WIDTH+1000,
			method = direction >= 0 ? 'push' : 'unshift';
		if (method==='unshift') {
			injectPhotos.reverse();
		}
		injectPhotos.forEach(function(photo, i) {
			currentWidth+=(photo.size_thumb.w+6);
			if (currentWidth>MAX_WIDTH) {
				currentWidth=0;
				activeRow = {
					id: "page_" + currentP + "_" + photo.id,
					images:[],
					alive: 0,
					hits: 0
				};
				factory.photoRows[method](activeRow);
				idsInRow[activeRow.id] = [];
			}
			var photoId = photo.id;
			factory.db[photoId] = photo;
			activeRow.images[method](photo);
			factory.stream[method](photoId);

			whichRowIdAmI[photoId] = activeRow.id;
			idsInRow[activeRow.id][method](photoId);

			if (i===injectPhotos.length-1) {
				// Later on, the directive that fires when each image gets rendered
				// will check this variable against itself so it can tell the application
				// that this current "load" has completed rendering
				factory.photoidOfLastImage = photoId;
			}
		});
	}

	factory.tagImage = function(photoId, tag) {
		var data2 = {
			api_key: flickrAuth.key,
			auth_token: flickrAuth.token,
			format: 'json',
			nojsoncallback: 1,
			method: 'flickr.photos.addTags',
			photo_id: photoId,
			tags: tag
		};
		data2.api_sig = flickrAuth.sign(data2);
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
			api_key: flickrAuth.key,
			auth_token: flickrAuth.token,
			format: 'json',
			nojsoncallback: 1,
			method: 'flickr.photos.getInfo',
			photo_id: photoId
		};
		data2.api_sig = flickrAuth.sign(data2);
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
					data2.api_sig = flickrAuth.sign(data2);
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
				api_key: flickrAuth.key,
				auth_token: flickrAuth.token,
				format: 'json',
				nojsoncallback: 1,
				method: 'flickr.photosets.create',
				primary_photo_id: primaryPhotoId,
				title: title
			};
		data2.api_sig = flickrAuth.sign(data2);
		var oParser = new DOMParser();
		return $http({method: 'GET', url:path, params:data2}).success(function(xml, status, headers, config) {
			var doc = oParser.parseFromString(xml, "text/xml");
			return doc.getElementsByTagName("rsp")[0].getAttribute("stat")==='ok';
		});
	}

	function getUserTags() {
		var data2 = {
			api_key: flickrAuth.key,
			auth_token: flickrAuth.token,
			format: 'json',
			method: 'flickr.tags.getListUserPopular',
			user_id: flickrAuth.userid,
			nojsoncallback: 1,
			count: 50
		};
		data2.api_sig = flickrAuth.sign(data2);
		$http({method: 'GET', url:path, params:data2}).success(function(res, status, headers, config) {
			if (res.stat==='ok') {
				res.who.tags.tag.forEach(function(tag) {
					associateTagWithImage( tag._content, parseInt(tag.count,10) );
				});
			} else {
				console.error(res);
			}
		});
	}

	var checkReady = setInterval(function() {
		if (flickrAuth.userid!==null) {
			getUserTags();
			clearInterval(checkReady);
		}
	}, 1000);

	return factory;

});