"use strict";

var Flickr = angular.module('flickrFactory', ['flickrAuth']);

Flickr.directive('onFinishImageRender', function ($timeout, flickrFactory) {
	return {
		restrict: 'A',
		link: function(scope, element, attrs) {
			$(element).one("load", function(e) {
				var photoId = element.attr("id");
				if (photoId===flickrFactory.photoidOfLastImage) {
					$timeout(function () {
						flickrFactory.isBusyLoading = false;
						flickrFactory.events.$broadcast("last_image_rendered");
					});
				}
			});
		}
	};
});

Flickr.factory("flickrFactory", function($rootScope, $http, $location, flickrAuth) {

	var _flickrFactory = {},
		path="http://www.flickr.com/services/rest/",
		doNotRender = ['deleteme', 'trash'],
		search_terms = null,
		flickrTags = [];

	_flickrFactory.photoRows = [];
	_flickrFactory.isBusyLoading = false;
	_flickrFactory.imagesPerGalleryLoad = 500;
	_flickrFactory.screen_width = 0;    // Set by the controller;
	_flickrFactory.blacklist = {};
	_flickrFactory.events = $rootScope.$new(true);

	var currentPage = 0,
		whichRowIdAmI = {},     // Maps a photoId ==> rowId
		idsInRow = {};          // Maps rowId ==> [list_of_photoIds_in_order_of_insertion]

	_flickrFactory.photoIdsInRow = idsInRow;
	_flickrFactory.whichRowIdAmI = whichRowIdAmI;

	_flickrFactory.getCoordinatesOfPhotoId = function(photoId) {
		var rowId = whichRowIdAmI[photoId],
			index = idsInRow[rowId].indexOf(photoId);
		return [index,rowId];
	};

	function initDefaults() {
		_flickrFactory.photoRows.splice(0,1000000);
		_flickrFactory.db = {};
		_flickrFactory.stream = [];
		_flickrFactory.photoidOfLastImage = "";
		_flickrFactory.tags = {};
		_flickrFactory.tags.deleteme = {};
		_flickrFactory.upPage = 0;
		_flickrFactory.downPage = 0;
		_flickrFactory.totalPages = 1;
		flickrTags.forEach(function(tag) {
			associateTagWithImage(tag.name, tag.count);
		});
	}

	initDefaults();

	function associateTagWithImage(tag, increment, photoId) {
		if (tag.length<=1 || tag.match(/vision:/)) {
			return;
		}
		if (_flickrFactory.tags[tag]===undefined) {
			_flickrFactory.tags[tag] = {};
			_flickrFactory.tags[tag].count = 0;
		}
		_flickrFactory.tags[tag].count+=increment;
		if (photoId) {
			_flickrFactory.tags[tag][photoId] = true;
		}
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

	_flickrFactory.initOnPage = function(page) {
		initDefaults();
		_flickrFactory.upPage = page;
		_flickrFactory.downPage = page;
		currentPage = page;
		_flickrFactory.fetchMoreImages(0);
	};

	_flickrFactory.initSearch = function(commaDelitedTerms, page) {
		initDefaults();
		_flickrFactory.upPage = page;
		_flickrFactory.downPage = page;
		currentPage = page;
		search_terms = commaDelitedTerms;
		_flickrFactory.fetchMoreImages(0);
	};

	_flickrFactory.fetchMoreImages = function(direction) {
		if (_flickrFactory.isBusyLoading) {
			return;
		}
		_flickrFactory.isBusyLoading = true;
		if (direction>0) {
			_flickrFactory.downPage+=1;
			currentPage = _flickrFactory.downPage;
		} else if (direction<0) {
			_flickrFactory.upPage-=1;
			_flickrFactory.upPage = _flickrFactory.upPage<=0 ? 1 : _flickrFactory.upPage;
			currentPage = _flickrFactory.upPage;
		}
		fetchPage(currentPage, _flickrFactory.imagesPerGalleryLoad, function(resp) {
			var doc = resp.doc,         // This is XML
				injectPhotos = [],
				photoXMLElements = doc.getElementsByTagName("photo");
			_flickrFactory.totalPages = parseInt(doc.getElementsByTagName("photos")[0].getAttribute("pages"),10);
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
					if (Set.intersection2(doNotRender, p.tags).length===0 && _flickrFactory.db[p.id]===undefined) {
						injectPhotos.push(p);
						p.tags.forEach(function(tag) {
							associateTagWithImage(tag, 1, p.id);
						});
					} else {
						_flickrFactory.blacklist[p.id] = true;
					}
				} catch(e) {
					console.error(e);
					/* In case the XML is malformed, or something fucked up */
				}
			});
			if (injectPhotos.length===0) {
				console.warn("_flickrFactory.fetchMoreImages got nothing to inject");
				_flickrFactory.isBusyLoading = false;
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
			activeRow = _flickrFactory.photoRows[0];
		} else {
			activeRow = _flickrFactory.photoRows[_flickrFactory.photoRows.length-1];
		}
		var currentWidth = _flickrFactory.photoRows.length===0 ? 10000 : activeRow.images.map(function(p) { return p.size_thumb.w }).reduce(function(prev,curr) { return prev+curr });
		injectPhotos.forEach(function(photo, i) {
			currentWidth+=(photo.size_thumb.w+6);
			if (currentWidth>_flickrFactory.screen_width) {
				currentWidth=0;
				activeRow = {
					id: "page_" + currentP + "_" + photo.id,
					images:[],
					alive: 0,
					hits: 0
				};
				_flickrFactory.photoRows[method](activeRow);
				idsInRow[activeRow.id] = [];
			}
			var photoId = photo.id;
			_flickrFactory.db[photoId] = photo;
			activeRow.images[method](photo);
			_flickrFactory.stream[method](photoId);

			whichRowIdAmI[photoId] = activeRow.id;
			idsInRow[activeRow.id][method](photoId);

			if (i===injectPhotos.length-1) {
				// Later on, the onFinishImageRender directive will check this variable
				// against itself so it can tell the application that this current "load"
				// has completed rendering
				_flickrFactory.photoidOfLastImage = photoId;
			}
		});
	}

	_flickrFactory.tagImage = function(photoId, tag) {
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
				_flickrFactory.db[photoId].tags.push(tag);
				associateTagWithImage(tag, 1, photoId);
			}
			return res;
		});
	};

	_flickrFactory.untagImage = function(photoId, tag, callback) {
		var msg,
			imageTags = _flickrFactory.db[photoId].tags,
			data2 = {
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
							imageTags.splice(imageTags.indexOf(tag),1);
							delete _flickrFactory.tags[tag][photoId];
							_flickrFactory.tags[tag].count-=1;
							callback();
						} else {
							msg = "Could not remove tag " +  tag + " from photo " + photoId;
							callback({error: msg});
							console.error(msg);
						}
					});
				} else {
					msg = "Could not get tagId for photo " + photoId;
					callback({error:msg});
				}
			} else {
				msg = "Could not getInfo for photo " + photoId;
				callback({error:msg});
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
			count: 100
		};
		data2.api_sig = flickrAuth.sign(data2);
		$http({method: 'GET', url:path, params:data2}).success(function(res, status, headers, config) {
			if (res.stat==='ok') {
				res.who.tags.tag.forEach(function(tag) {
					var o = {
						name: tag._content.toLowerCase(),
						count: parseInt(tag.count, 10)
					};
					// Save these tags so when we re-init, we can repopulate _flickrFactory.tags
					flickrTags.push(o);
					associateTagWithImage(o.name, o.count);
				});
			} else {
				console.error(res);
			}
		});
	}

	flickrAuth.authorized.then(function() {
		getUserTags();
	});

	return _flickrFactory;

});