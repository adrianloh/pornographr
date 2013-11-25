"use strict";

var Flickr = angular.module('flickrFactory', ['flickrAuth']);

Flickr.factory("flickrFactory", function($http, $location, flickrAuth) {

	var factory = {},
		path="http://www.flickr.com/services/rest/",
		doNotRender = ['deleteme'],
		search_terms = null;

	factory.photoRows = [];
	factory.isBusyLoading = false;
	factory.screen_width = 0;    // Set by the controller;

	var currentPage = 0;

	var whichRowIdAmI = {}, // Maps a photoId ==> rowId
		idsInRow = {};          // Maps rowId ==> [list_of_photoIds_in_order_of_insertion]

	factory.photoIdsInRow = idsInRow;
	factory.whichRowIdAmI = whichRowIdAmI;

	factory.getCoordinatesOfPhotoId = function(photoId) {
		var rowId = whichRowIdAmI[photoId],
			index = idsInRow[rowId].indexOf(photoId);
		return [index,rowId];
	};

	function initDefaults() {
		factory.photoRows.splice(0,1000000);
		factory.db = {};
		factory.stream = [];
		factory.photoidOfLastImage = "";
		factory.tags = {};
		factory.tags.deleteme = {};
		factory.upPage = 0;
		factory.downPage = 0;
		factory.totalPages = 1;
	}

	initDefaults();

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
		if (search_terms!==null) {
			data2.tags = search_terms;
		}
		data2.api_sig = flickrAuth.sign(data2);
		$http({method: 'GET', url:path, params:data2}).then(function(res2) {
			var o = {
				doc: oParser.parseFromString(res2.data, "text/xml")
			};
			var res = o.doc.getElementsByTagName("rsp")[0];
			if (res.getAttribute("stat")==='ok') {
				callback(o);
			} else {
				console.error("ERROR: fetchPage page " + page);
			}
		});
	}

	factory.initOnPage = function(page) {
		factory.upPage = page;
		factory.downPage = page;
		currentPage = page;
		factory.fetchMoreImages(0);
	};

	factory.initSearch = function(commaDelitedTerms, page) {
		initDefaults();
		factory.upPage = page;
		factory.downPage = page;
		currentPage = page;
		search_terms = commaDelitedTerms;
		factory.fetchMoreImages(0);
	};

	factory.fetchMoreImages = function(direction) {
		if (factory.isBusyLoading) {
			return;
		}
		factory.isBusyLoading = true;
		if (direction>0) {
			factory.downPage+=1;
			currentPage = factory.downPage;
		} else if (direction<0) {
			factory.upPage-=1;
			factory.upPage = factory.upPage<=0 ? 1 : factory.upPage;
			currentPage = factory.upPage;
		}
		fetchPage(currentPage, 500, function(resp) {
			var doc = resp.doc,         // This is XML
				injectPhotos = [],
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
						tags: photo.getAttribute("tags").split(" ").map(function(s) { return s.toLowerCase(); }),
						updated: photo.getAttribute("lastupdate"),
						ui: {
							xpanded: false,
							deleted: false,
							dimwit: false,
							loadedFromPage: currentPage
						}
					};
					if (Set.intersection2(doNotRender, p.tags).length===0 && factory.db[p.id]===undefined) {
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
				factory.isBusyLoading = false;
			} else {
				renderImages(injectPhotos, currentPage, direction);
			}
		});
	};

	function renderImages(injectPhotos, currentP, direction) {
		var activeRow,
			method = direction >= 0 ? 'push' : 'unshift';
		if (method==='unshift') {
			injectPhotos.reverse();
			activeRow = factory.photoRows[0];
		} else {
			activeRow = factory.photoRows[factory.photoRows.length-1];
		}
		var currentWidth = factory.photoRows.length===0 ? 10000 : activeRow.images.map(function(p) { return p.size_thumb.w }).reduce(function(prev,curr) { return prev+curr });
		injectPhotos.forEach(function(photo, i) {
			currentWidth+=(photo.size_thumb.w+6);
			if (currentWidth>factory.screen_width) {
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

	factory.untagImage = function(photoId, tag, callback) {
		var imageTags = factory.db[photoId].tags, msg;
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
		$http({method: 'GET', url:path, params:data2}).success(function(res, status, headers, config) {
			if (res.stat==='ok') {
				var tagId = null;
				try {
					tagId = res.photo.tags.tag.filter(function(tagData) { return tagData.raw.toLowerCase()===tag.toLowerCase(); })[0].id;
				} catch(e) { }
				if (tagId!==null) {
					data2.method = 'flickr.photos.removeTag';
					data2.tag_id = tagId;
					delete data2.photo_id;
					delete data2.api_sig;
					data2.api_sig = flickrAuth.sign(data2);
					$http({method: 'POST', url:path, params:data2}).success(function(res, status, headers, config) {
						if (res.stat==='ok') {
							callback();
						} else {
							msg = "Could not remove tag " +  tag + " for photo " + photoId;
							callback({error: msg});
							console.error(msg);
						}
					});
				} else {
					msg = "Could not getInfo for photo " + photoId;
					callback({error:msg});
				}
			}
		});
	};

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