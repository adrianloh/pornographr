"use strict";

Flickr.factory("flickrTrack", function($q, $http, $timeout, flickrAuth) {

	var factory = {},
		path="http://www.flickr.com/services/rest/",
		imagesRequiredForTrack = 500; // The number of thumbnails in the "timeline"

	factory.timelineReady = false;
	factory.thumbnails = [];
	factory.imagesToFetchPerPage = 25;
	var load = $q.defer();
	factory.loaded = load.promise;

	function getOne(page, limit) {
		var perPage = limit===undefined ? factory.imagesToFetchPerPage : limit,
			data2 = {
			api_key: flickrAuth.key,
			auth_token: flickrAuth.token,
			format: 'json',
			nojsoncallback: 1,
			method: 'flickr.photos.search',
			page: page,
			user_id: flickrAuth.userid,
			per_page: perPage,
			content_type: 7,
			extras: 'url_q',
			sort: 'date-posted-desc'
		};
		data2.api_sig = flickrAuth.sign(data2);
		return $http({method: 'GET', url:path, params:data2});
	}

	function injectThumbnail(index, pageOrigin, flickrPhotosList) {
		factory.thumbnails[index] = flickrPhotosList.map(function(p) {
			setTimeout(function() {
				var img = new Image();
				img.src = p.url_q;
			}, 50);
			return {
				id: p.id,
				page: pageOrigin,
				src: p.url_q
			}
		});
	}

	function getCache(firstPhotoId, totalImages) {
		var newCache = null,
			cache = localStorage['scrubberCache'];
			if (cache!==undefined) {
				cache = JSON.parse(cache);
				if (cache.firstPhotoId===firstPhotoId && cache.totalImages===totalImages) {
					newCache = cache.thumbnails;
				}
			}
		return newCache;
	}

	flickrAuth.authorized.then(function() {

		getOne(1,1).then(function(resObj) {
			var res = resObj.data,
				totalImagesInStream = res.photos.pages,
				// totalPages *MUST* not be over 10k or you'll hit flickr's limit!
				totalPages = Math.ceil(totalImagesInStream/factory.imagesToFetchPerPage),
				// Get photos from every n-th page
				pageInterval = totalPages/imagesRequiredForTrack,
				pagesToGrabFrom = Array(imagesRequiredForTrack).join().split(',').map(function(e,i) { return Math.floor(i*pageInterval); }).slice(1),
				firstPhoto = res.photos.photo[0],
				cache = getCache(firstPhoto.id, totalImagesInStream),
				bigFatPromise;

			if (totalImagesInStream<1000) return;

			pagesToGrabFrom = [1].concat(pagesToGrabFrom);

			var lastPage = 1,
				randomizedPages = pagesToGrabFrom.map(function(page, i) {
				if (i===0) return page;
				var nextPage = pagesToGrabFrom[i+1],
					x = Set.randrange(lastPage, nextPage-1);
				lastPage = x+1;
				return x;
			});

			if (cache===null) {
				bigFatPromise = $q.all(randomizedPages.map(function(page,index) {
					var req = $q.defer();
					$timeout(function() {
						getOne(page).then(function(resObj) {
							var ok = true,
								res = resObj.data,
								photos = [];
							if (res.stat==='ok' && res.photos.photo.length>0) {
								photos = Set.sample(res.photos.photo,5);
							} else {
								photos = [{id:'0000000000', url_q: "/img/slip.png"}];
								ok = false;
							}
							injectThumbnail(index, page, photos);
							if (ok) {
								req.resolve();
							} else {
								req.reject(res);
							}
						});
					}, index*250); // Use exponential backoff to retrieve this so we don't block the ui
					return req.promise;
				}));
			} else {
				var d = $q.defer();
				bigFatPromise = d.promise;
				cache.forEach(function(photos) {
					factory.thumbnails.push(photos);
				});
				d.resolve();
			}

			bigFatPromise.then(function onSuccess() {
				var saveData = {};
				console.log("Timeline ready all ok: " + factory.thumbnails.length);
				factory.timelineReady = true;
				saveData.totalImages = totalImagesInStream;
				saveData.firstPhotoId = firstPhoto.id;
				saveData.thumbnails = factory.thumbnails;
				localStorage['scrubberCache'] = JSON.stringify(saveData);
				load.resolve();
			}, function onFailure(res) {
				console.warn("Timeline ready with errors: " + factory.thumbnails.length);
				console.log(res);
			});

		});

	});

	return factory;

});